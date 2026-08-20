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
import { withOptionalIdempotency, type IdempotencySpec } from '../idempotency';
import {
  recordWalletLedgerEntryInTransaction,
  WALLET_LEDGER_COLLECTION,
  walletLedgerEntryId,
} from '../walletLedger';
import { settleSchoolGuestBookingInTransaction } from '../schoolGuestWallet';

export type { IdempotencySpec };

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
  isGuest?: boolean;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestNotes?: string;
  cancellationReason?: string;
  completedRecommendationIds?: string[];
  recommendations?: unknown[];
}


export type AvailabilitySlot = AvailabilitySlotLike;

export interface BookingPaymentResult {
  bookingId: string;
  newBalance: number;
  totalPrice: number;
}

export class InsufficientFundsError extends Error {
  constructor(
    readonly currentBalance?: number,
    readonly required?: number
  ) {
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

export async function resolveBookingTotalPrice(
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

async function collectExistingHourLockRefs(
  transaction: Transaction,
  db: Firestore,
  booking: Pick<BookingRecord, 'instructorId' | 'date' | 'time' | 'durationHours'>
): Promise<DocumentReference[]> {
  const existingHourLockRefs: DocumentReference[] = [];
  for (const lockId of buildHourLockIds(booking)) {
    const lockRef = db.collection(AVAILABILITY_HOUR_LOCKS_COLLECTION).doc(lockId);
    const lockSnap = await transaction.get(lockRef);
    if (lockSnap.exists) {
      existingHourLockRefs.push(lockRef);
    }
  }
  return existingHourLockRefs;
}

function deleteLessonAvailability(
  transaction: Transaction,
  db: Firestore,
  bookingId: string,
  lockRefs: DocumentReference[]
): void {
  for (const lockRef of lockRefs) {
    transaction.delete(lockRef);
  }
  transaction.delete(db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId));
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

function isWalletSubject(booking: BookingRecord): boolean {
  return (
    booking.isGuest !== true &&
    !booking.userId.startsWith('guest_') &&
    !booking.userId.startsWith('system_block_')
  );
}

function bookingPaymentLedgerRefs(db: Firestore, bookingId: string) {
  return {
    lesson: db.collection(WALLET_LEDGER_COLLECTION).doc(walletLedgerEntryId('lesson_payment', bookingId)),
    course: db.collection(WALLET_LEDGER_COLLECTION).doc(walletLedgerEntryId('course_payment', bookingId)),
  };
}

export async function chargeWalletSubjectIfUnpaid(
  transaction: Transaction,
  db: Firestore,
  booking: BookingRecord
): Promise<{ newBalance: number; charged: boolean }> {
  const userRef = db.collection('users').doc(booking.userId);
  const paymentLedgerRefs = bookingPaymentLedgerRefs(db, booking.id);

  const [userSnap, lessonPaymentSnap, coursePaymentSnap] = await Promise.all([
    isWalletSubject(booking) ? transaction.get(userRef) : Promise.resolve(null),
    transaction.get(paymentLedgerRefs.lesson),
    transaction.get(paymentLedgerRefs.course),
  ]);

  if (!isWalletSubject(booking) || !userSnap) {
    return { newBalance: 0, charged: false };
  }
  if (!userSnap.exists) {
    throw new Error('User profile does not exist.');
  }

  const currentBalance =
    typeof userSnap.data()?.balanceUSD === 'number' ? userSnap.data()?.balanceUSD : 0;
  if (lessonPaymentSnap.exists || coursePaymentSnap.exists) {
    return { newBalance: currentBalance, charged: false };
  }

  const totalPrice = await resolveBookingTotalPrice(transaction, db, booking);
  if (totalPrice <= 0) {
    return { newBalance: currentBalance, charged: false };
  }
  if (currentBalance < totalPrice) {
    throw new InsufficientFundsError(currentBalance, totalPrice);
  }

  const newBalance = currentBalance - totalPrice;
  const isCourse = isCourseBooking(booking);
  const ledgerType = isCourse ? 'course_payment' : 'lesson_payment';
  transaction.update(userRef, { balanceUSD: newBalance });
  recordWalletLedgerEntryInTransaction(transaction, db, {
    userId: booking.userId,
    amount: -totalPrice,
    balanceAfter: newBalance,
    type: ledgerType,
    subjectName: booking.instructorName,
    bookingId: booking.id,
    courseId: booking.courseId,
    entryId: walletLedgerEntryId(ledgerType, booking.id),
  });
  return { newBalance, charged: true };
}

function isActiveCourseEnrollment(booking: BookingRecord): boolean {
  return (
    isCourseBooking(booking) &&
    booking.isDeleted !== true &&
    (booking.status === 'pending' ||
      booking.status === 'confirmed' ||
      booking.status === 'pending_cancellation')
  );
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
  booking: BookingRecord,
  idempotency?: IdempotencySpec
): Promise<BookingPaymentResult> {
  const bookingWithUser: BookingRecord = { ...booking, userId };
  const isSystemBlock = userId.startsWith('system_block_');
  const existingSlotDocs = (
    await db
      .collection(AVAILABILITY_SLOTS_COLLECTION)
      .where('instructorId', '==', bookingWithUser.instructorId)
      .get()
  ).docs;

  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingWithUser.id);
    const bookingSnap = await transaction.get(bookingRef);

    // Instructor breaks / day-offs have no user wallet — reserve the slot only.
    if (isSystemBlock) {
      if (bookingSnap.exists) {
        const existingBooking = bookingSnap.data() as BookingRecord;
        if (matchesExistingBookingRequest(existingBooking, bookingWithUser)) {
          const result = {
            bookingId: bookingWithUser.id,
            newBalance: 0,
            totalPrice: existingBooking.totalPrice ?? 0,
          };
          commit(result);
          return result;
        }
        throw new BookingIdConflictError();
      }

      const totalPrice = await resolveBookingTotalPrice(transaction, db, bookingWithUser);
      const bookingToWrite: BookingRecord = { ...bookingWithUser, totalPrice };
      await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, bookingWithUser.id);
      writeBookingWithAvailability(transaction, db, bookingToWrite);

      const result = {
        bookingId: bookingWithUser.id,
        newBalance: 0,
        totalPrice,
      };
      commit(result);
      return result;
    }

    const userRef = db.collection('users').doc(userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) throw new Error('User profile does not exist.');
    const currentBalance = userSnap.data()?.balanceUSD ?? 0;

    // A repeated request may return the original result; a reused ID must never overwrite another booking.
    if (bookingSnap.exists) {
      const existingBooking = bookingSnap.data() as BookingRecord;
      if (matchesExistingBookingRequest(existingBooking, bookingWithUser)) {
        const result = {
          bookingId: bookingWithUser.id,
          newBalance: currentBalance,
          totalPrice: existingBooking.totalPrice ?? 0,
        };
        commit(result);
        return result;
      }
      throw new BookingIdConflictError();
    }

    const totalPrice = await resolveBookingTotalPrice(transaction, db, bookingWithUser);
    const bookingToWrite: BookingRecord = { ...bookingWithUser, totalPrice };

    if (currentBalance < totalPrice) throw new InsufficientFundsError(currentBalance, totalPrice);

    await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, bookingWithUser.id);
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

    const result = {
      bookingId: bookingWithUser.id,
      newBalance,
      totalPrice,
    };
    commit(result);
    return result;
  });
}

// ---------------------------------------------------------------------------
// createGuestBookingRecord
// Server-side equivalent of the client-side createGuestBooking transaction.
// Reserves a slot and writes the booking without charging any user balance.
// ---------------------------------------------------------------------------

export async function createGuestBookingRecord(
  db: Firestore,
  booking: BookingRecord,
  idempotency?: IdempotencySpec
): Promise<{ bookingId: string }> {
  if (!booking.userId.startsWith('guest_')) {
    throw new Error('Guest bookings must use a guest user id.');
  }

  const existingSlotDocs = (
    await db
      .collection(AVAILABILITY_SLOTS_COLLECTION)
      .where('instructorId', '==', booking.instructorId)
      .get()
  ).docs;

  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(booking.id);
    const bookingSnap = await transaction.get(bookingRef);

    if (bookingSnap.exists) {
      const existingBooking = bookingSnap.data() as BookingRecord;
      if (
        existingBooking.status !== 'cancelled' &&
        existingBooking.isGuest === true &&
        matchesExistingBookingRequest(existingBooking, booking)
      ) {
        const result = { bookingId: booking.id };
        commit(result);
        return result;
      }
      throw new BookingIdConflictError();
    }

    const totalPrice = await resolveBookingTotalPrice(transaction, db, booking);
    const bookingToWrite: BookingRecord = {
      ...booking,
      status: 'pending',
      isGuest: true,
      totalPrice,
    };

    await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, booking.id);
    writeBookingWithAvailability(transaction, db, bookingToWrite);
    const result = { bookingId: booking.id };
    commit(result);
    return result;
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
  /** Admin-only: allow wallet balance to go negative when the price increases. */
  allowNegativeBalance?: boolean;
};

export async function rescheduleBookingRecord(
  db: Firestore,
  bookingId: string,
  updates: BookingScheduleUpdates,
  idempotency?: IdempotencySpec
): Promise<{ success: true; bookingId: string }> {
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

  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
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

    if (bookingData.status === 'cancelled' || bookingData.status === 'completed') {
      throw new Error('Cancelled or completed bookings cannot be rescheduled.');
    }

    const instructorChanged =
      updates.instructorId !== undefined && updates.instructorId !== bookingData.instructorId;

    let instructorName = bookingData.instructorName;
    let instructorAvatar = bookingData.instructorAvatar;
    if (instructorChanged) {
      const instructorSnap = await transaction.get(
        db.collection('instructors').doc(nextBooking.instructorId)
      );
      if (!instructorSnap.exists) {
        throw new Error('Instructor does not exist.');
      }
      const instructor = instructorSnap.data() as {
        name?: string;
        avatarUrl?: string;
      };
      instructorName = instructor.name ?? nextBooking.instructorName;
      instructorAvatar = instructor.avatarUrl ?? '';
      nextBooking.instructorName = instructorName;
      nextBooking.instructorAvatar = instructorAvatar;
    } else {
      nextBooking.instructorName = bookingData.instructorName;
      nextBooking.instructorAvatar = bookingData.instructorAvatar;
    }

    const scheduleUnchanged =
      nextBooking.date === bookingData.date &&
      nextBooking.time === bookingData.time &&
      nextBooking.instructorId === bookingData.instructorId;
    if (scheduleUnchanged) {
      const result = { success: true as const, bookingId };
      commit(result);
      return result;
    }

    const existingOldLockRefs = await collectExistingHourLockRefs(transaction, db, bookingData);

    let nextTotalPrice = bookingData.totalPrice;
    let priceDelta = 0;
    let ownerRef: DocumentReference | null = null;
    let currentBalance = 0;
    if (instructorChanged) {
      nextTotalPrice = await resolveBookingTotalPrice(transaction, db, nextBooking);
      nextBooking.totalPrice = nextTotalPrice;
      priceDelta = nextTotalPrice - (bookingData.totalPrice ?? 0);
      if (priceDelta !== 0 && isWalletSubject(bookingData)) {
        ownerRef = db.collection('users').doc(bookingData.userId);
        const ownerSnap = await transaction.get(ownerRef);
        if (!ownerSnap.exists) {
          throw new Error('User profile does not exist.');
        }
        const ownerData = ownerSnap.data();
        currentBalance = typeof ownerData?.balanceUSD === 'number' ? ownerData.balanceUSD : 0;
        if (
          priceDelta > 0 &&
          currentBalance < priceDelta &&
          !updates.allowNegativeBalance
        ) {
          throw new InsufficientFundsError(currentBalance, priceDelta);
        }
      }
    }

    await assertNoSlotOverlap(transaction, db, nextBooking, existingSlotDocs, bookingId);

    const bookingUpdate: Record<string, string | number> = {};
    if (updates.date !== undefined) bookingUpdate.date = nextBooking.date;
    if (updates.time !== undefined) bookingUpdate.time = nextBooking.time;
    if (instructorChanged) {
      bookingUpdate.instructorId = nextBooking.instructorId;
      bookingUpdate.instructorName = instructorName;
      bookingUpdate.instructorAvatar = instructorAvatar;
      bookingUpdate.totalPrice = nextTotalPrice;
    }

    if (Object.keys(bookingUpdate).length > 0) {
      const endsAt = computeLessonEndsAtIso(nextBooking) ?? undefined;
      if (endsAt) bookingUpdate.endsAt = endsAt;
      transaction.update(bookingRef, bookingUpdate);
    }

    if (ownerRef && priceDelta !== 0) {
      const newBalance = currentBalance - priceDelta;
      transaction.update(ownerRef, { balanceUSD: newBalance });
      const ledgerType = priceDelta > 0 ? 'lesson_payment' : 'refund';
      recordWalletLedgerEntryInTransaction(transaction, db, {
        userId: bookingData.userId,
        amount: -priceDelta,
        balanceAfter: newBalance,
        type: ledgerType,
        subjectName: nextBooking.instructorName,
        bookingId,
        entryId: walletLedgerEntryId(ledgerType, `${bookingId}_${nextBooking.instructorId}`),
      });
    }

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

    const result = { success: true as const, bookingId };
    commit(result);
    return result;
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
  bookingId: string,
  idempotency?: IdempotencySpec
): Promise<BookingCompletionResult | null> {
  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) return null;

    const booking = bookingSnap.data() as BookingRecord;
    if (booking.status === 'completed') {
      const result = { bookingId, status: 'completed' as const };
      commit(result);
      return result;
    }

    const isCourse = isCourseBooking(booking);

    // All reads must happen before any writes in a Firestore transaction.
    let courseRef: FirebaseFirestore.DocumentReference | null = null;
    let availableSeats: number | null = null;
    let totalSeats: number | null = null;
    let existingHourLockRefs: DocumentReference[] = [];

    if (isActiveCourseEnrollment(booking)) {
      const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
      courseRef = db.collection('courses').doc(courseId);
      const courseSnap = await transaction.get(courseRef);
      if (courseSnap.exists) {
        const course = courseSnap.data() as { availableSeats?: number; totalSeats?: number };
        availableSeats = course.availableSeats ?? 0;
        totalSeats = course.totalSeats ?? availableSeats;
      }
    }

    if (!isCourse) {
      existingHourLockRefs = await collectExistingHourLockRefs(transaction, db, booking);
    }

    // Writes.
    await settleSchoolGuestBookingInTransaction(transaction, db, {
      ...booking,
      id: bookingId,
    });
    transaction.update(bookingRef, { status: 'completed' });

    if (!isCourse) {
      deleteLessonAvailability(transaction, db, bookingId, existingHourLockRefs);
    } else if (
      courseRef !== null &&
      availableSeats !== null &&
      totalSeats !== null &&
      availableSeats < totalSeats
    ) {
      transaction.update(courseRef, { availableSeats: availableSeats + 1 });
    }

    const result = { bookingId, status: 'completed' as const };
    commit(result);
    return result;
  });
}

export async function confirmBookingRecord(
  db: Firestore,
  bookingId: string,
  idempotency?: IdempotencySpec
): Promise<{ bookingId: string; status: 'confirmed' }> {
  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new Error('Booking does not exist.');
    }

    const booking = bookingSnap.data() as BookingRecord;
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      throw new Error('Cancelled or completed bookings cannot be confirmed.');
    }

    const nextBooking: BookingRecord = { ...booking, status: 'confirmed' };
    if (booking.status !== 'confirmed') {
      await chargeWalletSubjectIfUnpaid(transaction, db, booking);
      await settleSchoolGuestBookingInTransaction(transaction, db, {
        ...booking,
        id: bookingId,
      });
      transaction.update(bookingRef, { status: 'confirmed' });
    }

    if (blocksInstructorAvailability(nextBooking)) {
      writeHourLocks(transaction, db, nextBooking);
      transaction.set(
        db.collection(AVAILABILITY_SLOTS_COLLECTION).doc(bookingId),
        toAvailabilitySlot(nextBooking)
      );
    }

    const result = { bookingId, status: 'confirmed' as const };
    commit(result);
    return result;
  });
}

export async function requestBookingCancellationRecord(
  db: Firestore,
  bookingId: string,
  reason: string,
  idempotency?: IdempotencySpec
): Promise<{ bookingId: string; status: 'pending_cancellation' }> {
  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new Error('Booking does not exist.');
    }

    const booking = bookingSnap.data() as BookingRecord;
    if (booking.status === 'pending_cancellation') {
      const result = { bookingId, status: 'pending_cancellation' as const };
      commit(result);
      return result;
    }
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      throw new Error('Only pending or confirmed bookings can request cancellation.');
    }

    transaction.update(bookingRef, {
      status: 'pending_cancellation',
      cancellationReason: reason,
    });
    const result = { bookingId, status: 'pending_cancellation' as const };
    commit(result);
    return result;
  });
}

export type DeleteBookingResult = {
  bookingId: string;
  isDeletedDoc: boolean;
  newStats?: { revenue: number; count: number };
};

export async function deleteBookingRecord(
  db: Firestore,
  bookingId: string,
  idempotency?: IdempotencySpec
): Promise<DeleteBookingResult> {
  return withOptionalIdempotency(db, idempotency, async (transaction, commit) => {
    const bookingRef = db.collection(BOOKINGS_COLLECTION).doc(bookingId);
    const statsRef = db.collection('users').doc('school_global_stats');
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new Error('Booking does not exist.');
    }

    const booking = { ...(bookingSnap.data() as BookingRecord), id: bookingId };
    const isCourse = isCourseBooking(booking);
    const statsSnap = await transaction.get(statsRef);
    const statsData = statsSnap.data();
    const currentStats = {
      revenue:
        typeof statsData?.deletedCompletedRevenue === 'number'
          ? statsData.deletedCompletedRevenue
          : 0,
      count:
        typeof statsData?.deletedCompletedCount === 'number' ? statsData.deletedCompletedCount : 0,
    };

    let courseRef: DocumentReference | null = null;
    let availableSeats: number | null = null;
    let totalSeats: number | null = null;
    let existingHourLockRefs: DocumentReference[] = [];

    if (booking.status === 'completed') {
      if (booking.isDeleted === true) {
        const result = { bookingId, isDeletedDoc: false, newStats: currentStats };
        commit(result);
        return result;
      }

      const newStats = {
        revenue: currentStats.revenue + (booking.totalPrice || 0),
        count: currentStats.count + 1,
      };
      transaction.set(
        statsRef,
        {
          deletedCompletedRevenue: newStats.revenue,
          deletedCompletedCount: newStats.count,
        },
        { merge: true }
      );
      transaction.update(bookingRef, { isDeleted: true });
      const result = { bookingId, isDeletedDoc: false, newStats };
      commit(result);
      return result;
    }

    if (isActiveCourseEnrollment(booking)) {
      const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
      courseRef = db.collection('courses').doc(courseId);
      const courseSnap = await transaction.get(courseRef);
      if (courseSnap.exists) {
        const course = courseSnap.data() as { availableSeats?: number; totalSeats?: number };
        availableSeats = course.availableSeats ?? 0;
        totalSeats = course.totalSeats ?? availableSeats;
      }
    }

    if (!isCourse) {
      existingHourLockRefs = await collectExistingHourLockRefs(transaction, db, booking);
    }

    if (
      courseRef !== null &&
      availableSeats !== null &&
      totalSeats !== null &&
      availableSeats < totalSeats
    ) {
      transaction.update(courseRef, { availableSeats: availableSeats + 1 });
    }

    if (!isCourse) {
      deleteLessonAvailability(transaction, db, bookingId, existingHourLockRefs);
    }

    transaction.delete(bookingRef);
    const result = { bookingId, isDeletedDoc: true };
    commit(result);
    return result;
  });
}
