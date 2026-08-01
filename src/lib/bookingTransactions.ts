import { doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore';
import { Booking, Course } from '../types';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  isCourseBooking,
  toAvailabilitySlot,
} from './availabilitySlots';
import { applyPendingWalletCredit } from './walletCredit';

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient funds');
    this.name = 'InsufficientFundsError';
  }
}

export async function createBookingWithPayment(
  firestore: Firestore,
  userId: string,
  booking: Booking,
  totalCost: number
): Promise<number> {
  return runTransaction(firestore, async (transaction) => {
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    const currentBalance = userSnap.data().balanceUSD ?? 0;
    if (currentBalance < totalCost) throw new InsufficientFundsError();

    transaction.set(doc(firestore, 'bookings', booking.id), booking);
    if (blocksInstructorAvailability(booking)) {
      transaction.set(
        doc(firestore, AVAILABILITY_SLOTS_COLLECTION, booking.id),
        toAvailabilitySlot(booking)
      );
    }
    transaction.update(userRef, { balanceUSD: currentBalance - totalCost });

    return currentBalance - totalCost;
  });
}

export async function cancelBookingWithRefund(
  firestore: Firestore,
  bookingId: string,
  refundAmount?: number
): Promise<{ refunded: number; alreadyCancelled: boolean }> {
  const result = await runTransaction(firestore, async (transaction) => {
    const bookingRef = doc(firestore, 'bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking does not exist.');

    const bookingData = bookingSnap.data() as Booking;
    if (bookingData.status === 'cancelled') {
      return { refunded: 0, alreadyCancelled: true };
    }

    const bookingOwnerId = bookingData.userId;
    const isGuestOrSystemBlock =
      bookingOwnerId.startsWith('guest_') || bookingOwnerId.startsWith('system_block_');
    const userRef = isGuestOrSystemBlock ? null : doc(firestore, 'users', bookingOwnerId);
    const userSnap = userRef ? await transaction.get(userRef) : null;

    const courseId = isCourseBooking(bookingData)
      ? bookingData.instructorId.substring('course_'.length)
      : null;
    const courseRef = courseId ? doc(firestore, 'courses', courseId) : null;
    const courseSnap = courseRef ? await transaction.get(courseRef) : null;

    const refund =
      bookingData.status === 'completed' ? 0 : (refundAmount ?? bookingData.totalPrice ?? 0);

    if (userRef && userSnap?.exists() && refund > 0) {
      transaction.update(userRef, { pendingWalletCredit: refund });
    }

    transaction.update(bookingRef, { status: 'cancelled' });
    if (!isCourseBooking(bookingData)) {
      transaction.delete(doc(firestore, AVAILABILITY_SLOTS_COLLECTION, bookingId));
    }

    if (courseRef && courseSnap?.exists()) {
      const courseData = courseSnap.data() as Course;
      if (courseData.availableSeats < courseData.totalSeats) {
        transaction.update(courseRef, {
          availableSeats: courseData.availableSeats + 1,
        });
      }
    }

    return { refunded: refund, alreadyCancelled: false };
  });

  if (result.alreadyCancelled || result.refunded <= 0) return result;

  const bookingSnap = await getDoc(doc(firestore, 'bookings', bookingId));
  if (!bookingSnap.exists()) return result;
  const bookingData = bookingSnap.data() as Booking;
  const bookingOwnerId = bookingData.userId;
  if (!bookingOwnerId.startsWith('guest_') && !bookingOwnerId.startsWith('system_block_')) {
    await applyPendingWalletCredit(firestore, bookingOwnerId);
  }
  return result;
}
