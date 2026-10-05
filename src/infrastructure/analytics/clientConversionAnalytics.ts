/**
 * Client conversion measurement (CA-CONV-ANALYTICS-001).
 *
 * Event contract from Carve Firebase. Names and params are exact. Do not add
 * aliases. `booking_complete` and `paid` are server-confirmed facts and are
 * not emitted here.
 *
 * measurementId: G-XYMQS9SRDM, unless `VITE_FIREBASE_MEASUREMENT_ID` is set.
 *
 * Client events:
 * - session_source { source, medium, campaign, page_path }
 * - instructor_view { instructor_id }
 * - course_view { course_id }
 * - booking_start { product_kind, instructor_id?, course_id?, participant_count? }
 *
 * Never put email, phone, or name in params.
 */

export const CLIENT_ANALYTICS_MEASUREMENT_ENV = 'VITE_FIREBASE_MEASUREMENT_ID' as const;

export const CARVE_PRODUCTION_GA4_MEASUREMENT_ID = 'G-XYMQS9SRDM' as const;

export const CLIENT_CONVERSION_EVENT_NAMES = [
  'session_source',
  'instructor_view',
  'course_view',
  'booking_start',
] as const;

export type ClientConversionEventName = (typeof CLIENT_CONVERSION_EVENT_NAMES)[number];

/** Server-owned. Not sent by this client. */
export const SERVER_CONFIRMED_CONVERSION_EVENT_NAMES = ['booking_complete', 'paid'] as const;

export type ServerConfirmedConversionEventName =
  (typeof SERVER_CONFIRMED_CONVERSION_EVENT_NAMES)[number];

export type BookingProductKind = 'lesson' | 'course';

export interface SessionSourceParams {
  source: string;
  medium: string;
  campaign: string;
  page_path: string;
}

export interface InstructorViewInput {
  instructor_id: string;
}

export interface CourseViewInput {
  course_id: string;
}

export interface BookingStartInput {
  product_kind: BookingProductKind;
  instructor_id?: string;
  course_id?: string;
  participant_count?: number;
}

export interface AnalyticsLocation {
  pathname: string;
  search: string;
}

type AnalyticsParams = Record<string, string | number>;

type AnalyticsSender = (eventName: ClientConversionEventName, params: AnalyticsParams) => void;

const STORAGE_KEY = 'carve:client-conversion-analytics:v2';
const GTAG_SCRIPT_ID = 'carve-ga4-gtag';
const PARAM_MAX_LENGTH = 100;
const DUPLICATE_COLLAPSE_MS = 500;

export function isClientEmittedConversionEvent(name: string): name is ClientConversionEventName {
  return (CLIENT_CONVERSION_EVENT_NAMES as readonly string[]).includes(name);
}

export function resolveClientMeasurementId(envValue: string | undefined): string {
  const trimmed = typeof envValue === 'string' ? envValue.trim() : '';
  return trimmed || CARVE_PRODUCTION_GA4_MEASUREMENT_ID;
}

export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

/** UTM fields only. Missing values stay empty strings. Referrer is not a source alias. */
export function readSessionSource(location: AnalyticsLocation): SessionSourceParams {
  const params = new URLSearchParams(location.search);
  return {
    source: sanitizeParam(params.get('utm_source') ?? ''),
    medium: sanitizeParam(params.get('utm_medium') ?? ''),
    campaign: sanitizeParam(params.get('utm_campaign') ?? ''),
    page_path: sanitizeParam(location.pathname) || '/',
  };
}

export function installGtagScript(measurementId: string, source?: SessionSourceParams): void {
  if (typeof document === 'undefined' || !measurementId) return;
  const w = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  w.dataLayer = w.dataLayer ?? [];
  if (typeof w.gtag !== 'function') {
    w.gtag = function gtag() {
      // The official snippet pushes `arguments` so gtag.js can read the command tuple.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer?.push(arguments);
    };
  }

  if (!document.getElementById(GTAG_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = GTAG_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  const config: Record<string, string | boolean> = { send_page_view: true };
  if (source?.source) config.campaign_source = source.source;
  if (source?.medium) config.campaign_medium = source.medium;
  if (source?.campaign) config.campaign_name = source.campaign;

  w.gtag('js', new Date());
  w.gtag('config', measurementId, config);
}

export function sendGtagEvent(eventName: ClientConversionEventName, params: AnalyticsParams): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('event', eventName, params);
}

export interface ClientConversionAnalytics {
  init(): void;
  trackSessionSource(): void;
  trackInstructorView(input: InstructorViewInput): void;
  trackCourseView(input: CourseViewInput): void;
  trackBookingStart(input: BookingStartInput): void;
}

export interface ClientConversionAnalyticsDeps {
  measurementId: string;
  send: AnalyticsSender;
  storage: Storage;
  readLocation: () => AnalyticsLocation;
  clock: () => number;
  installGtag: (measurementId: string, source: SessionSourceParams) => void;
}

export function createClientConversionAnalytics(
  deps: ClientConversionAnalyticsDeps
): ClientConversionAnalytics {
  let gtagInstalled = false;
  let lastEventKey = '';
  let lastEventAt = Number.NEGATIVE_INFINITY;

  const sessionSourceAlreadySent = (): boolean => {
    try {
      return deps.storage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };

  const markSessionSourceSent = () => {
    try {
      deps.storage.setItem(STORAGE_KEY, '1');
    } catch {
      // Measurement must not break the product when storage is unavailable.
    }
  };

  const emit = (eventName: ClientConversionEventName, params: AnalyticsParams) => {
    if (!deps.measurementId) return;
    if (!isClientEmittedConversionEvent(eventName)) return;
    const key = `${eventName}:${JSON.stringify(params)}`;
    const now = deps.clock();
    if (key === lastEventKey && now - lastEventAt < DUPLICATE_COLLAPSE_MS) return;
    lastEventKey = key;
    lastEventAt = now;
    deps.send(eventName, params);
  };

  return {
    init() {
      if (!deps.measurementId || gtagInstalled) return;
      gtagInstalled = true;
      deps.installGtag(deps.measurementId, readSessionSource(deps.readLocation()));
    },

    trackSessionSource() {
      if (sessionSourceAlreadySent()) return;
      markSessionSourceSent();
      const params = readSessionSource(deps.readLocation());
      emit('session_source', {
        source: params.source,
        medium: params.medium,
        campaign: params.campaign,
        page_path: params.page_path,
      });
    },

    trackInstructorView(input) {
      const instructorId = sanitizeParam(input.instructor_id);
      if (!instructorId) return;
      emit('instructor_view', { instructor_id: instructorId });
    },

    trackCourseView(input) {
      const courseId = sanitizeParam(input.course_id);
      if (!courseId) return;
      emit('course_view', { course_id: courseId });
    },

    trackBookingStart(input) {
      if (input.product_kind !== 'lesson' && input.product_kind !== 'course') return;
      const instructorId = sanitizeParam(input.instructor_id ?? '');
      const courseId = sanitizeParam(input.course_id ?? '');
      const participantCount = normalizeParticipantCount(input.participant_count);
      emit('booking_start', {
        product_kind: input.product_kind,
        ...(instructorId ? { instructor_id: instructorId } : {}),
        ...(courseId ? { course_id: courseId } : {}),
        ...(participantCount === undefined ? {} : { participant_count: participantCount }),
      });
    },
  };
}

function normalizeParticipantCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function sanitizeParam(value: string): string {
  return value
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, PARAM_MAX_LENGTH);
}

function readMeasurementId(): string {
  return resolveClientMeasurementId(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);
}

function browserStorage(): Storage {
  if (typeof window === 'undefined') return createMemoryStorage();
  try {
    return window.sessionStorage;
  } catch {
    return createMemoryStorage();
  }
}

function readBrowserLocation(): AnalyticsLocation {
  if (typeof window === 'undefined') return { pathname: '/', search: '' };
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

export const clientConversionAnalytics = createClientConversionAnalytics({
  measurementId: readMeasurementId(),
  send: sendGtagEvent,
  storage: browserStorage(),
  readLocation: readBrowserLocation,
  clock: () => Date.now(),
  installGtag: installGtagScript,
});

export function initClientAnalytics(): void {
  if (import.meta.env.MODE === 'test') return;
  clientConversionAnalytics.init();
}
