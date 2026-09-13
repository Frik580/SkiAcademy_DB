/**
 * Account lesson-booking read sync ownership (T32.9R.P0A / P0B).
 *
 * Historical bug: sync was limited to `role === 'user' && !instructorId` on
 * `/cabinet*` and `/`. That left `useLessonBookingStore` empty for:
 * - admin Arsenii-style accounts opening `/cabinet`
 * - dual-role accounts (`instructorId` set) opening `/cabinet`
 *
 * After T32.9A.9A legacy `bookings` listeners are OFF, an empty store means
 * no upcoming individual lessons — and DevTools shows no
 * `queryLessonBookingReadModels` call because the mount gate never enabled.
 *
 * P0B: `account_hot` ensure/visibility is limited to surfaces that actually
 * render current/upcoming lesson state. Unrelated cabinet tabs must not poll.
 */

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/** Routes that visibly consume current/upcoming account_hot lesson data. */
const ACCOUNT_LESSON_HOT_PATHS = new Set([
  '/cabinet',
  '/cabinet/home',
  '/cabinet/calendar',
  '/cabinet/coach',
  '/cabinet/instructors',
]);

/**
 * Whether the active route should ensure / freshness-refresh account_hot.
 * Does NOT include Training, History, Profile hubs, or public `/`.
 */
export function shouldSyncAccountLessonBookings(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  if (!input.accountId) {
    return false;
  }
  return ACCOUNT_LESSON_HOT_PATHS.has(normalizePathname(input.pathname));
}

/** History is visible only on the cabinet's dedicated history route. */
export function shouldSyncAccountLessonHistory(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  return Boolean(input.accountId) && normalizePathname(input.pathname) === '/cabinet/history';
}

const PARTICIPANT_LESSON_STATS_PATHS = new Set([
  '/cabinet',
  '/cabinet/home',
  '/cabinet/coach',
  '/cabinet/instructors',
  '/cabinet/profile_achievements',
  '/cabinet/profile_season',
]);

/**
 * Routes with visible consumers of complete participant lesson statistics.
 * Keep this list narrow: each activation drains the account's logical history.
 */
export function shouldSyncAccountParticipantLessonStats(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  return (
    Boolean(input.accountId) &&
    PARTICIPANT_LESSON_STATS_PATHS.has(normalizePathname(input.pathname))
  );
}
