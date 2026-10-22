import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import { formatDateLocalYMD } from './scheduleUtils';
import type { ScheduleBooking, ScheduleCourse } from './scheduleContracts';
import { hourToMinutes, normalizeScheduleTime, scheduleIntervalsOverlap } from './scheduleUtils';
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
  return scheduleIntervalsOverlap(slotStart, slotEnd, bookingStart, bookingEnd);
}

export function scheduleBookingStartsAtSlot(booking: ScheduleBooking, slotTime: string): boolean {
  return normalizeScheduleTime(booking.time) === slotTime;
}

export function firstOverlappingSlotIndex(booking: ScheduleBooking): number {
  return SCHEDULE_TIME_SLOTS.findIndex((slotTime) =>
    scheduleBookingOverlapsSlot(booking, slotTime)
  );
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

export type ScheduleDayEvent = {
  key: string;
  start: number;
  end: number;
  conflict: boolean;
} & ({ kind: 'booking'; booking: ScheduleBooking } | { kind: 'course'; course: ScheduleCourse });

export { scheduleIntervalsOverlap } from './scheduleUtils';

/** Keep every entity once, including events outside the hourly viewport. */
export function scheduleDayEvents(
  bookings: readonly ScheduleBooking[],
  courses: readonly ScheduleCourse[],
  instructorId: string,
  date: string
): ScheduleDayEvent[] {
  const events: ScheduleDayEvent[] = scheduleBookingsForDay(bookings, instructorId, date).map(
    (booking) => {
      const start = hourToMinutes(normalizeScheduleTime(booking.time));
      return {
        key: `booking:${booking.id}`,
        kind: 'booking',
        booking,
        start,
        end: start + booking.durationHours * 60,
        conflict: false,
      };
    }
  );
  for (const course of courses) {
    if (!course.instructorIds?.includes(instructorId)) continue;
    const { start, end, startTime, endTime } = parseCourseDates(course.dates);
    if (date < formatDateLocalYMD(start) || date > formatDateLocalYMD(end)) continue;
    events.push({
      key: `course:${course.id}`,
      kind: 'course',
      course,
      start: hourToMinutes(startTime),
      end: hourToMinutes(endTime),
      conflict: false,
    });
  }
  events.sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key));
  // Sweep the sorted intervals; mark both ends of every conflicting pair.
  const active: ScheduleDayEvent[] = [];
  for (const event of events) {
    for (let index = active.length - 1; index >= 0; index--) {
      if (active[index]!.end <= event.start) active.splice(index, 1);
    }
    for (const previous of active) {
      if (scheduleIntervalsOverlap(previous.start, previous.end, event.start, event.end)) {
        previous.conflict = true;
        event.conflict = true;
      }
    }
    active.push(event);
  }
  return events;
}

/** The hourly grid also cannot represent two adjacent fractional-hour events in one cell. */
export function scheduleDayNeedsList(events: readonly ScheduleDayEvent[]): boolean {
  if (events.some((event) => event.conflict || event.start < 8 * 60 || event.end > 19 * 60))
    return true;
  return SCHEDULE_TIME_SLOTS.some((time) => {
    const start = hourToMinutes(time);
    return (
      events.filter((event) => scheduleIntervalsOverlap(start, start + 60, event.start, event.end))
        .length > 1
    );
  });
}
