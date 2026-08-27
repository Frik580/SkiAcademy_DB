import type { Firestore } from 'firebase/firestore';
import { collection, orderBy, query, where, limit } from '../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../shared';

export type RealtimeBookingsScope =
  | { kind: 'admin' }
  | { kind: 'instructor'; instructorId: string }
  | { kind: 'student'; userId: string };

/** UTC calendar date keeps the YYYY-MM-DD Firestore boundary stable across local timezones. */
export function getRealtimeBookingsCutoff(now: Date): string {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - QUERY_LIMITS.recentDaysForRealtimeBookings);
  return cutoff.toISOString().slice(0, 10);
}

/** Builds the only realtime booking window used by the client. Historical states are paged on demand. */
export function getRealtimeBookingsQuery(
  firestore: Firestore,
  scope: RealtimeBookingsScope,
  now: Date = new Date()
) {
  const constraints = [
    where('status', 'in', ['pending', 'confirmed']),
    where('date', '>=', getRealtimeBookingsCutoff(now)),
    orderBy('date', 'desc'),
  ];

  if (scope.kind === 'instructor')
    constraints.unshift(where('instructorId', '==', scope.instructorId));
  if (scope.kind === 'student') constraints.unshift(where('userId', '==', scope.userId));

  return query(collection(firestore, 'bookings'), ...constraints);
}

/** Deferred T31: legacy course enrollment rows still use instructorId `course_*`. */
export function getStudentCourseBookingsQuery(firestore: Firestore, userId: string) {
  return query(
    collection(firestore, 'bookings'),
    where('userId', '==', userId),
    where('instructorId', '>=', 'course_'),
    where('instructorId', '<=', 'course_\uf8ff'),
    limit(QUERY_LIMITS.bookingsHistory)
  );
}
