import type { BookingStatus } from '@ski-academy/shared-domain';
import type { Course } from '../../../../types';
import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import { toYMD } from './studentCabinetPresentation';

export interface ScheduleBookingSlice {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly durationHours: number;
  readonly status: BookingStatus;
  readonly instructorId: string;
  readonly isDeleted?: boolean;
  readonly userId?: string;
}

export interface BookingTime {
  h: number;
  m: number;
}

const BOOKING_TIME_RANGE_RE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
const BOOKING_START_TIME_RE = /^(\d{2}):(\d{2})$/;

export const parseBookingStartTime = (time: string): BookingTime | null => {
  const rangeMatch = time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) {
    const [h, m] = rangeMatch[1].split(':').map(Number);
    return { h, m };
  }
  const startMatch = time.match(BOOKING_START_TIME_RE);
  return startMatch ? { h: Number(startMatch[1]), m: Number(startMatch[2]) } : null;
};

export const parseBookingEndTime = (time: string, durationHours: number): BookingTime | null => {
  const rangeMatch = time.match(BOOKING_TIME_RANGE_RE);
  if (rangeMatch) {
    const [h, m] = rangeMatch[2].split(':').map(Number);
    return { h, m };
  }
  const start = parseBookingStartTime(time);
  if (!start) return null;
  const total = start.h * 60 + start.m + Math.round(durationHours * 60);
  return { h: Math.floor(total / 60) % 24, m: total % 60 };
};

const buildLocalDateTime = (dateStr: string, h: number, m: number): Date => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
};

const getCourseSchedule = (booking: ScheduleBookingSlice, courses: Course[]) => {
  const courseId = booking.instructorId.substring('course_'.length);
  const course = courses.find((item) => item.id === courseId);
  return parseCourseDates(course ? course.dates : booking.date);
};

/** First day + start hour of the booking or course. */
export const resolveBookingStartDateTime = (
  booking: ScheduleBookingSlice,
  courses: Course[]
): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const schedule = getCourseSchedule(booking, courses);
    const [h, m] = schedule.startTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(schedule.start), h, m);
  }
  const startTime = parseBookingStartTime(booking.time);
  return startTime
    ? buildLocalDateTime(booking.date, startTime.h, startTime.m)
    : buildLocalDateTime(booking.date, 0, 0);
};

/** Last day + end hour of the booking or course. */
export const resolveBookingEndDateTime = (
  booking: ScheduleBookingSlice,
  courses: Course[]
): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const schedule = getCourseSchedule(booking, courses);
    const [h, m] = schedule.endTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(schedule.end), h, m);
  }
  const endTime = parseBookingEndTime(booking.time, booking.durationHours);
  return endTime ? buildLocalDateTime(booking.date, endTime.h, endTime.m) : null;
};

export const isBookingPastBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[],
  now = new Date()
) => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return true;
  }
  const end = resolveBookingEndDateTime(booking, courses);
  return end ? now >= end : false;
};

export const isBookingUpcomingBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[],
  now = new Date()
) => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  const start = resolveBookingStartDateTime(booking, courses);
  return start ? now < start : false;
};

/** Started but last day/end hour not reached yet (multi-day courses included). */
export const isBookingCurrentBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[],
  now = new Date()
) =>
  !booking.isDeleted &&
  booking.status !== 'cancelled' &&
  booking.status !== 'completed' &&
  !isBookingPastBySchedule(booking, courses, now) &&
  !isBookingUpcomingBySchedule(booking, courses, now);

/** True if a booking has a session on dateStr (private lesson or multi-day course). */
export const isBookingOnDate = (
  booking: ScheduleBookingSlice,
  dateStr: string,
  courses: Course[]
) => {
  if (!booking || booking.isDeleted || booking.status === 'cancelled') return false;
  if (booking.userId?.startsWith('system_block_')) return false;
  if (booking.date === dateStr) return true;

  const dotSeparatedDate = booking.date?.split('.');
  if (dotSeparatedDate?.length === 3) {
    const [day, month, year] = dotSeparatedDate;
    if (`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` === dateStr) return true;
  }

  if (!booking.instructorId.startsWith('course_')) return false;
  const courseId = booking.instructorId.substring('course_'.length);
  const course = courses.find((item) => item.id === courseId);
  if (!course?.dates) return false;

  const schedule = parseCourseDates(course.dates);
  return schedule.isValid && dateStr >= toYMD(schedule.start) && dateStr <= toYMD(schedule.end);
};
