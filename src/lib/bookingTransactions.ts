import {
  doc,
  getDoc,
  runTransaction,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
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

export interface BookingPaymentResult {
  newBalance: number;
  totalPrice: number;
}

function writeBookingWithAvailability(
  transaction: Transaction,
  firestore: Firestore,
  booking: Booking
) {
  transaction.set(doc(firestore, 'bookings', booking.id), booking);
  if (blocksInstructorAvailability(booking)) {
    transaction.set(
      doc(firestore, AVAILABILITY_SLOTS_COLLECTION, booking.id),
      toAvailabilitySlot(booking)
    );
  }
}

export async function resolveBookingTotalPrice(
  transaction: Transaction,
  firestore: Firestore,
  booking: Booking
): Promise<number> {
  if (booking.userId.startsWith('system_block_')) {
    return 0;
  }

  if (isCourseBooking(booking)) {
    const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
    const courseSnap = await transaction.get(doc(firestore, 'courses', courseId));
    if (!courseSnap.exists()) throw new Error('Course does not exist.');
    const courseData = courseSnap.data() as Course;
    if (typeof courseData.price !== 'number') throw new Error('Invalid course price.');
    return courseData.price;
  }

  const instructorSnap = await transaction.get(doc(firestore, 'instructors', booking.instructorId));
  if (!instructorSnap.exists()) throw new Error('Instructor does not exist.');
  const pricePerHour = instructorSnap.data().pricePerHour;
  if (typeof pricePerHour !== 'number' || pricePerHour < 0) {
    throw new Error('Invalid instructor price.');
  }
  return pricePerHour * booking.durationHours;
}

export async function createBookingWithPayment(
  firestore: Firestore,
  userId: string,
  booking: Booking
): Promise<BookingPaymentResult> {
  return runTransaction(firestore, async (transaction) => {
    const totalPrice = await resolveBookingTotalPrice(transaction, firestore, booking);
    const bookingToWrite = { ...booking, totalPrice };

    const userRef = doc(firestore, 'users', userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    const currentBalance = userSnap.data().balanceUSD ?? 0;
    if (currentBalance < totalPrice) throw new InsufficientFundsError();

    writeBookingWithAvailability(transaction, firestore, bookingToWrite);
    transaction.update(userRef, { balanceUSD: currentBalance - totalPrice });

    return { newBalance: currentBalance - totalPrice, totalPrice };
  });
}

export async function addBookingWithPayment(
  firestore: Firestore,
  booking: Booking
): Promise<BookingPaymentResult> {
  const isSystemBlock = booking.userId.startsWith('system_block_');

  return runTransaction(firestore, async (transaction) => {
    const totalPrice = await resolveBookingTotalPrice(transaction, firestore, booking);
    const bookingToWrite = { ...booking, totalPrice };

    let newBalance = 0;
    if (!isSystemBlock) {
      const userRef = doc(firestore, 'users', booking.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User profile does not exist.');

      const currentBalance = userSnap.data().balanceUSD ?? 0;
      if (currentBalance < totalPrice) throw new InsufficientFundsError();
      newBalance = currentBalance - totalPrice;
      transaction.update(userRef, { balanceUSD: newBalance });
    }

    writeBookingWithAvailability(transaction, firestore, bookingToWrite);

    return { newBalance, totalPrice };
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
