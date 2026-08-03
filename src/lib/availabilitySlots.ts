import { AvailabilitySlot, Booking } from '../types';

export const AVAILABILITY_SLOTS_COLLECTION = 'availability_slots';
export const AVAILABILITY_MIGRATION_SETTING = 'availability_slots_migration';

export const isCourseBooking = (booking: Pick<Booking, 'instructorId'>): boolean =>
  booking.instructorId.startsWith('course_');

export const blocksInstructorAvailability = (
  booking: Pick<Booking, 'instructorId' | 'status' | 'isDeleted'>
): boolean =>
  !isCourseBooking(booking) &&
  !booking.isDeleted &&
  (booking.status === 'pending' ||
    booking.status === 'confirmed' ||
    booking.status === 'pending_cancellation');

export const toAvailabilitySlot = (
  booking: Pick<Booking, 'id' | 'userId' | 'instructorId' | 'date' | 'time' | 'durationHours'>
): AvailabilitySlot => ({
  bookingId: booking.id,
  instructorId: booking.instructorId,
  date: booking.date,
  time: booking.time,
  durationHours: booking.durationHours,
  slotType: booking.userId.startsWith('system_block_') ? 'block' : 'lesson',
});

export const toLocalDateStr = (fromDate = new Date()): string => {
  const y = fromDate.getFullYear();
  const m = String(fromDate.getMonth() + 1).padStart(2, '0');
  const day = String(fromDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const timeStrToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const LESSON_DAY_END_MINUTES = 19 * 60;

export const DEFAULT_LESSON_TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
] as const;

export const isBookingSlotInPast = (
  dateStr: string,
  slotTime: string,
  fromDate = new Date()
): boolean => {
  if (dateStr !== toLocalDateStr(fromDate)) return false;
  return timeStrToMinutes(slotTime) < fromDate.getHours() * 60 + fromDate.getMinutes();
};

export const fitsLessonDaySchedule = (slotTime: string, durationHours: number): boolean => {
  const start = timeStrToMinutes(slotTime);
  return start + durationHours * 60 <= LESSON_DAY_END_MINUTES;
};
