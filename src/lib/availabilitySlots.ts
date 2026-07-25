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
