import { Firestore, QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';

const BOOKINGS_COLLECTION = 'bookings';
const AVAILABILITY_SLOTS_COLLECTION = 'availability_slots';
const AVAILABILITY_HOUR_LOCKS_COLLECTION = 'availability_hour_locks';

export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'pending_cancellation';

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
}

export interface AvailabilitySlot {
  bookingId: string;
  instructorId: string;
  date: string;
  time: string;
  durationHours: number;
  slotType: 'lesson' | 'block';
}

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

export class BookingSlotOverlapError extends Error {
  constructor() {
    super('Instructor slot is no longer available');
    this.name = 'BookingSlotOverlapError';
  }
}

function timeStrToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isCourseBooking(booking: Pick<BookingRecord, 'instructorId'>): boolean {
  return booking.instructorId.startsWith('course_');
}

function blocksInstructorAvailability(
  booking: Pick<BookingRecord, 'instructorId' | 'status'>
): boolean {
  return (
    !isCourseBooking(booking) &&
    (booking.status === 'pending' ||
      booking.status === 'confirmed' ||
      booking.status === 'pending_cancellation')
  );
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

function buildHourLockId(instructorId: string, date: string, time: string): string {
  return `${instructorId}__${date}__${time}`;
}

function buildHourLockIds(
  booking: Pick<BookingRecord, 'instructorId' | 'date' | 'time' | 'durationHours'>
): string[] {
  const startMinutes = timeStrToMinutes(booking.time);
  const lockIds: string[] = [];

  for (let hour = 0; hour < booking.durationHours; hour++) {
    const minutes = startMinutes + hour * 60;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    lockIds.push(buildHourLockId(booking.instructorId, booking.date, `${hh}:${mm}`));
  }

  return lockIds;
}

function slotsOverlap(
  a: Pick<BookingRecord, 'time' | 'durationHours'>,
  b: Pick<AvailabilitySlot, 'time' | 'durationHours'>
): boolean {
  const aStart = timeStrToMinutes(a.time);
  const aEnd = aStart + a.durationHours * 60;
  const bStart = timeStrToMinutes(b.time);
  const bEnd = bStart + b.durationHours * 60;
  return aStart < bEnd && aEnd > bStart;
}

function hasOverlappingAvailabilitySlot(
  candidate: Pick<BookingRecord, 'time' | 'durationHours'>,
  existingSlots: AvailabilitySlot[],
  excludeBookingId?: string
): boolean {
  return existingSlots.some((slot) => {
    if (excludeBookingId && slot.bookingId === excludeBookingId) return false;
    return slotsOverlap(candidate, slot);
  });
}

function computeBookingEndsAtIso(
  booking: Pick<BookingRecord, 'date' | 'time' | 'durationHours'>
): string | null {
  const parts = booking.date.split('-');
  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const [hour, minute] = (booking.time || '00:00').split(':').map(Number);
  const startsAt = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
  if (isNaN(startsAt.getTime())) return null;

  return new Date(startsAt.getTime() + (booking.durationHours || 1) * 60 * 60 * 1000).toISOString();
}

function withBookingTimestamps(booking: BookingRecord): BookingRecord {
  const createdAt = booking.createdAt ?? new Date().toISOString();
  const endsAt = booking.endsAt ?? computeBookingEndsAtIso(booking) ?? undefined;
  return { ...booking, createdAt, ...(endsAt ? { endsAt } : {}) };
}

async function resolveBookingTotalPrice(
  transaction: Transaction,
  db: Firestore,
  booking: BookingRecord
): Promise<number> {
  if (booking.userId.startsWith('system_block_')) {
    return 0;
  }

  if (isCourseBooking(booking)) {
    const courseId = booking.courseId ?? booking.instructorId.slice('course_'.length);
    const courseSnap = await transaction.get(db.collection('courses').doc(courseId));
    if (!courseSnap.exists) throw new Error('Course does not exist.');
    const courseData = courseSnap.data();
    if (typeof courseData?.price !== 'number') throw new Error('Invalid course price.');
    return courseData.price;
  }

  const instructorSnap = await transaction.get(
    db.collection('instructors').doc(booking.instructorId)
  );
  if (!instructorSnap.exists) throw new Error('Instructor does not exist.');
  const pricePerHour = instructorSnap.data()?.pricePerHour;
  if (typeof pricePerHour !== 'number' || pricePerHour < 0) {
    throw new Error('Invalid instructor price.');
  }
  return pricePerHour * booking.durationHours;
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
    const totalPrice = await resolveBookingTotalPrice(transaction, db, booking);
    const bookingToWrite: BookingRecord = { ...booking, totalPrice };

    const userRef = db.collection('users').doc(userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('User profile does not exist.');

    const currentBalance = userSnap.data()?.balanceUSD ?? 0;
    if (currentBalance < totalPrice) throw new InsufficientFundsError();

    await assertNoSlotOverlap(transaction, db, bookingToWrite, existingSlotDocs, booking.id);
    writeBookingWithAvailability(transaction, db, bookingToWrite);
    transaction.update(userRef, { balanceUSD: currentBalance - totalPrice });

    return {
      bookingId: booking.id,
      newBalance: currentBalance - totalPrice,
      totalPrice,
    };
  });
}
