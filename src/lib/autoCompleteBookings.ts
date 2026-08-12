import { collection, doc, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';
import { Booking } from '../types';
import { activityLogId, buildBookingCompletedMetadata, logActivityForUser } from './activityLog';
import { finalizeBookingCompletion } from './completeBooking';
import { isBookingEligibleForAutoComplete } from './bookingEndsAt';
import { logger } from './logger';

export const SYSTEM_AUTO_COMPLETE_ACTOR_ID = 'system_auto_complete';

export async function completeBooking(
  firestore: Firestore,
  booking: Booking,
  actorId: string
): Promise<void> {
  const completedBooking = await finalizeBookingCompletion(firestore, booking.id);
  if (!completedBooking) return;

  await logActivityForUser(
    completedBooking.userId,
    actorId,
    'booking_completed',
    buildBookingCompletedMetadata(completedBooking, []),
    activityLogId.bookingCompleted(completedBooking.id)
  );
}

export async function queryOverdueBookings(
  firestore: Firestore,
  maxResults = 100
): Promise<Booking[]> {
  const nowIso = new Date().toISOString();
  const snapshot = await getDocs(
    query(collection(firestore, 'bookings'), where('endsAt', '<=', nowIso), limit(maxResults))
  );

  return snapshot.docs
    .map((bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }) as Booking)
    .filter((booking) => isBookingEligibleForAutoComplete(booking));
}

export async function autoCompleteEligibleBookings(
  firestore: Firestore,
  bookings: Booking[],
  actorId: string,
  options?: { onCompleted?: (booking: Booking) => void }
): Promise<number> {
  const eligible = bookings.filter((booking) => isBookingEligibleForAutoComplete(booking));
  let completedCount = 0;

  for (const booking of eligible) {
    try {
      await completeBooking(firestore, booking, actorId);
      options?.onCompleted?.(booking);
      completedCount += 1;
    } catch (error) {
      logger.error(`Failed to auto-complete booking ${booking.id}:`, error);
    }
  }

  return completedCount;
}
