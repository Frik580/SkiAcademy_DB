import type { DocumentData, QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  collection,
  db,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from '../../infrastructure/firebase';
import { toBooking } from '../../infrastructure/firebase';
import type { Booking } from '../../types';
import { QUERY_LIMITS } from '../../shared';

export type BookingHistoryScope =
  | { kind: 'admin' }
  | { kind: 'instructor'; instructorId: string }
  | { kind: 'student'; userId: string };

export interface BookingHistoryPage {
  bookings: Booking[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/** Fetches immutable booking history on demand. It deliberately has no realtime listener. */
export async function getBookingHistoryPage(
  scope: BookingHistoryScope,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<BookingHistoryPage> {
  const constraints: QueryConstraint[] = [
    where('status', 'in', ['completed', 'cancelled', 'pending_cancellation']),
    orderBy('date', 'desc'),
  ];

  if (scope.kind === 'instructor')
    constraints.unshift(where('instructorId', '==', scope.instructorId));
  if (scope.kind === 'student') constraints.unshift(where('userId', '==', scope.userId));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(QUERY_LIMITS.bookingsHistory + 1));

  const snapshot = await getDocs(query(collection(db, 'bookings'), ...constraints));
  const pageDocs = snapshot.docs.slice(0, QUERY_LIMITS.bookingsHistory);

  return {
    bookings: pageDocs.map((bookingDoc) => toBooking(bookingDoc.id, bookingDoc.data())),
    cursor: pageDocs.at(-1) ?? null,
    hasMore: snapshot.docs.length > QUERY_LIMITS.bookingsHistory,
  };
}
