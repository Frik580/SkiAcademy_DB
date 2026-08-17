import type { Booking, Course } from '../../../../types';
import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import { formatDateLocalYMD, hourToMinutes } from './scheduleUtils';

export const SCHEDULE_TIME_SLOTS = [
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

export const SCHEDULE_CLOSING_TIME_MINUTES = 19 * 60;

const SCHEDULE_DURATIONS = [1, 2, 3, 4] as const;

interface ScheduleOverlapOptions {
  bookings: Booking[];
  courses: Course[];
  instructorId: string;
  date: string;
  time: string;
  durationHours: number;
  excludeBookingId?: string;
}

export function hasScheduleOverlap({
  bookings,
  courses,
  instructorId,
  date,
  time,
  durationHours,
  excludeBookingId,
}: ScheduleOverlapOptions): boolean {
  const startMin = hourToMinutes(time);
  const endMin = startMin + durationHours * 60;

  const hasBookingOverlap = bookings.some((booking) => {
    if (booking.instructorId !== instructorId) return false;
    if (booking.date !== date) return false;
    if (booking.status === 'cancelled') return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;

    const bookingStart = hourToMinutes(booking.time);
    const bookingEnd = bookingStart + booking.durationHours * 60;
    return startMin < bookingEnd && endMin > bookingStart;
  });

  if (hasBookingOverlap) return true;

  return courses.some((course) => {
    if (!course.instructorIds?.includes(instructorId)) return false;

    const {
      start: courseStart,
      end: courseEnd,
      startTime,
      endTime,
    } = parseCourseDates(course.dates);
    const courseStartDate = formatDateLocalYMD(courseStart);
    const courseEndDate = formatDateLocalYMD(courseEnd);

    if (date < courseStartDate || date > courseEndDate) return false;

    const courseStartMinutes = hourToMinutes(startTime);
    const courseEndMinutes = hourToMinutes(endTime);
    return startMin < courseEndMinutes && endMin > courseStartMinutes;
  });
}

interface AvailableMoveTimesOptions {
  bookings: Booking[];
  courses: Course[];
  instructorId: string;
  date: string;
  durationHours: number;
  excludeBookingId?: string;
}

export function getAvailableMoveTimeSlots({
  bookings,
  courses,
  instructorId,
  date,
  durationHours,
  excludeBookingId,
}: AvailableMoveTimesOptions): string[] {
  return SCHEDULE_TIME_SLOTS.filter((time) => {
    const endMinutes = hourToMinutes(time) + durationHours * 60;
    if (endMinutes > SCHEDULE_CLOSING_TIME_MINUTES) return false;

    return !hasScheduleOverlap({
      bookings,
      courses,
      instructorId,
      date,
      time,
      durationHours,
      excludeBookingId,
    });
  });
}

interface AvailableDurationsOptions {
  bookings: Booking[];
  courses: Course[];
  instructorId: string;
  date: string;
  time: string;
}

export function getAvailableScheduleDurations({
  bookings,
  courses,
  instructorId,
  date,
  time,
}: AvailableDurationsOptions): number[] {
  const startMinutes = hourToMinutes(time);

  return SCHEDULE_DURATIONS.filter((durationHours) => {
    const endMinutes = startMinutes + durationHours * 60;
    if (endMinutes > SCHEDULE_CLOSING_TIME_MINUTES) return false;

    return !hasScheduleOverlap({
      bookings,
      courses,
      instructorId,
      date,
      time,
      durationHours,
    });
  });
}
