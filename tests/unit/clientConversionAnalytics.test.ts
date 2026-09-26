import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CARVE_PRODUCTION_GA4_MEASUREMENT_ID,
  CLIENT_CONVERSION_EVENT_NAMES,
  SERVER_CONFIRMED_CONVERSION_EVENT_NAMES,
  createClientConversionAnalytics,
  createMemoryStorage,
  installGtagScript,
  isClientEmittedConversionEvent,
  readSessionSource,
  resolveClientMeasurementId,
  sendGtagEvent,
  type AnalyticsLocation,
  type ClientConversionAnalytics,
  type ClientConversionEventName,
} from '../../src/infrastructure/analytics/clientConversionAnalytics';

const directLocation = (): AnalyticsLocation => ({
  pathname: '/',
  search: '',
});

function createHarness(options?: {
  measurementId?: string;
  location?: AnalyticsLocation;
  clock?: () => number;
}) {
  const sent: Array<{ name: ClientConversionEventName; params: Record<string, string | number> }> =
    [];
  const installed: string[] = [];
  let now = 1_000;
  const analytics = createClientConversionAnalytics({
    measurementId: options?.measurementId ?? CARVE_PRODUCTION_GA4_MEASUREMENT_ID,
    send: (name, params) => {
      sent.push({ name, params });
    },
    storage: createMemoryStorage(),
    readLocation: () => options?.location ?? directLocation(),
    clock: options?.clock ?? (() => now),
    installGtag: (measurementId) => {
      installed.push(measurementId);
    },
  });
  return {
    analytics,
    sent,
    installed,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('client conversion analytics contract', () => {
  afterEach(() => {
    document.getElementById('carve-ga4-gtag')?.remove();
    delete (window as Window & { gtag?: unknown; dataLayer?: unknown }).gtag;
    delete (window as Window & { dataLayer?: unknown }).dataLayer;
  });

  it('uses G-XYMQS9SRDM when the env measurement id is empty', () => {
    expect(resolveClientMeasurementId(undefined)).toBe('G-XYMQS9SRDM');
    expect(resolveClientMeasurementId('  ')).toBe(CARVE_PRODUCTION_GA4_MEASUREMENT_ID);
    expect(resolveClientMeasurementId('G-OTHER')).toBe('G-OTHER');
  });

  it('maps UTM onto source, medium, and campaign and leaves them empty when absent', () => {
    expect(readSessionSource(directLocation())).toEqual({
      source: '',
      medium: '',
      campaign: '',
      page_path: '/',
    });

    expect(
      readSessionSource({
        pathname: '/',
        search: '?utm_source=ig&utm_medium=social&utm_campaign=spring&utm_content=bio&utm_term=ski',
      })
    ).toEqual({
      source: 'ig',
      medium: 'social',
      campaign: 'spring',
      page_path: '/',
    });
  });

  it('emits session_source once with only the contract params', () => {
    const harness = createHarness({
      location: {
        pathname: '/landing',
        search: '?utm_source=ig&utm_medium=social',
      },
    });
    harness.analytics.init();
    harness.analytics.trackSessionSource();
    harness.analytics.trackSessionSource();

    expect(harness.installed).toEqual([CARVE_PRODUCTION_GA4_MEASUREMENT_ID]);
    expect(harness.sent).toEqual([
      {
        name: 'session_source',
        params: {
          source: 'ig',
          medium: 'social',
          campaign: '',
          page_path: '/landing',
        },
      },
    ]);
  });

  it('emits instructor_view and course_view with id params only', () => {
    const harness = createHarness();
    harness.analytics.trackInstructorView({ instructor_id: 'ins_1' });
    harness.setNow(2_000);
    harness.analytics.trackInstructorView({ instructor_id: 'ins_1' });
    harness.analytics.trackCourseView({ course_id: 'course_1' });
    harness.analytics.trackInstructorView({ instructor_id: '  ' });
    harness.analytics.trackCourseView({ course_id: '' });
    const { sent } = harness;

    expect(sent).toEqual([
      { name: 'instructor_view', params: { instructor_id: 'ins_1' } },
      { name: 'instructor_view', params: { instructor_id: 'ins_1' } },
      { name: 'course_view', params: { course_id: 'course_1' } },
    ]);
  });

  it('emits booking_start with product_kind and optional ids, never completion or payment', () => {
    const harness = createHarness();
    harness.analytics.trackBookingStart({
      product_kind: 'lesson',
      instructor_id: 'ins_1',
    });
    harness.setNow(1_050);
    harness.analytics.trackBookingStart({
      product_kind: 'lesson',
      instructor_id: 'ins_1',
    });
    harness.setNow(2_000);
    harness.analytics.trackBookingStart({
      product_kind: 'course',
      course_id: 'course_9',
      participant_count: 2,
    });
    harness.analytics.trackBookingStart({
      product_kind: 'lesson',
      instructor_id: 'ins_2',
      participant_count: 0,
    });

    expect(harness.sent).toEqual([
      {
        name: 'booking_start',
        params: { product_kind: 'lesson', instructor_id: 'ins_1' },
      },
      {
        name: 'booking_start',
        params: { product_kind: 'course', course_id: 'course_9', participant_count: 2 },
      },
      {
        name: 'booking_start',
        params: { product_kind: 'lesson', instructor_id: 'ins_2' },
      },
    ]);
    const forbidden = ['booking_complete', 'paid', 'landing_view', 'product_type', 'product_id'];
    expect(harness.sent.some((event) => forbidden.includes(event.name))).toBe(false);
    for (const event of harness.sent) {
      expect(event.params).not.toHaveProperty('email');
      expect(event.params).not.toHaveProperty('phone');
      expect(event.params).not.toHaveProperty('name');
      expect(event.params).not.toHaveProperty('product_type');
      expect(event.params).not.toHaveProperty('product_id');
      expect(event.params).not.toHaveProperty('surface');
    }
  });

  it('does not treat server-confirmed facts as client events and skips sends without a measurement id', () => {
    expect(CLIENT_CONVERSION_EVENT_NAMES).toEqual([
      'session_source',
      'instructor_view',
      'course_view',
      'booking_start',
    ]);
    for (const name of SERVER_CONFIRMED_CONVERSION_EVENT_NAMES) {
      expect(isClientEmittedConversionEvent(name)).toBe(false);
    }
    expect(isClientEmittedConversionEvent('landing_view')).toBe(false);
    expect(isClientEmittedConversionEvent('booking_complete')).toBe(false);
    expect(isClientEmittedConversionEvent('paid')).toBe(false);

    const quiet = createHarness({ measurementId: '' });
    quiet.analytics.init();
    quiet.analytics.trackSessionSource();
    quiet.analytics.trackBookingStart({ product_kind: 'lesson', instructor_id: 'ins_1' });
    expect(quiet.sent).toEqual([]);
    expect(quiet.installed).toEqual([]);

    const client: ClientConversionAnalytics = quiet.analytics;
    expect(client).not.toHaveProperty('trackBookingComplete');
    expect(client).not.toHaveProperty('trackPaid');
    expect(client).not.toHaveProperty('trackLandingView');
  });

  it('installs gtag for G-XYMQS9SRDM and forwards the contract event', () => {
    installGtagScript(CARVE_PRODUCTION_GA4_MEASUREMENT_ID, {
      source: 'ig',
      medium: 'social',
      campaign: 'spring',
      page_path: '/',
    });

    const script = document.getElementById('carve-ga4-gtag');
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect((script as HTMLScriptElement).src).toContain(
      `id=${encodeURIComponent(CARVE_PRODUCTION_GA4_MEASUREMENT_ID)}`
    );

    const gtag = vi.fn();
    window.gtag = gtag;
    sendGtagEvent('booking_start', { product_kind: 'lesson', instructor_id: 'ins_1' });
    expect(gtag).toHaveBeenCalledWith('event', 'booking_start', {
      product_kind: 'lesson',
      instructor_id: 'ins_1',
    });
  });
});
