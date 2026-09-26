/**
 * Client conversion measurement (CA-CONV-ANALYTICS-001).
 *
 * Emits only client-observed funnel events through GA4 gtag. The measurement
 * id is `VITE_FIREBASE_MEASUREMENT_ID` — the same value already applied to
 * `firebaseConfig.measurementId`. Production is configured as G-XYMQS9SRDM;
 * this module does not hard-code that id, so staging and e2e stay quiet when
 * the variable is empty.
 *
 * `booking_complete` and `paid` are NOT client events. Carve Firebase emits
 * those from the canonical command / payment outcome. Do not add a client
 * emitter for them. When a Firebase handoff contract arrives, forward only
 * server-confirmed facts — until then this file leaves that path unwired.
 *
 * Shared UI files that call this helper (home landing, instructor cards,
 * modal host) are analytics-only touches. They are not part of landing-copy
 * work (CA-CONV-GATE-001).
 */

export const CLIENT_ANALYTICS_MEASUREMENT_ENV = 'VITE_FIREBASE_MEASUREMENT_ID' as const;

/** Production GA4 measurement id. Supplied at build time via the env var above. */
export const CARVE_PRODUCTION_GA4_MEASUREMENT_ID = 'G-XYMQS9SRDM' as const;

export const CLIENT_CONVERSION_EVENT_NAMES = [
  'landing_view',
  'instructor_view',
  'course_view',
  'booking_start',
] as const;

export type ClientConversionEventName = (typeof CLIENT_CONVERSION_EVENT_NAMES)[number];

/**
 * Server-confirmed conversion facts. Names are documented so the client
 * contract can align when Firebase publishes one. Nothing in this module
 * sends them.
 */
export const SERVER_CONFIRMED_CONVERSION_EVENT_NAMES = ['booking_complete', 'paid'] as const;

export type ServerConfirmedConversionEventName =
  (typeof SERVER_CONFIRMED_CONVERSION_EVENT_NAMES)[number];

export type InstructorViewSurface = 'catalogue' | 'reviews';

export type BookingProductType = 'lesson' | 'course';

export interface SessionSource {
  session_source: string;
  landing_path: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
}

export interface InstructorViewInput {
  instructor_id: string;
  surface: InstructorViewSurface;
}

export interface CourseViewInput {
  course_id: string;
}

export interface BookingStartInput {
  product_type: BookingProductType;
  product_id: string;
  instructor_id?: string;
  course_id?: string;
}

export interface AnalyticsLocation {
  pathname: string;
  search: string;
  referrer: string;
  host: string;
}

type AnalyticsParams = Record<string, string>;

type AnalyticsSender = (eventName: ClientConversionEventName, params: AnalyticsParams) => void;

interface PersistedAnalyticsSession {
  source: SessionSource;
  landingTracked: boolean;
  instructorIds: string[];
  courseIds: string[];
}

const STORAGE_KEY = 'carve:client-conversion-analytics:v1';
const GTAG_SCRIPT_ID = 'carve-ga4-gtag';
const PARAM_MAX_LENGTH = 100;
const BOOKING_START_COLLAPSE_MS = 500;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export function isClientEmittedConversionEvent(name: string): name is ClientConversionEventName {
  return (CLIENT_CONVERSION_EVENT_NAMES as readonly string[]).includes(name);
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

export function readSessionSource(location: AnalyticsLocation): SessionSource {
  const params = new URLSearchParams(location.search);
  const utm: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = sanitizeParam(params.get(key) ?? '');
    if (value) utm[key] = value;
  }

  const referrer = referrerHost(location.referrer);
  const internal = Boolean(referrer && location.host && referrer === location.host.toLowerCase());
  const externalReferrer = referrer && !internal ? referrer : undefined;
  const sessionSource = utm.utm_source || externalReferrer || 'direct';

  return {
    session_source: sessionSource,
    landing_path: sanitizeParam(location.pathname) || '/',
    ...utm,
    ...(externalReferrer ? { referrer: externalReferrer } : {}),
  };
}

export function installGtagScript(measurementId: string, source?: SessionSource): void {
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

  const config: Record<string, string | boolean> = {
    send_page_view: true,
  };
  if (source?.utm_source) config.campaign_source = source.utm_source;
  if (source?.utm_medium) config.campaign_medium = source.utm_medium;
  if (source?.utm_campaign) config.campaign_name = source.utm_campaign;
  if (source?.utm_content) config.campaign_content = source.utm_content;
  if (source?.utm_term) config.campaign_term = source.utm_term;

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
  trackLandingView(): void;
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
  installGtag: (measurementId: string, source: SessionSource) => void;
}

export function createClientConversionAnalytics(
  deps: ClientConversionAnalyticsDeps
): ClientConversionAnalytics {
  let gtagInstalled = false;
  let lastBookingStartKey = '';
  let lastBookingStartAt = Number.NEGATIVE_INFINITY;

  const loadSession = (): PersistedAnalyticsSession => {
    const parsed = readStoredSession(deps.storage);
    if (parsed) return parsed;
    return {
      source: readSessionSource(deps.readLocation()),
      landingTracked: false,
      instructorIds: [],
      courseIds: [],
    };
  };

  const saveSession = (session: PersistedAnalyticsSession) => {
    try {
      deps.storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Measurement must not break the product when storage is unavailable.
    }
  };

  const emit = (eventName: ClientConversionEventName, params: AnalyticsParams) => {
    if (!deps.measurementId) return;
    if (!isClientEmittedConversionEvent(eventName)) return;
    deps.send(eventName, params);
  };

  return {
    init() {
      const session = loadSession();
      saveSession(session);
      if (!deps.measurementId || gtagInstalled) return;
      gtagInstalled = true;
      deps.installGtag(deps.measurementId, session.source);
    },

    trackLandingView() {
      const session = loadSession();
      if (session.landingTracked) return;
      session.landingTracked = true;
      saveSession(session);
      emit('landing_view', sourceParams(session.source));
    },

    trackInstructorView(input) {
      const instructorId = sanitizeParam(input.instructor_id);
      if (!instructorId) return;
      const session = loadSession();
      if (session.instructorIds.includes(instructorId)) return;
      session.instructorIds = [...session.instructorIds, instructorId].slice(-200);
      saveSession(session);
      emit('instructor_view', {
        ...sourceParams(session.source),
        instructor_id: instructorId,
        surface: input.surface,
      });
    },

    trackCourseView(input) {
      const courseId = sanitizeParam(input.course_id);
      if (!courseId) return;
      const session = loadSession();
      if (session.courseIds.includes(courseId)) return;
      session.courseIds = [...session.courseIds, courseId].slice(-200);
      saveSession(session);
      emit('course_view', {
        ...sourceParams(session.source),
        course_id: courseId,
      });
    },

    trackBookingStart(input) {
      const productId = sanitizeParam(input.product_id);
      if (!productId) return;
      if (input.product_type !== 'lesson' && input.product_type !== 'course') return;
      const key = `${input.product_type}:${productId}`;
      const now = deps.clock();
      if (key === lastBookingStartKey && now - lastBookingStartAt < BOOKING_START_COLLAPSE_MS) {
        return;
      }
      lastBookingStartKey = key;
      lastBookingStartAt = now;

      const session = loadSession();
      const instructorId = sanitizeParam(input.instructor_id ?? '');
      const courseId = sanitizeParam(input.course_id ?? '');
      emit('booking_start', {
        ...sourceParams(session.source),
        product_type: input.product_type,
        product_id: productId,
        ...(instructorId ? { instructor_id: instructorId } : {}),
        ...(courseId ? { course_id: courseId } : {}),
      });
    },
  };
}

function sourceParams(source: SessionSource): AnalyticsParams {
  return {
    session_source: source.session_source,
    landing_path: source.landing_path,
    ...(source.utm_source ? { utm_source: source.utm_source } : {}),
    ...(source.utm_medium ? { utm_medium: source.utm_medium } : {}),
    ...(source.utm_campaign ? { utm_campaign: source.utm_campaign } : {}),
    ...(source.utm_content ? { utm_content: source.utm_content } : {}),
    ...(source.utm_term ? { utm_term: source.utm_term } : {}),
    ...(source.referrer ? { referrer: source.referrer } : {}),
  };
}

function readStoredSession(storage: Storage): PersistedAnalyticsSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<PersistedAnalyticsSession>;
    if (!record.source || typeof record.source.session_source !== 'string') return null;
    return {
      source: record.source,
      landingTracked: record.landingTracked === true,
      instructorIds: Array.isArray(record.instructorIds)
        ? record.instructorIds.filter((id): id is string => typeof id === 'string')
        : [],
      courseIds: Array.isArray(record.courseIds)
        ? record.courseIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function sanitizeParam(value: string): string {
  return value
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, PARAM_MAX_LENGTH);
}

function referrerHost(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).host.toLowerCase();
    return host || undefined;
  } catch {
    return undefined;
  }
}

function readMeasurementId(): string {
  const value = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  return typeof value === 'string' ? value.trim() : '';
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
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '', referrer: '', host: '' };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    referrer: typeof document === 'undefined' ? '' : document.referrer,
    host: window.location.host,
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
