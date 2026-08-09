import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { Booking } from '../types';
import {
  activityLogId,
  buildBookingCompletedMetadata,
  logActivityForUser,
} from './activityLog';
import { AVAILABILITY_SLOTS_COLLECTION, isCourseBooking } from './availabilitySlots';
import { isBookingEligibleForAutoComplete } from './bookingEndsAt';
import { logger } from './logger';

export const SYSTEM_AUTO_COMPLETE_ACTOR_ID = 'system_auto_complete';

export async function completeBooking(
  firestore: Firestore,
  booking: Booking,
  actorId: string
): Promise<void> {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'bookings', booking.id), { status: 'completed' });
  if (!isCourseBooking(booking)) {
    batch.delete(doc(firestore, AVAILABILITY_SLOTS_COLLECTION, booking.id));
  }
  await batch.commit();

  await logActivityForUser(
    booking.userId,
    actorId,
    'booking_completed',
    buildBookingCompletedMetadata(booking, []),
    activityLogId.bookingCompleted(booking.id)
  );
}

export async function queryOverdueBookings(
  firestore: Firestore,
  maxResults = 100
): Promise<Booking[]> {
  const nowIso = new Date().toISOString();
  const snapshot = await getDocs(
    query(
      collection(firestore, 'bookings'),
      where('endsAt', '<=', nowIso),
      limit(maxResults)
    )
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
