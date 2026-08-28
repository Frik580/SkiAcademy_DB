import type { BookingStatus } from '@ski-academy/shared-domain';
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

/** First day + start hour of a private lesson booking. */
export const resolveBookingStartDateTime = (booking: ScheduleBookingSlice): Date | null => {
  const startTime = parseBookingStartTime(booking.time);
  return startTime
    ? buildLocalDateTime(booking.date, startTime.h, startTime.m)
    : buildLocalDateTime(booking.date, 0, 0);
};

/** Last day + end hour of a private lesson booking. */
export const resolveBookingEndDateTime = (booking: ScheduleBookingSlice): Date | null => {
  const endTime = parseBookingEndTime(booking.time, booking.durationHours);
  return endTime ? buildLocalDateTime(booking.date, endTime.h, endTime.m) : null;
};

export const isBookingPastBySchedule = (booking: ScheduleBookingSlice, now = new Date()) => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return true;
  }
  const end = resolveBookingEndDateTime(booking);
  return end ? now >= end : false;
};

export const isBookingUpcomingBySchedule = (booking: ScheduleBookingSlice, now = new Date()) => {
  if (booking.isDeleted || booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  const start = resolveBookingStartDateTime(booking);
  return start ? now < start : false;
};

/** Started but end time not reached yet. */
export const isBookingCurrentBySchedule = (booking: ScheduleBookingSlice, now = new Date()) =>
  !booking.isDeleted &&
  booking.status !== 'cancelled' &&
  booking.status !== 'completed' &&
  !isBookingPastBySchedule(booking, now) &&
  !isBookingUpcomingBySchedule(booking, now);

/** True if a lesson booking occurs on dateStr. */
export const isBookingOnDate = (booking: ScheduleBookingSlice, dateStr: string) => {
  if (!booking || booking.isDeleted || booking.status === 'cancelled') return false;
  if (booking.userId?.startsWith('system_block_')) return false;
  if (booking.date === dateStr) return true;

  const dotSeparatedDate = booking.date?.split('.');
  if (dotSeparatedDate?.length === 3) {
    const [day, month, year] = dotSeparatedDate;
    if (`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` === dateStr) return true;
  }

  return false;
};

/** @deprecated Use hasTrainingTodayFromSessions for mixed lesson/course calendars. */
export const hasTrainingTodayFromLessons = (
  bookings: ScheduleBookingSlice[],
  fromDate = new Date()
): boolean => {
  const todayStr = toYMD(fromDate);
  return bookings.some(
    (booking) =>
      !booking.isDeleted &&
      booking.status !== 'cancelled' &&
      isBookingOnDate(booking, todayStr)
  );
};
