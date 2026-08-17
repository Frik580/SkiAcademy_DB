import { Booking, Course } from '../../../../types';
import { parseCourseDates } from '../../../../app/providers/LanguageContext';
import {
  isBookingOnDate,
  parseBookingEndTime,
  parseBookingStartTime,
} from './studentBookingSchedule';
import { toYMD } from './studentCabinetPresentation';

const isActiveBooking = (booking: Booking) =>
  !booking.isDeleted && (booking.status === 'confirmed' || booking.status === 'pending');

const buildLocalDateTime = (dateStr: string, h: number, m: number) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0);
};

const getBookingDailyTimeWindow = (booking: Booking, courses: Course[], dateStr: string) => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((item) => item.id === courseId);
    const schedule = parseCourseDates(course ? course.dates : booking.date);
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    return {
      start: buildLocalDateTime(dateStr, startHour, startMinute),
      end: buildLocalDateTime(dateStr, endHour, endMinute),
    };
  }
  const start = parseBookingStartTime(booking.time);
  const end = parseBookingEndTime(booking.time, booking.durationHours);
  return start && end
    ? {
        start: buildLocalDateTime(dateStr, start.h, start.m),
        end: buildLocalDateTime(dateStr, end.h, end.m),
      }
    : null;
};

export const isBookingInProgressNow = (booking: Booking, courses: Course[], now = new Date()) => {
  const todayStr = toYMD(now);
  const window =
    isActiveBooking(booking) && isBookingOnDate(booking, todayStr, courses)
      ? getBookingDailyTimeWindow(booking, courses, todayStr)
      : null;
  return Boolean(window && now >= window.start && now < window.end);
};

export const getCurrentSessions = (
  bookings: Booking[],
  courses: Course[],
  now = new Date(),
  userId?: string
) =>
  bookings
    .filter(
      (booking) =>
        (!userId || booking.userId === userId) && isBookingInProgressNow(booking, courses, now)
    )
    .sort((a, b) => a.time.localeCompare(b.time));

export interface TodaySessionCountdown {
  booking: Booking;
  startsAt: Date;
}

export const getTodaySessionCountdown = (
  bookings: Booking[],
  courses: Course[],
  now = new Date()
): TodaySessionCountdown | null => {
  const todayStr = toYMD(now);
  return (
    bookings
      .filter(isActiveBooking)
      .filter((booking) => isBookingOnDate(booking, todayStr, courses))
      .map((booking) => ({
        booking,
        window: getBookingDailyTimeWindow(booking, courses, todayStr),
      }))
      .filter((item): item is { booking: Booking; window: { start: Date; end: Date } } =>
        Boolean(item.window && now < item.window.start)
      )
      .map(({ booking, window }) => ({ booking, startsAt: window.start }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null
  );
};

export interface NextSessionItem {
  booking: Booking;
  dateStr: string;
}

export const getNextSessionsNext7Days = (
  bookings: Booking[],
  courses: Course[],
  fromDate = new Date(),
  userId?: string
): NextSessionItem[] => {
  const todayStr = toYMD(fromDate);
  const dateRange = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(fromDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return toYMD(date);
  });
  const items = bookings
    .filter((booking) => (!userId || booking.userId === userId) && isActiveBooking(booking))
    .flatMap((booking) =>
      dateRange
        .filter((dateStr) => isBookingOnDate(booking, dateStr, courses))
        .map((dateStr) => ({ booking, dateStr }))
    )
    .filter(({ booking, dateStr }) => {
      if (dateStr !== todayStr) return true;
      const start = parseBookingStartTime(booking.time);
      if (!start) return true;
      const sessionStart = new Date(fromDate);
      sessionStart.setHours(start.h, start.m, 0, 0);
      return (
        new Date(sessionStart.getTime() + (booking.durationHours || 1) * 3_600_000) >= fromDate
      );
    });
  return items.sort((a, b) =>
    a.dateStr === b.dateStr
      ? a.booking.time.localeCompare(b.booking.time)
      : a.dateStr.localeCompare(b.dateStr)
  );
};

export const getNextSession = (bookings: Booking[], courses: Course[]) =>
  getNextSessionsNext7Days(bookings, courses)[0]?.booking ?? null;
