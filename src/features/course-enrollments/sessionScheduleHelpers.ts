import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import {
  parseBookingEndTime,
  parseBookingStartTime,
} from '../student-cabinet/components/student/studentBookingSchedule';
import { toYMD } from '../student-cabinet/components/student/studentCabinetPresentation';
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

const buildLocalDateTime = (dateStr: string, h: number, m: number): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0);
};

export function resolveSessionStartDateTime(item: CabinetSessionItem): Date | null {
  if (item.kind === 'lesson') {
    const start = parseBookingStartTime(item.session.time);
    return start
      ? buildLocalDateTime(item.session.date, start.h, start.m)
      : buildLocalDateTime(item.session.date, 0, 0);
  }
  const [h, m] = item.time.split(':').map(Number);
  return buildLocalDateTime(item.date, h, m);
}

export function resolveSessionEndDateTime(item: CabinetSessionItem): Date | null {
  if (item.kind === 'lesson') {
    const end = parseBookingEndTime(item.session.time, item.session.durationHours);
    return end ? buildLocalDateTime(item.session.date, end.h, end.m) : null;
  }
  const [h, m] = item.endTime.split(':').map(Number);
  return buildLocalDateTime(item.date, h, m);
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
  const todayStr = toYMD(now);
  const window = getSessionDailyTimeWindow(item, todayStr);
  return Boolean(window && now >= window.start && now < window.end);
}

export function isSessionUpcomingBySchedule(item: CabinetSessionItem, now = new Date()): boolean {
  if (!isActiveSessionItem(item)) return false;
  const start = resolveSessionStartDateTime(item);
  return start ? now < start : false;
}

export function isSessionPastBySchedule(item: CabinetSessionItem, now = new Date()): boolean {
  if (item.kind === 'lesson') {
    if (item.session.status === 'cancelled' || item.session.status === 'completed') {
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

export function getTodaySessionCountdownFromSessions(
  items: readonly CabinetSessionItem[],
  now = new Date()
): TodaySessionCountdown | null {
  const todayStr = toYMD(now);
  return (
    items
      .filter(isActiveSessionItem)
      .filter((item) => isSessionOnDate(item, todayStr))
      .map((item) => ({
        session: item,
        window: getSessionDailyTimeWindow(item, todayStr),
      }))
      .filter(
        (entry): entry is { session: CabinetSessionItem; window: { start: Date; end: Date } } =>
          Boolean(entry.window && now < entry.window.start)
      )
      .map(({ session, window }) => ({ session, startsAt: window.start }))
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0] ?? null
  );
}

export interface NextSessionItem {
  readonly session: CabinetSessionItem;
  readonly dateStr: string;
}

export function getNextSessionsNext7DaysFromSessions(
  items: readonly CabinetSessionItem[],
  fromDate = new Date()
): NextSessionItem[] {
  const todayStr = toYMD(fromDate);
  const dateRange = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(fromDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return toYMD(date);
  });

  const rows = items
    .filter(isActiveSessionItem)
    .flatMap((item) =>
      dateRange
        .filter((dateStr) => isSessionOnDate(item, dateStr))
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
      ? sessionStartSortKey(left.session).localeCompare(sessionStartSortKey(right.session))
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
  fromDate = new Date()
): MiniCalendarDay[] {
  const todayStr = toYMD(fromDate);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const active = items.filter(isActiveSessionItem);
  const days: MiniCalendarDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(fromDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const dateStr = toYMD(date);
    const hasSession = active.some((item) => isSessionOnDate(item, dateStr));
    days.push({
      day: date.getDate(),
      dateStr,
      hasSession,
      isToday: dateStr === todayStr,
      weekdayLabel: date.toLocaleDateString(locale, { weekday: 'short' }),
    });
  }

  return days;
}

export function hasTrainingTodayFromSessions(
  items: readonly CabinetSessionItem[],
  fromDate = new Date()
): boolean {
  const todayStr = toYMD(fromDate);
  return items.some((item) => isActiveSessionItem(item) && isSessionOnDate(item, todayStr));
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

export function getCabinetSessionTitle(item: CabinetSessionItem, _language: 'en' | 'ru'): string {
  if (item.kind === 'lesson') {
    const labels: Record<string, string> = {
      beginner: 'BASE',
      intermediate: 'CARVE',
      advanced: 'PRO',
      freeride: 'FREERIDE',
      freestyle: 'PARK',
    };
    return labels[item.session.difficulty ?? ''] ?? 'BASE';
  }
  return item.courseTitle;
}

export function getCabinetSessionSubtitle(item: CabinetSessionItem, language: 'en' | 'ru'): string {
  if (item.kind === 'lesson') {
    return item.session.instructorName;
  }
  return language === 'ru' ? 'Групповой курс' : 'Group course';
}

export function formatCourseDayDateLabel(
  item: CourseDaySessionItem,
  language: 'en' | 'ru'
): string {
  const date = new Date(`${item.date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return item.date;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
}

export function isLessonCabinetItem(
  item: CabinetSessionItem
): item is { readonly kind: 'lesson'; readonly session: LessonBookingCabinetItem } {
  return item.kind === 'lesson';
}
