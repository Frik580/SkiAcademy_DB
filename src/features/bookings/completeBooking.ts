import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { Booking } from '../../types';
import { AVAILABILITY_SLOTS_COLLECTION, isCourseBooking } from '../../domain/availability';
import { isActiveCourseEnrollment, releaseCourseSeatInTransaction } from '../courses/courseTransactions';

export async function finalizeBookingCompletion(
  firestore: Firestore,
  bookingId: string
): Promise<Booking | null> {
  return runTransaction(firestore, async (transaction) => {
    const bookingRef = doc(firestore, 'bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) return null;

    const booking = { id: bookingId, ...bookingSnap.data() } as Booking;
    if (booking.status === 'completed') return booking;

    const shouldReleaseCourseSeat = isActiveCourseEnrollment(booking);
    const isCourse = isCourseBooking(booking);

    // Firestore transactions: all reads before any writes.
    if (isCourse && shouldReleaseCourseSeat) {
      await releaseCourseSeatInTransaction(transaction, firestore, booking);
    }

    transaction.update(bookingRef, { status: 'completed' });

    if (!isCourse) {
      transaction.delete(doc(firestore, AVAILABILITY_SLOTS_COLLECTION, bookingId));
    }

    return { ...booking, status: 'completed' };
  });
}
