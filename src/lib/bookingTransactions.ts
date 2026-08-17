import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { AvailabilitySlot, Booking, Course } from '../types';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  isCourseBooking,
  toAvailabilitySlot,
} from './availabilitySlots';
import {
  AVAILABILITY_HOUR_LOCKS_COLLECTION,
  buildHourLockIds,
  hasOverlappingAvailabilitySlot,
} from '../domain/booking/slotOverlap';
import { applyWalletCreditInTransaction } from '../domain/wallet/walletCredit';
import {
  recordWalletLedgerEntryInTransaction,
  walletLedgerEntryId,
  walletLedgerBookingEntryId,
} from '../domain/wallet/walletLedger';
import { computeBookingEndsAtIso, withBookingEndsAt } from '../domain/booking/bookingEndsAt';
import { withBookingCreatedAt } from '../domain/booking/bookingCreatedAt';
import {
  isActiveCourseEnrollment,
  releaseCourseSeatInTransaction,
  reserveCourseSeatInTransaction,
} from './courseTransactions';

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient funds');
    this.name = 'InsufficientFundsError';
  }
}

export class BookingSlotOverlapError extends Error {
  constructor() {
    super('Instructor slot is no longer available');
    this.name = 'BookingSlotOverlapError';
  }
}

export interface BookingPaymentResult {
  newBalance: number;
  totalPrice: number;
}

function writeHourLocks(transaction: Transaction, firestore: Firestore, booking: Booking) {
  for (const lockId of buildHourLockIds(booking)) {
    transaction.set(doc(firestore, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockId), {
      instructorId: booking.instructorId,
      date: booking.date,
      time: booking.time,
      bookingId: booking.id,
    });
  }
}

function writeBookingWithAvailability(
  transaction: Transaction,
  firestore: Firestore,
  booking: Booking
) {
  transaction.set(
    doc(firestore, 'bookings', booking.id),
    withBookingEndsAt(withBookingCreatedAt(booking))
  );
  if (blocksInstructorAvailability(booking)) {
    writeHourLocks(transaction, firestore, booking);
    transaction.set(
      doc(firestore, AVAILABILITY_SLOTS_COLLECTION, booking.id),
      toAvailabilitySlot(booking)
    );
  }
}

async function loadInstructorSlotRefs(
  firestore: Firestore,
  instructorId: string
): Promise<DocumentReference[]> {
  const slotsSnap = await getDocs(
    query(
      collection(firestore, AVAILABILITY_SLOTS_COLLECTION),
      where('instructorId', '==', instructorId)
    )
  );
  return slotsSnap.docs.map((slotDoc) => slotDoc.ref);
}

async function assertNoSlotOverlap(
  transaction: Transaction,
  firestore: Firestore,
  booking: Pick<
    Booking,
    'id' | 'instructorId' | 'date' | 'time' | 'durationHours' | 'status' | 'isDeleted'
  >,
  existingSlotRefs: DocumentReference[],
  excludeBookingId?: string
): Promise<void> {
  if (!blocksInstructorAvailability(booking)) return;

  for (const lockId of buildHourLockIds(booking)) {
    const lockRef = doc(firestore, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockId);
    const lockSnap = await transaction.get(lockRef);
    if (lockSnap.exists() && lockSnap.data()?.bookingId !== excludeBookingId) {
      throw new BookingSlotOverlapError();
    }
  }

  const existingSlots: AvailabilitySlot[] = [];
  for (const slotRef of existingSlotRefs) {
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists()) continue;
    const slot = slotSnap.data() as AvailabilitySlot;
    if (slot.date !== booking.date) continue;
    existingSlots.push(slot);
  }

  if (
    hasOverlappingAvailabilitySlot(
      { time: booking.time, durationHours: booking.durationHours },
      existingSlots,
      excludeBookingId
    )
  ) {
    throw new BookingSlotOverlapError();
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
  const existingSlotRefs = await loadInstructorSlotRefs(firestore, booking.instructorId);

  return runTransaction(firestore, async (transaction) => {
    const totalPrice = await resolveBookingTotalPrice(transaction, firestore, booking);
    const bookingToWrite = { ...booking, totalPrice };

    const userRef = doc(firestore, 'users', userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile does not exist.');

    const currentBalance = userSnap.data().balanceUSD ?? 0;
    if (currentBalance < totalPrice) throw new InsufficientFundsError();

    await assertNoSlotOverlap(transaction, firestore, bookingToWrite, existingSlotRefs, booking.id);
    await reserveCourseSeatInTransaction(transaction, firestore, bookingToWrite);
    writeBookingWithAvailability(transaction, firestore, bookingToWrite);
    const newBalance = currentBalance - totalPrice;
    transaction.update(userRef, { balanceUSD: newBalance });
    if (totalPrice > 0) {
      recordWalletLedgerEntryInTransaction(transaction, firestore, {
        userId,
        amount: -totalPrice,
        balanceAfter: newBalance,
        type: isCourseBooking(bookingToWrite) ? 'course_payment' : 'lesson_payment',
        subjectName: bookingToWrite.instructorName,
        bookingId: bookingToWrite.id,
        courseId: bookingToWrite.courseId,
        entryId: walletLedgerEntryId(
          isCourseBooking(bookingToWrite) ? 'course_payment' : 'lesson_payment',
          bookingToWrite.id
        ),
      });
    }

    return { newBalance, totalPrice };
  });
}

export async function addBookingWithPayment(
  firestore: Firestore,
  booking: Booking
): Promise<BookingPaymentResult> {
  const isSystemBlock = booking.userId.startsWith('system_block_');
  const existingSlotRefs = await loadInstructorSlotRefs(firestore, booking.instructorId);

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
      if (totalPrice > 0) {
        recordWalletLedgerEntryInTransaction(transaction, firestore, {
          userId: booking.userId,
          amount: -totalPrice,
          balanceAfter: newBalance,
          type: isCourseBooking(bookingToWrite) ? 'course_payment' : 'lesson_payment',
          subjectName: bookingToWrite.instructorName,
          bookingId: bookingToWrite.id,
          courseId: bookingToWrite.courseId,
          entryId: walletLedgerEntryId(
            isCourseBooking(bookingToWrite) ? 'course_payment' : 'lesson_payment',
            bookingToWrite.id
          ),
        });
      }
    }

    await assertNoSlotOverlap(transaction, firestore, bookingToWrite, existingSlotRefs, booking.id);
    await reserveCourseSeatInTransaction(transaction, firestore, bookingToWrite);
    writeBookingWithAvailability(transaction, firestore, bookingToWrite);

    return { newBalance, totalPrice };
  });
}

export async function createGuestBooking(firestore: Firestore, booking: Booking): Promise<void> {
  const existingSlotRefs = await loadInstructorSlotRefs(firestore, booking.instructorId);

  return runTransaction(firestore, async (transaction) => {
    const totalPrice = await resolveBookingTotalPrice(transaction, firestore, booking);
    const bookingToWrite = { ...booking, totalPrice };

    await assertNoSlotOverlap(transaction, firestore, bookingToWrite, existingSlotRefs, booking.id);
    await reserveCourseSeatInTransaction(transaction, firestore, bookingToWrite);
    writeBookingWithAvailability(transaction, firestore, bookingToWrite);
  });
}

export type BookingScheduleUpdates = {
  date?: string;
  time?: string;
  instructorId?: string;
  instructorName?: string;
  instructorAvatar?: string;
};

export async function rescheduleBooking(
  firestore: Firestore,
  bookingId: string,
  updates: BookingScheduleUpdates
): Promise<void> {
  const bookingRef = doc(firestore, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) throw new Error('Booking does not exist.');

  const currentBooking = bookingSnap.data() as Booking;
  if (isCourseBooking(currentBooking)) {
    throw new Error('Course bookings cannot be rescheduled.');
  }

  const nextInstructorId = updates.instructorId ?? currentBooking.instructorId;
  const existingSlotRefs = await loadInstructorSlotRefs(firestore, nextInstructorId);

  return runTransaction(firestore, async (transaction) => {
    const freshSnap = await transaction.get(bookingRef);
    if (!freshSnap.exists()) throw new Error('Booking does not exist.');

    const bookingData = freshSnap.data() as Booking;
    const nextBooking: Booking = {
      ...bookingData,
      date: updates.date ?? bookingData.date,
      time: updates.time ?? bookingData.time,
      instructorId: updates.instructorId ?? bookingData.instructorId,
      instructorName: updates.instructorName ?? bookingData.instructorName,
      instructorAvatar: updates.instructorAvatar ?? bookingData.instructorAvatar,
    };

    const oldHourLockRefs = buildHourLockIds(bookingData).map((lockId) =>
      doc(firestore, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockId)
    );
    const existingOldHourLockRefs: DocumentReference[] = [];
    for (const lockRef of oldHourLockRefs) {
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists()) {
        existingOldHourLockRefs.push(lockRef);
      }
    }

    await assertNoSlotOverlap(transaction, firestore, nextBooking, existingSlotRefs, bookingId);

    const bookingUpdate: Record<string, string> = {};
    if (updates.date !== undefined) bookingUpdate.date = nextBooking.date;
    if (updates.time !== undefined) bookingUpdate.time = nextBooking.time;
    if (updates.instructorId !== undefined) {
      bookingUpdate.instructorId = nextBooking.instructorId;
      bookingUpdate.instructorName = nextBooking.instructorName;
      bookingUpdate.instructorAvatar = nextBooking.instructorAvatar;
    }

    if (Object.keys(bookingUpdate).length > 0) {
      const endsAt = computeBookingEndsAtIso(nextBooking);
      if (endsAt) {
        bookingUpdate.endsAt = endsAt;
      }
      transaction.update(bookingRef, bookingUpdate);
    }

    for (const lockRef of existingOldHourLockRefs) {
      transaction.delete(lockRef);
    }

    if (blocksInstructorAvailability(nextBooking)) {
      writeHourLocks(transaction, firestore, nextBooking);
      transaction.set(
        doc(firestore, AVAILABILITY_SLOTS_COLLECTION, bookingId),
        toAvailabilitySlot(nextBooking)
      );
    } else {
      transaction.delete(doc(firestore, AVAILABILITY_SLOTS_COLLECTION, bookingId));
    }
  });
}

export async function cancelBookingWithRefund(
  firestore: Firestore,
  bookingId: string,
  refundAmount?: number
): Promise<{ refunded: number; alreadyCancelled: boolean }> {
  const cancelResult = await runTransaction(firestore, async (transaction) => {
    const bookingRef = doc(firestore, 'bookings', bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking does not exist.');

    const bookingData = bookingSnap.data() as Booking;
    if (bookingData.status === 'cancelled') {
      return { refunded: 0, alreadyCancelled: true, bookingData: null };
    }

    const refund =
      bookingData.status === 'completed' ? 0 : (refundAmount ?? bookingData.totalPrice ?? 0);

    const hourLockRefs = !isCourseBooking(bookingData)
      ? buildHourLockIds(bookingData).map((lockId) =>
          doc(firestore, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockId)
        )
      : [];
    const existingHourLockRefs: typeof hourLockRefs = [];
    for (const lockRef of hourLockRefs) {
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists()) {
        existingHourLockRefs.push(lockRef);
      }
    }

    if (isActiveCourseEnrollment(bookingData)) {
      await releaseCourseSeatInTransaction(transaction, firestore, bookingData);
    }

    transaction.update(bookingRef, { status: 'cancelled' });
    if (!isCourseBooking(bookingData)) {
      for (const lockRef of existingHourLockRefs) {
        transaction.delete(lockRef);
      }
      transaction.delete(doc(firestore, AVAILABILITY_SLOTS_COLLECTION, bookingId));
    }

    return { refunded: refund, alreadyCancelled: false, bookingData };
  });

  if (cancelResult.alreadyCancelled || !cancelResult.bookingData) {
    return { refunded: 0, alreadyCancelled: cancelResult.alreadyCancelled };
  }

  const { refunded, bookingData } = cancelResult;
  const bookingOwnerId = bookingData.userId;
  const isGuestOrSystemBlock =
    bookingOwnerId.startsWith('guest_') || bookingOwnerId.startsWith('system_block_');

  if (!isGuestOrSystemBlock && refunded > 0) {
    await runTransaction(firestore, async (transaction) => {
      const userRef = doc(firestore, 'users', bookingOwnerId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User profile does not exist.');

      applyWalletCreditInTransaction(
        transaction,
        firestore,
        userRef,
        bookingOwnerId,
        userSnap.data(),
        refunded,
        'refund',
        bookingData.instructorName,
        bookingId,
        walletLedgerBookingEntryId('refund', bookingData)
      );
    });
  }

  return { refunded, alreadyCancelled: false };
}
