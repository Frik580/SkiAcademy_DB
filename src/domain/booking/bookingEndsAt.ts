import { Booking } from '../../types';
import { isCourseBooking } from '../../lib/availabilitySlots';
import { parseCourseEndDateTime } from '../../lib/i18n/courseDates';

type BookingSchedule = Pick<Booking, 'date' | 'time' | 'durationHours' | 'instructorId'>;

export function computeBookingEndsAt(booking: BookingSchedule): Date | null {
  if (isCourseBooking(booking as Booking)) {
    return parseCourseEndDateTime(booking.date);
  }

  const parts = booking.date.split('-');
  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const [hour, minute] = (booking.time || '00:00').split(':').map(Number);
  const startsAt = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
  if (isNaN(startsAt.getTime())) return null;

  return new Date(startsAt.getTime() + (booking.durationHours || 1) * 60 * 60 * 1000);
}

export function computeBookingEndsAtIso(booking: BookingSchedule): string | null {
  const endsAt = computeBookingEndsAt(booking);
  if (!endsAt || isNaN(endsAt.getTime())) return null;
  return endsAt.toISOString();
}

export function withBookingEndsAt<T extends Booking>(booking: T): T {
  const endsAt = computeBookingEndsAtIso(booking);
  return endsAt ? { ...booking, endsAt } : booking;
}

export function isBookingEligibleForAutoComplete(booking: Booking, now = new Date()): boolean {
  if (booking.status !== 'confirmed' && booking.status !== 'pending_cancellation') {
    return false;
  }

  if (booking.endsAt) {
    const storedEndsAt = new Date(booking.endsAt);
    return !isNaN(storedEndsAt.getTime()) && now >= storedEndsAt;
  }

  const endsAt = computeBookingEndsAt(booking);
  return endsAt !== null && !isNaN(endsAt.getTime()) && now >= endsAt;
}
