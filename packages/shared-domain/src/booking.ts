export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'pending_cancellation';

export interface BookingIdentity {
  id: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  status: BookingStatus;
  difficulty?: LessonDifficulty;
  notes?: string;
}

export interface AvailabilitySlotLike {
  bookingId: string;
  instructorId: string;
  date: string;
  time: string;
  durationHours: number;
  slotType: 'lesson' | 'block';
}

export interface BookingPriceInput {
  userId: string;
  instructorId: string;
  durationHours: number;
  courseId?: string;
  coursePrice?: number;
  instructorPricePerHour?: number;
}

export const AVAILABILITY_HOUR_LOCKS_COLLECTION = 'availability_hour_locks';

export class BookingSlotOverlapError extends Error {
  constructor() {
    super('Instructor slot is no longer available');
    this.name = 'BookingSlotOverlapError';
  }
}

export class BookingIdConflictError extends Error {
  constructor() {
    super('Booking ID is already in use for a different request.');
    this.name = 'BookingIdConflictError';
  }
}

export const isCourseBooking = (booking: Pick<BookingIdentity, 'instructorId'>): boolean =>
  booking.instructorId.startsWith('course_');

export function calculateBookingTotalPrice(input: BookingPriceInput): number {
  if (input.userId.startsWith('system_block_')) return 0;

  if (isCourseBooking(input)) {
    if (typeof input.coursePrice !== 'number') throw new Error('Invalid course price.');
    return input.coursePrice;
  }

  if (typeof input.instructorPricePerHour !== 'number' || input.instructorPricePerHour < 0) {
    throw new Error('Invalid instructor price.');
  }
  return input.instructorPricePerHour * input.durationHours;
}

export const blocksInstructorAvailability = (
  booking: Pick<BookingIdentity, 'instructorId' | 'status'> & { isDeleted?: boolean }
): boolean =>
  !isCourseBooking(booking) &&
  !booking.isDeleted &&
  (booking.status === 'pending' ||
    booking.status === 'confirmed' ||
    booking.status === 'pending_cancellation');

export const timeStrToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
};

export const slotsOverlap = (
  a: Pick<BookingIdentity, 'time' | 'durationHours'>,
  b: Pick<AvailabilitySlotLike, 'time' | 'durationHours'>
): boolean => {
  const aStart = timeStrToMinutes(a.time);
  const bStart = timeStrToMinutes(b.time);
  return aStart < bStart + b.durationHours * 60 && aStart + a.durationHours * 60 > bStart;
};

export function buildHourLockId(instructorId: string, date: string, time: string): string {
  return `${instructorId}__${date}__${time}`;
}

export function buildHourLockIds(
  booking: Pick<BookingIdentity, 'instructorId' | 'date' | 'time' | 'durationHours'>
): string[] {
  const startMinutes = timeStrToMinutes(booking.time);
  const lockIds: string[] = [];
  for (let hour = 0; hour < booking.durationHours; hour++) {
    const minutes = startMinutes + hour * 60;
    lockIds.push(
      buildHourLockId(
        booking.instructorId,
        booking.date,
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      )
    );
  }
  return lockIds;
}

export function hasOverlappingAvailabilitySlot(
  candidate: Pick<BookingIdentity, 'time' | 'durationHours'>,
  existingSlots: AvailabilitySlotLike[],
  excludeBookingId?: string
): boolean {
  return existingSlots.some(
    (slot) => (!excludeBookingId || slot.bookingId !== excludeBookingId) && slotsOverlap(candidate, slot)
  );
}

export function matchesExistingBookingRequest(
  existing: BookingIdentity,
  booking: BookingIdentity
): boolean {
  return (
    existing.userId === booking.userId &&
    existing.instructorId === booking.instructorId &&
    existing.instructorName === booking.instructorName &&
    existing.instructorAvatar === booking.instructorAvatar &&
    existing.date === booking.date &&
    existing.time === booking.time &&
    existing.durationHours === booking.durationHours &&
    existing.difficulty === booking.difficulty &&
    (existing.notes ?? '') === (booking.notes ?? '')
  );
}

export function computeLessonEndsAtIso(
  booking: Pick<BookingIdentity, 'date' | 'time' | 'durationHours'>
): string | null {
  const [year, month, day] = booking.date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hour, minute] = (booking.time || '00:00').split(':').map(Number);
  const startsAt = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
  if (Number.isNaN(startsAt.getTime())) return null;
  return new Date(startsAt.getTime() + (booking.durationHours || 1) * 60 * 60 * 1000).toISOString();
}
