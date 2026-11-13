import type { Booking, Course } from '../../../../types';
import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  getCurrentSessionItems,
  getNextSessionsNext7DaysFromSessions,
  getTodaySessionCountdownFromSessions,
  isSessionInProgressNow as isSessionInProgressNowHelper,
  type NextSessionItem,
  type TodaySessionCountdown,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';
import {
  getCurrentBookingsInProgress,
  getNextBookingsNext7Days,
  getTodayBookingSessionCountdown,
  type BookingNextSessionItem,
  type BookingTodaySessionCountdown,
} from './studentBookingSchedule';

export type { NextSessionItem, TodaySessionCountdown };
export type { BookingNextSessionItem, BookingTodaySessionCountdown };

const isBookingScheduleCall = (
  secondArg: Course[] | Date | undefined,
  thirdArg: Date | string | undefined
): boolean => {
  if (secondArg instanceof Date) return false;
  if (thirdArg instanceof Date) return true;
  if (Array.isArray(secondArg)) return true;
  return false;
};

export const isSessionInProgressNow = (session: CabinetSessionItem, now = new Date()): boolean =>
  isSessionInProgressNowHelper(session, now);

export function getCurrentSessions(
  sessionItems: readonly CabinetSessionItem[],
  now?: Date
): CabinetSessionItem[];
export function getCurrentSessions(bookings: Booking[], courses: Course[], now?: Date): Booking[];
export function getCurrentSessions(
  first: readonly CabinetSessionItem[] | Booking[],
  second?: Course[] | Date,
  third?: Date
): CabinetSessionItem[] | Booking[] {
  if (isBookingScheduleCall(second, third)) {
    return getCurrentBookingsInProgress(
      first as Booking[],
      (second as Course[]) ?? [],
      third ?? new Date()
    ) as Booking[];
  }
  return getCurrentSessionItems(
    first as CabinetSessionItem[],
    second instanceof Date ? second : new Date()
  );
}

export function getTodaySessionCountdown(
  sessionItems: readonly CabinetSessionItem[],
  now: Date | undefined,
  timeZone: string
): TodaySessionCountdown | null;
export function getTodaySessionCountdown(
  bookings: Booking[],
  courses: Course[],
  now?: Date
): BookingTodaySessionCountdown | null;
export function getTodaySessionCountdown(
  first: readonly CabinetSessionItem[] | Booking[],
  second?: Course[] | Date,
  third?: Date | string
): TodaySessionCountdown | BookingTodaySessionCountdown | null {
  if (isBookingScheduleCall(second, third)) {
    return getTodayBookingSessionCountdown(
      first as Booking[],
      (second as Course[]) ?? [],
      third instanceof Date ? third : new Date()
    );
  }
  if (typeof third !== 'string') return null;
  return getTodaySessionCountdownFromSessions(
    first as CabinetSessionItem[],
    second instanceof Date ? second : new Date(),
    third
  );
}

export function getNextSessionsNext7Days(
  sessionItems: readonly CabinetSessionItem[],
  fromDate: Date | undefined,
  timeZone: string
): NextSessionItem[];
export function getNextSessionsNext7Days(
  bookings: Booking[],
  courses: Course[],
  fromDate?: Date
): BookingNextSessionItem[];
export function getNextSessionsNext7Days(
  first: readonly CabinetSessionItem[] | Booking[],
  second?: Course[] | Date,
  third?: Date | string
): NextSessionItem[] | BookingNextSessionItem[] {
  if (isBookingScheduleCall(second, third)) {
    return getNextBookingsNext7Days(
      first as Booking[],
      (second as Course[]) ?? [],
      third instanceof Date ? third : new Date()
    );
  }
  if (typeof third !== 'string') return [];
  return getNextSessionsNext7DaysFromSessions(
    first as CabinetSessionItem[],
    second instanceof Date ? second : new Date(),
    third
  );
}

export const getNextSession = (sessionItems: readonly CabinetSessionItem[], timeZone: string) =>
  getNextSessionsNext7Days(sessionItems, new Date(), timeZone)[0]?.session ?? null;
