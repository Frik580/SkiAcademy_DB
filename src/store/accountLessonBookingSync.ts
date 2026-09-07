/**
 * Account lesson-booking read sync must run wherever authenticated users
 * can see upcoming individual Bookings (Student Cabinet and home chrome).
 *
 * Historical bug: sync was limited to `role === 'user' && !instructorId` on
 * `/cabinet*` and `/`. That left `useLessonBookingStore` empty for:
 * - admin Arsenii-style accounts opening `/cabinet`
 * - dual-role accounts (`instructorId` set) opening `/cabinet`
 *
 * After T32.9A.9A legacy `bookings` listeners are OFF, an empty store means
 * no upcoming individual lessons — and DevTools shows no
 * `queryLessonBookingReadModels` call because the mount gate never enabled.
 */
export function shouldSyncAccountLessonBookings(input: {
  readonly pathname: string;
  readonly accountId: string | undefined;
}): boolean {
  if (!input.accountId) {
    return false;
  }
  return input.pathname === '/' || input.pathname.startsWith('/cabinet');
}
