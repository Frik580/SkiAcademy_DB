import { DocumentReference, Firestore, QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import {
  AVAILABILITY_HOUR_LOCKS_COLLECTION,
  BookingIdConflictError,
  BookingSlotOverlapError,
  blocksInstructorAvailability,
  buildHourLockIds,
  calculateBookingTotalPrice,
  computeLessonEndsAtIso,
  hasOverlappingAvailabilitySlot,
  isCourseBooking,
  matchesExistingBookingRequest,
} from '@ski-academy/shared-domain';
import type {
  AvailabilitySlotLike,
  BookingStatus,
  LessonDifficulty,
} from '@ski-academy/shared-domain';
import { recordWalletLedgerEntryInTransaction, walletLedgerEntryId } from '../walletLedger';

export { BookingIdConflictError, BookingSlotOverlapError } from '@ski-academy/shared-domain';

const BOOKINGS_COLLECTION = 'bookings';
const AVAILABILITY_SLOTS_COLLECTION = 'availability_slots';
export type { BookingStatus, LessonDifficulty } from '@ski-academy/shared-domain';

export interface BookingRecord {
  id: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  totalPrice: number;
  status: BookingStatus;
  difficulty: LessonDifficulty;
  notes?: string;
  courseId?: string;
  createdAt?: string;
  endsAt?: string;
  isDeleted?: boolean;
}


export type AvailabilitySlot = AvailabilitySlotLike;

export interface BookingPaymentResult {
  bookingId: string;
  newBalance: number;
  totalPrice: number;
}

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient funds');
    this.name = 'InsufficientFundsError';
  }
}

function toAvailabilitySlot(
  booking: Pick<BookingRecord, 'id' | 'userId' | 'instructorId' | 'date' | 'time' | 'durationHours'>
): AvailabilitySlot {
  return {
    bookingId: booking.id,
    instructorId: booking.instructorId,
    date: booking.date,
    time: booking.time,
    durationHours: booking.durationHours,
    slotType: booking.userId.startsWith('system_block_') ? 'block' : 'lesson',
  };
}

function withBookingTimestamps(booking: BookingRecord): BookingRecord {
  const createdAt = booking.createdAt ?? new Date().toISOString();
  const endsAt = booking.endsAt ?? computeLessonEndsAtIso(booking) ?? undefined;
  return { ...booking, createdAt, ...(endsAt ? { endsAt } : {}) };
}

async function resolveBookingTotalPrice(
  transaction: Transaction,
  db: Firestore,
  booking: BookingRecord
): Promise<number> {
  if (booking.userId.startsWith('system_block_')) return calculateBookingTotalPrice(booking);

  if (isCourseBooking(booking)) {
    const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
    const courseSnap = await transaction.get(db.collection('courses').doc(courseId));
    if (!courseSnap.exists) throw new Error('Course does not exist.');
    const courseData = courseSnap.data();
    return calculateBookingTotalPrice({ ...booking, coursePrice: courseData?.price });
  }

  const instructorSnap = await transaction.get(
    db.collection('instructors').doc(booking.instructorId)
  );
  if (!instructorSnap.exists) throw new Error('Instructor does not exist.');
  const pricePerHour = instructorSnap.data()?.pricePerHour;
  return calculateBookingTotalPrice({ ...booking, instructorPricePerHour: pricePerHour });
}

async function assertNoSlotOverlap(
  transaction: Transaction,
  db: Firestore,
  booking: BookingRecord,
  existingSlotDocs: QueryDocumentSnapshot[],
  excludeBookingId?: string
): Promise<void> {
  if (!blocksInstructorAvailability(booking)) return;

  for (const lockId of buildHourLockIds(booking)) {
    const lockRef = db.collection(AVAILABILITY_HOUR_LOCKS_COLLECTION).doc(lockId);
    const lockSnap = await transaction.get(lockRef);
    if (lockSnap.exists && lockSnap.data()?.bookingId !== excludeBookingId) {
      throw new BookingSlotOverlapError();
    }
  }

  const existingSlots: AvailabilitySlot[] = [];
  for (const slotDoc of existingSlotDocs) {
    const slotSnap = await transaction.get(slotDoc.ref);
    if (!slotSnap.exists) continue;
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

function writeHourLocks(transaction: Transaction, db: Firestore, booking: BookingRecord): void {
  for (const lockId of buildHourLockIds(booking)) {
    transaction.set(db.collection(AVAILABILITY_HOUR_LOCKS_COLLECTION).doc(lockId), {
      instructorId: booking.instructorId,
      date: booking.date,
      time: booking.time,
      bookingId: booking.id,
    });
  }
}

function writeBookingWithAvailability(
  transaction: Transaction,
  db: Firestore,
  booking: BookingRecord
): void {
  transaction.set(
    db.collection(BOOKINGS_COLLECTION).doc(booking.id),
    withBookingTimestamps(booking)
  );

  if (blocksInstructorAvailability(booking)) {
    writeHourLocks(transaction, db, booking);
    transaction.set(
      db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(booking.id),
      toAvailabilitySlot(booking)
    );
  }
}

export async function createBookingWithPayment(
  db: Firestore,
  userId: string,
  booking: BookingRecord
): Promise<BookingPaymentResult> {
  const existingSlotDocs = (
    await db
      .collection(AVAILABILITY_SLOTS_COLLECTION)
      .where('instructorId', '==', booking.instructorId)
      .get()
  ).docs;

  return db.runTransaction(async (transaction) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(booking.id);
    const userRef = db.collection('users').doc(userId);

    const [bookingSnap, userSnap] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(userRef),
    ]);

    if (!userSnap.exists) throw new Error('User profile does not exist.');
    const currentBalance = userSnap.data()?.balanceUSD ?? 0;

    // A repeated request may return the original result; a reused ID must never overwrite another booking.
    if (bookingSnap.exists) {
      const existingBooking = bookingSnap.data() as BookingRecord;
      if (matchesExistingBookingRequest(existingBooking, booking)) {
        return {
          bookingId: booking.id,
          newBalance: currentBalance,
          totalPrice: existingBooking.totalPrice ?? 0,
        };
      }
      throw new BookingIdConflictError();
    }

    const totalPrice = await resolveBookingTotalPrice(transaction, db, booking);
    const bookingToWrite: BookingRecord = { ...booking, totalPrice };

    if (currentBalance < totalPrice) throw new InsufficientFundsError();

    await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, booking.id);
    writeBookingWithAvailability(transaction, db, bookingToWrite);
    const newBalance = currentBalance - totalPrice;
    transaction.update(userRef, { balanceUSD: newBalance });
    if (totalPrice > 0) {
      recordWalletLedgerEntryInTransaction(transaction, db, {
        userId,
        amount: -totalPrice,
        balanceAfter: newBalance,
        type: 'lesson_payment',
        subjectName: bookingToWrite.instructorName,
        bookingId: bookingToWrite.id,
        entryId: walletLedgerEntryId('lesson_payment', bookingToWrite.id),
      });
    }

    return {
      bookingId: booking.id,
      newBalance,
      totalPrice,
    };
  });
}

// ---------------------------------------------------------------------------
// createGuestBookingRecord
// Server-side equivalent of the client-side createGuestBooking transaction.
// Reserves a slot and writes the booking without charging any user balance.
// ---------------------------------------------------------------------------

export async function createGuestBookingRecord(
  db: Firestore,
  booking: BookingRecord
): Promise<void> {
  const existingSlotDocs = (
    await db
      .collection(AVAILABILITY_SLOTS_COLLECTION)
      .where('instructorId', '==', booking.instructorId)
      .get()
  ).docs;

  return db.runTransaction(async (transaction) => {
    const totalPrice = await resolveBookingTotalPrice(transaction, db, booking);
    const bookingToWrite: BookingRecord = { ...booking, totalPrice };

    await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, booking.id);
    writeBookingWithAvailability(transaction, db, bookingToWrite);
  });
}

// ---------------------------------------------------------------------------
// BookingScheduleUpdates / rescheduleBookingRecord
// Server-side equivalent of the client-side rescheduleBooking transaction.
// Atomically swaps hour_locks and availability_slot when date, time, or
// instructor changes. Works for both reschedule and instructor reassignment.
// ---------------------------------------------------------------------------

export type BookingScheduleUpdates = {
  date?: string;
  time?: string;
  instructorId?: string;
  instructorName?: string;
  instructorAvatar?: string;
};

export async function rescheduleBookingRecord(
  db: Firestore,
  bookingId: string,
  updates: BookingScheduleUpdates
): Promise<void> {
  const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) throw new Error('Booking does not exist.');

  const currentBooking = bookingSnap.data() as BookingRecord;
  if (isCourseBooking(currentBooking)) {
    throw new Error('Course bookings cannot be rescheduled.');
  }

  const nextInstructorId = updates.instructorId ?? currentBooking.instructorId;
  const existingSlotDocs = (
    await db
      .collection(AVAILABILITY_SLOTS_COLLECTION)
      .where('instructorId', '==', nextInstructorId)
      .get()
  ).docs;

  return db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(bookingRef);
    if (!freshSnap.exists) throw new Error('Booking does not exist.');

    const bookingData = freshSnap.data() as BookingRecord;
    const nextBooking: BookingRecord = {
      ...bookingData,
      date: updates.date ?? bookingData.date,
      time: updates.time ?? bookingData.time,
      instructorId: updates.instructorId ?? bookingData.instructorId,
      instructorName: updates.instructorName ?? bookingData.instructorName,
      instructorAvatar: updates.instructorAvatar ?? bookingData.instructorAvatar,
    };

    // Read old locks inside the transaction to know which ones actually exist.
    const existingOldLockRefs: DocumentReference[] = [];
    for (const lockId of buildHourLockIds(bookingData)) {
      const lockRef = db.collection(AVAILABILITY_HOUR_LOCKS_COLLECTION).doc(lockId);
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists) {
        existingOldLockRefs.push(lockRef);
      }
    }

    await assertNoSlotOverlap(transaction, db, nextBooking, existingSlotDocs, bookingId);

    // Build the partial update for the booking document.
    const bookingUpdate: Record<string, string> = {};
    if (updates.date !== undefined) bookingUpdate.date = nextBooking.date;
    if (updates.time !== undefined) bookingUpdate.time = nextBooking.time;
    if (updates.instructorId !== undefined) {
      bookingUpdate.instructorId = nextBooking.instructorId;
      bookingUpdate.instructorName = nextBooking.instructorName;
      bookingUpdate.instructorAvatar = nextBooking.instructorAvatar;
    }

    if (Object.keys(bookingUpdate).length > 0) {
      const endsAt = computeLessonEndsAtIso(nextBooking) ?? undefined;
      if (endsAt) bookingUpdate.endsAt = endsAt;
      transaction.update(bookingRef, bookingUpdate);
    }

    // Delete stale locks, then write new ones.
    for (const lockRef of existingOldLockRefs) {
      transaction.delete(lockRef);
    }

    if (blocksInstructorAvailability(nextBooking)) {
      writeHourLocks(transaction, db, nextBooking);
      transaction.set(
        db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId),
        toAvailabilitySlot(nextBooking)
      );
    } else {
      transaction.delete(db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId));
    }
  });
}

// ---------------------------------------------------------------------------
// finalizeBookingCompletionRecord
// Server-side equivalent of the client-side finalizeBookingCompletion
// transaction. Marks the booking as completed, releases the availability slot
// for individual lessons, and increments availableSeats for active course
// enrollments — all within a single Firestore transaction.
// ---------------------------------------------------------------------------

export type BookingCompletionResult = { bookingId: string; status: 'completed' };

export async function finalizeBookingCompletionRecord(
  db: Firestore,
  bookingId: string
): Promise<BookingCompletionResult | null> {
  return db.runTransaction(async (transaction) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) return null;

    const booking = bookingSnap.data() as BookingRecord;
    if (booking.status === 'completed') return { bookingId, status: 'completed' };

    const isCourse = isCourseBooking(booking);
    const isActiveEnrollment =
      isCourse &&
      booking.isDeleted !== true &&
      (booking.status === 'pending' ||
        booking.status === 'confirmed' ||
        booking.status === 'pending_cancellation');

    // All reads must happen before any writes in a Firestore transaction.
    let courseRef: FirebaseFirestore.DocumentReference | null = null;
    let availableSeats: number | null = null;
    let totalSeats: number | null = null;

    if (isActiveEnrollment) {
      const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
      courseRef = db.collection('courses').doc(courseId);
      const courseSnap = await transaction.get(courseRef);
      if (courseSnap.exists) {
        const course = courseSnap.data() as { availableSeats?: number; totalSeats?: number };
        availableSeats = course.availableSeats ?? 0;
        totalSeats = course.totalSeats ?? availableSeats;
      }
    }

    // Writes.
    transaction.update(bookingRef, { status: 'completed' });

    if (!isCourse) {
      transaction.delete(db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId));
    } else if (
      courseRef !== null &&
      availableSeats !== null &&
      totalSeats !== null &&
      availableSeats < totalSeats
    ) {
      transaction.update(courseRef, { availableSeats: availableSeats + 1 });
    }

    return { bookingId, status: 'completed' };
  });
}
