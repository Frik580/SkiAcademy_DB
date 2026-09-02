import type { ScheduleBooking } from './scheduleContracts';
import { hourToMinutes, normalizeScheduleTime } from './scheduleUtils';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';

export function isActiveScheduleBooking(
  booking: ScheduleBooking,
  instructorId: string,
  selectedDate: string
): boolean {
  return (
    booking.instructorId === instructorId &&
    booking.date === selectedDate &&
    booking.status !== 'cancelled' &&
    !booking.isDeleted
  );
}

export function scheduleBookingsForDay(
  bookings: readonly ScheduleBooking[],
  instructorId: string,
  selectedDate: string
): ScheduleBooking[] {
  return bookings.filter((booking) => isActiveScheduleBooking(booking, instructorId, selectedDate));
}

/** Standard half-open slot/booking overlap: slotStart < bookingEnd && slotEnd > bookingStart */
export function scheduleBookingOverlapsSlot(booking: ScheduleBooking, slotTime: string): boolean {
  const slotStart = hourToMinutes(slotTime);
  const slotEnd = slotStart + 60;
  const bookingStart = hourToMinutes(normalizeScheduleTime(booking.time));
  const bookingEnd = bookingStart + booking.durationHours * 60;
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

export function scheduleBookingStartsAtSlot(booking: ScheduleBooking, slotTime: string): boolean {
  return normalizeScheduleTime(booking.time) === slotTime;
}

export function firstOverlappingSlotIndex(booking: ScheduleBooking): number {
  return SCHEDULE_TIME_SLOTS.findIndex((slotTime) => scheduleBookingOverlapsSlot(booking, slotTime));
}

export function dayViewBookingForSlot(
  bookings: readonly ScheduleBooking[],
  instructorId: string,
  selectedDate: string,
  slotTime: string,
  slotIndex: number
): { booking: ScheduleBooking; startsHere: boolean } | undefined {
  const dayBookings = scheduleBookingsForDay(bookings, instructorId, selectedDate);
  const starting = dayBookings.find((booking) => scheduleBookingStartsAtSlot(booking, slotTime));
  if (starting) {
    return { booking: starting, startsHere: true };
  }

  const covering = dayBookings.find((booking) => scheduleBookingOverlapsSlot(booking, slotTime));
  if (!covering) {
    return undefined;
  }

  const anchorIndex = firstOverlappingSlotIndex(covering);
  if (anchorIndex < 0) {
    return undefined;
  }

  return {
    booking: covering,
    startsHere: anchorIndex === slotIndex,
  };
}

export function dayViewColSpanForBooking(booking: ScheduleBooking, slotIndex: number): number {
  let span = 1;
  for (let index = slotIndex + 1; index < SCHEDULE_TIME_SLOTS.length; index += 1) {
    if (scheduleBookingOverlapsSlot(booking, SCHEDULE_TIME_SLOTS[index]!)) {
      span += 1;
    } else {
      break;
    }
  }
  return Math.min(span, SCHEDULE_TIME_SLOTS.length - slotIndex);
}
