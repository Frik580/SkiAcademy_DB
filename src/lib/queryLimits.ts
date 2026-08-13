/**
 * Firestore query limits to keep snapshot listeners and list reads small.
 * These are pragmatic defaults; raise them as the app grows.
 */
export const QUERY_LIMITS = {
  bookings: 200,
  notifications: 50,
  activityLogs: 100,
  reviews: 200,
  users: 100,
  courses: 200,
  instructors: 100,
  walletLedger: 100,
  chatMessages: 100,
  recentDaysForAutoComplete: 7,
} as const;
