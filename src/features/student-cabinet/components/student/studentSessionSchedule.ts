import type { CabinetSessionItem } from '../../../../features/course-enrollments';
import {
  getCurrentSessionItems,
  getNextSessionsNext7DaysFromSessions,
  getTodaySessionCountdownFromSessions,
  isSessionInProgressNow as isSessionInProgressNowHelper,
  type NextSessionItem,
  type TodaySessionCountdown,
} from '../../../../features/course-enrollments/sessionScheduleHelpers';

export type { NextSessionItem, TodaySessionCountdown };

export const isSessionInProgressNow = (
  session: CabinetSessionItem,
  now = new Date()
): boolean => isSessionInProgressNowHelper(session, now);

export const getCurrentSessions = (
  sessionItems: readonly CabinetSessionItem[],
  now = new Date()
): CabinetSessionItem[] => getCurrentSessionItems(sessionItems, now);

export const getTodaySessionCountdown = (
  sessionItems: readonly CabinetSessionItem[],
  now = new Date()
): TodaySessionCountdown | null => getTodaySessionCountdownFromSessions(sessionItems, now);

export const getNextSessionsNext7Days = (
  sessionItems: readonly CabinetSessionItem[],
  fromDate = new Date()
): NextSessionItem[] => getNextSessionsNext7DaysFromSessions(sessionItems, fromDate);

export const getNextSession = (sessionItems: readonly CabinetSessionItem[]) =>
  getNextSessionsNext7Days(sessionItems)[0]?.session ?? null;
