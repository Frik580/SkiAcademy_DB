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

const getCourseForBooking = (booking: ScheduleBookingSlice, courses: Course[]) => {
  if (!booking.instructorId.startsWith('course_')) return undefined;
  const courseId = booking.instructorId.substring('course_'.length);
  return courses.find((course) => course.id === courseId);
};

const getBookingDailyTimeWindow = (
  booking: ScheduleBookingSlice,
  courses: Course[],
  dateStr: string
): { start: Date; end: Date } | null => {
  if (booking.instructorId.startsWith('course_')) {
    const course = getCourseForBooking(booking, courses);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [sh, sm] = parsed.startTime.split(':').map(Number);
    const [eh, em] = parsed.endTime.split(':').map(Number);
    return {
      start: buildLocalDateTime(dateStr, sh, sm),
      end: buildLocalDateTime(dateStr, eh, em),
    };
  }
  const startParsed = parseBookingStartTime(booking.time);
  const endParsed = parseBookingEndTime(booking.time, booking.durationHours);
  if (!startParsed || !endParsed) return null;
  return {
    start: buildLocalDateTime(dateStr, startParsed.h, startParsed.m),
    end: buildLocalDateTime(dateStr, endParsed.h, endParsed.m),
  };
};

/** First day + start hour of the booking or course. */
export const resolveBookingStartDateTime = (
  booking: ScheduleBookingSlice,
  courses: Course[] = []
): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const course = getCourseForBooking(booking, courses);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [h, m] = parsed.startTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(parsed.start), h, m);
  }
  const startTime = parseBookingStartTime(booking.time);
  return startTime
    ? buildLocalDateTime(booking.date, startTime.h, startTime.m)
    : buildLocalDateTime(booking.date, 0, 0);
};

/** Last day + end hour of the booking or course. */
export const resolveBookingEndDateTime = (
  booking: ScheduleBookingSlice,
  courses: Course[] = []
): Date | null => {
  if (booking.instructorId.startsWith('course_')) {
    const course = getCourseForBooking(booking, courses);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const [h, m] = parsed.endTime.split(':').map(Number);
    return buildLocalDateTime(toYMD(parsed.end), h, m);
  }
  const endTime = parseBookingEndTime(booking.time, booking.durationHours);
  return endTime ? buildLocalDateTime(booking.date, endTime.h, endTime.m) : null;
};

export const isBookingPastBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[] = [],
  now = new Date()
): boolean => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return true;
  }
  const end = resolveBookingEndDateTime(booking, courses);
  return end ? now >= end : false;
};

export const isBookingUpcomingBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[] = [],
  now = new Date()
): boolean => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  const start = resolveBookingStartDateTime(booking, courses);
  return start ? now < start : false;
};

/** Started but last day/end hour not reached yet (multi-day courses included). */
export const isBookingCurrentBySchedule = (
  booking: ScheduleBookingSlice,
  courses: Course[] = [],
  now = new Date()
): boolean => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  return (
    !isBookingPastBySchedule(booking, courses, now) &&
    !isBookingUpcomingBySchedule(booking, courses, now)
  );
};

const isActiveBooking = (booking: ScheduleBookingSlice) =>
  !booking.isDeleted && (booking.status === 'confirmed' || booking.status === 'pending');

/** In session right now (today's time slot). */
export const isBookingInProgressNow = (
  booking: ScheduleBookingSlice,
  courses: Course[] = [],
  now = new Date()
): boolean => {
  if (!isActiveBooking(booking)) return false;
  const todayStr = toYMD(now);
  if (!isBookingOnDate(booking, todayStr, courses)) return false;
  const window = getBookingDailyTimeWindow(booking, courses, todayStr);
  if (!window) return false;
  return now >= window.start && now < window.end;
};

/** True if a lesson booking occurs on dateStr. */
export const isBookingOnDate = (
  booking: ScheduleBookingSlice,
  dateStr: string,
  courses: Course[] = []
): boolean => {
  if (!booking || booking.isDeleted || booking.status === 'cancelled') return false;
  if (booking.userId?.startsWith('system_block_')) return false;

  if (booking.instructorId.startsWith('course_')) {
    const course = getCourseForBooking(booking, courses);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    const startStr = toYMD(parsed.start);
    const endStr = toYMD(parsed.end);
    return dateStr >= startStr && dateStr <= endStr;
  }

  if (booking.date === dateStr) return true;

  const dotSeparatedDate = booking.date?.split('.');
  if (dotSeparatedDate?.length === 3) {
    const [day, month, year] = dotSeparatedDate;
    if (`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` === dateStr) return true;
  }

  return false;
};

export const getCurrentBookingsInProgress = (
  bookings: ScheduleBookingSlice[],
  courses: Course[] = [],
  now = new Date()
): ScheduleBookingSlice[] =>
  bookings
    .filter((booking) => isBookingInProgressNow(booking, courses, now))
    .sort((left, right) => left.time.localeCompare(right.time));

export interface BookingTodaySessionCountdown {
  booking: ScheduleBookingSlice;
  startsAt: Date;
}

/** Nearest session or course on today that has not started yet. */
export const getTodayBookingSessionCountdown = (
  bookings: ScheduleBookingSlice[],
  courses: Course[] = [],
  now = new Date()
): BookingTodaySessionCountdown | null => {
  const todayStr = toYMD(now);
  const candidates: BookingTodaySessionCountdown[] = [];

  for (const booking of bookings.filter(isActiveBooking)) {
    if (!isBookingOnDate(booking, todayStr, courses)) continue;
    const window = getBookingDailyTimeWindow(booking, courses, todayStr);
    if (!window || now >= window.start) continue;
    candidates.push({ booking, startsAt: window.start });
  }

  candidates.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  return candidates[0] ?? null;
};

export interface BookingNextSessionItem {
  booking: ScheduleBookingSlice;
  dateStr: string;
}

export const getNextBookingsNext7Days = (
  bookings: ScheduleBookingSlice[],
  courses: Course[] = [],
  fromDate = new Date()
): BookingNextSessionItem[] => {
  const todayStr = toYMD(fromDate);
  const weekDateStrs: string[] = [];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(fromDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    weekDateStrs.push(toYMD(date));
  }

  const activeBookings = bookings.filter(isActiveBooking);
  const items: BookingNextSessionItem[] = [];

  for (const booking of activeBookings) {
    for (const dateStr of weekDateStrs) {
      if (!isBookingOnDate(booking, dateStr, courses)) continue;
      if (dateStr === todayStr) {
        const startTime = parseBookingStartTime(booking.time);
        if (startTime) {
          const sessionStart = new Date(fromDate);
          sessionStart.setHours(startTime.h, startTime.m, 0, 0);
          const durationMs = (booking.durationHours || 1) * 3600 * 1000;
          const sessionEnd = new Date(sessionStart.getTime() + durationMs);
          if (sessionEnd < fromDate) continue;
        }
      }
      items.push({ booking, dateStr });
    }
  }

  const compareTimes = (timeA: string, timeB: string) => {
    const startA = parseBookingStartTime(timeA);
    const startB = parseBookingStartTime(timeB);
    if (startA && startB) {
      if (startA.h !== startB.h) return startA.h - startB.h;
      return startA.m - startB.m;
    }
    return timeA.localeCompare(timeB);
  };

  return items.sort((left, right) => {
    if (left.dateStr !== right.dateStr) return left.dateStr.localeCompare(right.dateStr);
    return compareTimes(left.booking.time, right.booking.time);
  });
};

/** @deprecated Use hasTrainingTodayFromSessions for mixed lesson/course calendars. */
export const hasTrainingTodayFromLessons = (
  bookings: ScheduleBookingSlice[],
  courses: Course[] = [],
  fromDate = new Date()
): boolean => {
  const todayStr = toYMD(fromDate);
  return bookings.some(
    (booking) =>
      !booking.isDeleted &&
      booking.status !== 'cancelled' &&
      isBookingOnDate(booking, todayStr, courses)
  );
};
