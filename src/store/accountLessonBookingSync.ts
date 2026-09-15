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

/**
 * Routes that visibly render non-hot lesson history.
 *
 * `/cabinet/history` is the full history surface. `/cabinet/profile_journey`
 * renders the same completed-lesson events directly (a limited preview plus a
 * "Show all" link), and `completed` lessons are never members of account_hot —
 * so Journey is a history owner too, not merely a consumer of warm hot data.
 */
const ACCOUNT_LESSON_HISTORY_PATHS = new Set(['/cabinet/history', '/cabinet/profile_journey']);

/** Whether the active route visibly renders non-hot account lesson history. */
export function shouldSyncAccountLessonHistory(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  return (
    Boolean(input.accountId) && ACCOUNT_LESSON_HISTORY_PATHS.has(normalizePathname(input.pathname))
  );
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
