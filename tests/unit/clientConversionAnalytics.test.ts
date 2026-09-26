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
  sendGtagEvent,
  type AnalyticsLocation,
  type ClientConversionAnalytics,
  type ClientConversionEventName,
} from '../../src/infrastructure/analytics/clientConversionAnalytics';

const directLocation = (): AnalyticsLocation => ({
  pathname: '/',
  search: '',
  referrer: '',
  host: 'carve.test',
});

function createHarness(options?: {
  measurementId?: string;
  location?: AnalyticsLocation;
  clock?: () => number;
}) {
  const sent: Array<{ name: ClientConversionEventName; params: Record<string, string> }> = [];
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

describe('client conversion analytics', () => {
  afterEach(() => {
    document.getElementById('carve-ga4-gtag')?.remove();
    delete (window as Window & { gtag?: unknown; dataLayer?: unknown }).gtag;
    delete (window as Window & { dataLayer?: unknown }).dataLayer;
  });

  it('reads direct, referrer, and utm session source without keeping the raw referrer URL', () => {
    expect(readSessionSource(directLocation()).session_source).toBe('direct');

    expect(
      readSessionSource({
        pathname: '/',
        search: '',
        referrer: 'https://Instagram.com/stories/carve?utm_source=secret',
        host: 'carve.test',
      })
    ).toMatchObject({
      session_source: 'instagram.com',
      referrer: 'instagram.com',
    });

    expect(
      readSessionSource({
        pathname: '/',
        search: '?utm_source=ig&utm_medium=social&utm_campaign=spring&utm_content=bio&utm_term=ski',
        referrer: 'https://carve.test/cabinet',
        host: 'carve.test',
      })
    ).toEqual({
      session_source: 'ig',
      landing_path: '/',
      utm_source: 'ig',
      utm_medium: 'social',
      utm_campaign: 'spring',
      utm_content: 'bio',
      utm_term: 'ski',
    });
  });

  it('emits landing_view once and keeps the first-touch source on later events', () => {
    const harness = createHarness({
      location: {
        pathname: '/',
        search: '?utm_source=ig&utm_medium=social',
        referrer: '',
        host: 'carve.test',
      },
    });
    harness.analytics.init();
    harness.analytics.trackLandingView();
    harness.analytics.trackLandingView();
    harness.analytics.trackCourseView({ course_id: 'course_1' });

    expect(harness.installed).toEqual([CARVE_PRODUCTION_GA4_MEASUREMENT_ID]);
    expect(harness.sent.map((event) => event.name)).toEqual(['landing_view', 'course_view']);
    expect(harness.sent[0]?.params).toMatchObject({
      session_source: 'ig',
      utm_source: 'ig',
      utm_medium: 'social',
      landing_path: '/',
    });
    expect(harness.sent[1]?.params).toMatchObject({
      course_id: 'course_1',
      session_source: 'ig',
      utm_source: 'ig',
    });
  });

  it('emits instructor_view once per instructor and course_view once per course', () => {
    const { analytics, sent } = createHarness();
    analytics.trackInstructorView({ instructor_id: 'ins_1', surface: 'catalogue' });
    analytics.trackInstructorView({ instructor_id: 'ins_1', surface: 'reviews' });
    analytics.trackInstructorView({ instructor_id: 'ins_2', surface: 'reviews' });
    analytics.trackCourseView({ course_id: 'course_1' });
    analytics.trackCourseView({ course_id: 'course_1' });

    expect(sent).toEqual([
      expect.objectContaining({
        name: 'instructor_view',
        params: expect.objectContaining({ instructor_id: 'ins_1', surface: 'catalogue' }),
      }),
      expect.objectContaining({
        name: 'instructor_view',
        params: expect.objectContaining({ instructor_id: 'ins_2', surface: 'reviews' }),
      }),
      expect.objectContaining({
        name: 'course_view',
        params: expect.objectContaining({ course_id: 'course_1' }),
      }),
    ]);
  });

  it('emits booking_start for a lesson and a course without completion or payment events', () => {
    const harness = createHarness();
    harness.analytics.trackBookingStart({
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    harness.setNow(1_050);
    harness.analytics.trackBookingStart({
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    harness.setNow(2_000);
    harness.analytics.trackBookingStart({
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    harness.analytics.trackBookingStart({
      product_type: 'course',
      product_id: 'course_9',
      course_id: 'course_9',
    });

    expect(harness.sent.map((event) => event.name)).toEqual([
      'booking_start',
      'booking_start',
      'booking_start',
    ]);
    expect(harness.sent[0]?.params).toMatchObject({
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    expect(harness.sent[2]?.params).toMatchObject({
      product_type: 'course',
      product_id: 'course_9',
      course_id: 'course_9',
    });
    expect(harness.sent.some((event) => event.name === ('booking_complete' as never))).toBe(false);
    expect(harness.sent.some((event) => event.name === ('paid' as never))).toBe(false);
  });

  it('does not treat server-confirmed facts as client events and skips sends without a measurement id', () => {
    expect(CLIENT_CONVERSION_EVENT_NAMES).toEqual([
      'landing_view',
      'instructor_view',
      'course_view',
      'booking_start',
    ]);
    for (const name of SERVER_CONFIRMED_CONVERSION_EVENT_NAMES) {
      expect(isClientEmittedConversionEvent(name)).toBe(false);
    }
    expect(isClientEmittedConversionEvent('booking_complete')).toBe(false);
    expect(isClientEmittedConversionEvent('paid')).toBe(false);

    const quiet = createHarness({ measurementId: '' });
    quiet.analytics.init();
    quiet.analytics.trackLandingView();
    quiet.analytics.trackBookingStart({
      product_type: 'lesson',
      product_id: 'ins_1',
      instructor_id: 'ins_1',
    });
    expect(quiet.sent).toEqual([]);
    expect(quiet.installed).toEqual([]);

    const client: ClientConversionAnalytics = quiet.analytics;
    expect(client).not.toHaveProperty('trackBookingComplete');
    expect(client).not.toHaveProperty('trackPaid');
  });

  it('installs gtag for the configured measurement id and forwards custom events', () => {
    installGtagScript(CARVE_PRODUCTION_GA4_MEASUREMENT_ID, {
      session_source: 'ig',
      landing_path: '/',
      utm_source: 'ig',
      utm_medium: 'social',
      utm_campaign: 'spring',
    });

    const script = document.getElementById('carve-ga4-gtag');
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect((script as HTMLScriptElement).src).toContain(
      `id=${encodeURIComponent(CARVE_PRODUCTION_GA4_MEASUREMENT_ID)}`
    );
    expect(window.dataLayer?.length).toBeGreaterThanOrEqual(2);

    const gtag = vi.fn();
    window.gtag = gtag;
    sendGtagEvent('booking_start', { product_type: 'lesson', product_id: 'ins_1' });
    expect(gtag).toHaveBeenCalledWith('event', 'booking_start', {
      product_type: 'lesson',
      product_id: 'ins_1',
    });
  });
});
