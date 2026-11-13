import { getDifficultyLabel } from '../../lib/i18n/bookingLabels';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import { schoolCalendarDate, schoolCalendarDays, formatCalendarDate } from './schoolCalendar';
import { localCalendarInputToUtcDate } from '@ski-academy/shared-domain/canonical/bookingCreation';
import { IanaTimeZoneSchema } from '@ski-academy/shared-domain/canonical/primitives';
import { parseBookingEndTime } from '../student-cabinet/components/student/studentBookingSchedule';
import { isTerminalPastLessonStatus } from '../../domain/booking';
import type { CabinetSessionItem, CourseDaySessionItem } from './courseEnrollmentContracts';

export function isSessionOnDate(item: CabinetSessionItem, dateStr: string): boolean {
  if (item.kind === 'lesson') {
    return item.session.date === dateStr;
  }
  return item.date === dateStr;
}

export function sessionStartSortKey(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    return `${item.session.date}T${item.session.time}`;
  }
  return `${item.date}T${item.time}`;
}

export function isActiveSessionItem(item: CabinetSessionItem): boolean {
  if (item.kind === 'lesson') {
    const status = item.session.status;
    return status === 'confirmed' || status === 'pending';
  }
  return (
    item.lifecycleStatus === 'pending' ||
    item.lifecycleStatus === 'confirmed' ||
    item.lifecycleStatus === 'pending_cancellation'
  );
}

export function sessionDisplayTitle(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    return item.session.instructorName;
  }
  return item.courseTitle;
}

export function sessionDisplayTime(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    return item.session.time;
  }
  return `${item.time} – ${item.endTime}`;
}

export function sessionDisplayDate(item: CabinetSessionItem): string {
  return item.kind === 'lesson' ? item.session.date : item.date;
}

export function sessionItemKey(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    return `lesson:${item.session.id}`;
  }
  return `course_day:${item.enrollmentId}:${item.courseDayId}`;
}

/** Group canonical instants in the school calendar; retain occurrence display fields. */
export function sessionSchoolDate(item: CabinetSessionItem, timeZone: string): string | null {
  const start = resolveSessionStartDateTime(item);
  return start ? schoolCalendarDate(start, timeZone) : null;
}

export function resolveSessionStartDateTime(item: CabinetSessionItem): Date | null {
  const { startsAt } = item.kind === 'lesson' ? item.session : item;
  if (startsAt) return new Date(startsAt.seconds * 1000 + startsAt.nanoseconds / 1_000_000);
  if (item.kind === 'lesson') return null;
  return localCalendarInputToUtcDate(
    { localDate: item.date, localTime: item.time, durationMinutes: 60 },
    IanaTimeZoneSchema.parse(item.timeZone)
  );
}

export function resolveSessionEndDateTime(item: CabinetSessionItem): Date | null {
  const { endsAt } = item.kind === 'lesson' ? item.session : item;
  if (endsAt) return new Date(endsAt.seconds * 1000 + endsAt.nanoseconds / 1_000_000);
  if (item.kind === 'lesson') return null;
  return localCalendarInputToUtcDate(
    { localDate: item.date, localTime: item.endTime, durationMinutes: 60 },
    IanaTimeZoneSchema.parse(item.timeZone)
  );
}

export function getSessionDailyTimeWindow(
  item: CabinetSessionItem,
  dateStr: string
): { readonly start: Date; readonly end: Date } | null {
  if (!isSessionOnDate(item, dateStr)) return null;
  const start = resolveSessionStartDateTime(item);
  const end = resolveSessionEndDateTime(item);
  return start && end ? { start, end } : null;
}

export function isSessionInProgressNow(item: CabinetSessionItem, now = new Date()): boolean {
  if (!isActiveSessionItem(item)) return false;
  const start = resolveSessionStartDateTime(item);
  const end = resolveSessionEndDateTime(item);
  return Boolean(start && end && now >= start && now < end);
}

export function isSessionUpcomingBySchedule(item: CabinetSessionItem, now = new Date()): boolean {
  if (!isActiveSessionItem(item)) return false;
  const start = resolveSessionStartDateTime(item);
  return start ? now < start : false;
}

export function isSessionPastBySchedule(item: CabinetSessionItem, now = new Date()): boolean {
  if (item.kind === 'lesson') {
    if (isTerminalPastLessonStatus(item.session.status)) {
      return true;
    }
  } else if (item.lifecycleStatus === 'cancelled' || item.lifecycleStatus === 'withdrawn') {
    return true;
  }
  const end = resolveSessionEndDateTime(item);
  return end ? now >= end : false;
}

export function isSessionCurrentBySchedule(item: CabinetSessionItem, now = new Date()): boolean {
  return (
    isActiveSessionItem(item) &&
    !isSessionPastBySchedule(item, now) &&
    !isSessionUpcomingBySchedule(item, now)
  );
}

export type SessionListScope = 'upcoming' | 'current' | 'past' | 'all';

export function filterSessionsByScope(
  items: readonly CabinetSessionItem[],
  scope: SessionListScope,
  now = new Date()
): CabinetSessionItem[] {
  if (scope === 'all') return [...items];
  if (scope === 'upcoming') {
    return items.filter((item) => isSessionUpcomingBySchedule(item, now));
  }
  if (scope === 'current') {
    return items.filter((item) => isSessionCurrentBySchedule(item, now));
  }
  return items.filter((item) => isSessionPastBySchedule(item, now));
}

export function getCurrentSessionItems(
  items: readonly CabinetSessionItem[],
  now = new Date()
): CabinetSessionItem[] {
  return items
    .filter((item) => isSessionInProgressNow(item, now))
    .sort((left, right) => sessionStartSortKey(left).localeCompare(sessionStartSortKey(right)));
}

export interface TodaySessionCountdown {
  readonly session: CabinetSessionItem;
  readonly startsAt: Date;
}

/** All active sessions tied for the closest upcoming start today (canonical instant). */
export function getTodaySessionCountdownsFromSessions(
  items: readonly CabinetSessionItem[],
  now = new Date(),
  timeZone: string
): TodaySessionCountdown[] {
  const today = schoolCalendarDate(now, timeZone);
  const upcoming = items
    .filter(isActiveSessionItem)
    .map((item) => ({
      session: item,
      window:
        sessionSchoolDate(item, timeZone) === today
          ? { start: resolveSessionStartDateTime(item), end: resolveSessionEndDateTime(item) }
          : null,
    }))
    .filter((entry): entry is { session: CabinetSessionItem; window: { start: Date; end: Date } } =>
      Boolean(entry.window?.start && entry.window.end && now < entry.window.start)
    )
    .map(({ session, window }) => ({ session, startsAt: window.start }))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

  const closestStart = upcoming[0]?.startsAt.getTime();
  return closestStart === undefined
    ? []
    : upcoming.filter(({ startsAt }) => startsAt.getTime() === closestStart);
}

/** Compatibility selector for callers that need only the first countdown. */
export function getTodaySessionCountdownFromSessions(
  items: readonly CabinetSessionItem[],
  now = new Date(),
  timeZone: string
): TodaySessionCountdown | null {
  return getTodaySessionCountdownsFromSessions(items, now, timeZone)[0] ?? null;
}

export interface NextSessionItem {
  readonly session: CabinetSessionItem;
  readonly dateStr: string;
}

export function getNextSessionsNext7DaysFromSessions(
  items: readonly CabinetSessionItem[],
  fromDate = new Date(),
  timeZone: string
): NextSessionItem[] {
  const todayStr = schoolCalendarDate(fromDate, timeZone);
  const dateRange = schoolCalendarDays(fromDate, timeZone);

  const rows = items
    .filter(isActiveSessionItem)
    .flatMap((item) =>
      dateRange
        .filter((dateStr) => sessionSchoolDate(item, timeZone) === dateStr)
        .map((dateStr) => ({ session: item, dateStr }))
    )
    .filter(({ session, dateStr }) => {
      if (dateStr !== todayStr) return true;
      const start = resolveSessionStartDateTime(session);
      const end = resolveSessionEndDateTime(session);
      return !end || end >= fromDate || (start ? start >= fromDate : true);
    });

  return rows.sort((left, right) =>
    left.dateStr === right.dateStr
      ? (resolveSessionStartDateTime(left.session)?.getTime() ?? 0) -
        (resolveSessionStartDateTime(right.session)?.getTime() ?? 0)
      : left.dateStr.localeCompare(right.dateStr)
  );
}

export interface MiniCalendarDay {
  readonly day: number;
  readonly dateStr: string;
  readonly hasSession: boolean;
  readonly isToday: boolean;
  readonly weekdayLabel: string;
}

export function getMiniCalendarDaysFromSessions(
  items: readonly CabinetSessionItem[],
  language: 'en' | 'ru' = 'ru',
  fromDate = new Date(),
  timeZone: string
): MiniCalendarDay[] {
  const todayStr = schoolCalendarDate(fromDate, timeZone);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const active = items.filter(isActiveSessionItem);
  const days: MiniCalendarDay[] = [];

  for (const dateStr of schoolCalendarDays(fromDate, timeZone)) {
    const date = new Date(`${dateStr}T12:00:00Z`);
    const hasSession = active.some((item) => sessionSchoolDate(item, timeZone) === dateStr);
    days.push({
      day: date.getUTCDate(),
      dateStr,
      hasSession,
      isToday: dateStr === todayStr,
      weekdayLabel: date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
    });
  }

  return days;
}

export function hasTrainingTodayFromSessions(
  items: readonly CabinetSessionItem[],
  fromDate = new Date(),
  timeZone: string
): boolean {
  const today = schoolCalendarDate(fromDate, timeZone);
  return items.some(
    (item) => isActiveSessionItem(item) && sessionSchoolDate(item, timeZone) === today
  );
}

export function formatCabinetSessionTimeRange(item: CabinetSessionItem): string {
  if (item.kind === 'lesson') {
    const rangeMatch = item.session.time.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (rangeMatch) return `${rangeMatch[1]}–${rangeMatch[2]}`;
    const end = parseBookingEndTime(item.session.time, item.session.durationHours);
    return end
      ? `${item.session.time}–${String(end.h).padStart(2, '0')}:${String(end.m).padStart(2, '0')}`
      : item.session.time;
  }
  return `${item.time}–${item.endTime}`;
}

export function getCabinetSessionTitle(item: CabinetSessionItem, language: 'en' | 'ru'): string {
  if (item.kind === 'lesson') {
    return item.session.difficulty
      ? getDifficultyLabel(item.session.difficulty, language)
      : language === 'ru'
        ? 'Индивидуальное занятие'
        : 'Individual lesson';
  }
  return item.courseTitle;
}

export function getCabinetSessionSubtitle(item: CabinetSessionItem, language: 'en' | 'ru'): string {
  if (item.kind === 'lesson') {
    return item.session.instructorName;
  }
  return language === 'ru' ? 'Групповой курс' : 'Group course';
}

export function formatSessionCalendarDateLabel(date: string, language: 'en' | 'ru'): string {
  return formatCalendarDate(date, language);
}

export function formatCourseDayDateLabel(
  item: CourseDaySessionItem,
  language: 'en' | 'ru'
): string {
  return formatSessionCalendarDateLabel(item.date, language);
}

export function isLessonCabinetItem(
  item: CabinetSessionItem
): item is { readonly kind: 'lesson'; readonly session: LessonBookingCabinetItem } {
  return item.kind === 'lesson';
}
