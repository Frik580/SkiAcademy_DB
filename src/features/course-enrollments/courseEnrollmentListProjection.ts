import type {
  CourseEnrollmentLifecycleStatus,
  CourseScheduleProjectionReadModel,
} from '@ski-academy/shared-domain';
import { russianPlural } from '../../lib/i18n/pluralize';
import { formatCatalogLocalDateRange } from '../courses/courseCatalogDisplaySchedule';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import type { LessonBookingCabinetItem } from '../lesson-bookings/lessonBookingContracts';
import type { CabinetSessionItem, CourseDaySessionItem } from './courseEnrollmentContracts';
import {
  filterSessionsByScope,
  formatSessionCalendarDateLabel,
  resolveSessionEndDateTime,
  resolveSessionStartDateTime,
  sessionStartSortKey,
  type SessionListScope,
} from './sessionScheduleHelpers';

/**
 * Student "Мои занятия" list item. Course days stay canonical; this projection
 * collapses one CourseEnrollment into one card. Lessons stay one card each.
 */
export interface CourseEnrollmentListItem {
  readonly kind: 'course_enrollment';
  readonly enrollmentId: string;
  readonly courseId: string;
  readonly participantId: string;
  readonly courseTitle: string;
  readonly participantName: string;
  readonly lifecycleStatus: CourseEnrollmentLifecycleStatus;
  readonly revision: number;
  readonly authorizedActions: CourseDaySessionItem['authorizedActions'];
  readonly days: readonly CourseDaySessionItem[];
}

export type CabinetListItem =
  | { readonly kind: 'lesson'; readonly session: LessonBookingCabinetItem }
  | CourseEnrollmentListItem;

export interface CourseEnrollmentScheduleLine {
  readonly courseDayId: string;
  readonly label: string;
}

const ACTIVE_LIST_STATUSES: ReadonlySet<CourseEnrollmentLifecycleStatus> = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
]);

function compareCourseDays(left: CourseDaySessionItem, right: CourseDaySessionItem): number {
  const byStart = sessionStartSortKey(left).localeCompare(sessionStartSortKey(right));
  if (byStart !== 0) return byStart;
  return left.courseDayId.localeCompare(right.courseDayId);
}

export function aggregateCabinetSessionsForStudentList(
  items: readonly CabinetSessionItem[]
): CabinetListItem[] {
  const lessons: CabinetListItem[] = [];
  const daysByEnrollment = new Map<string, CourseDaySessionItem[]>();

  for (const item of items) {
    if (item.kind === 'lesson') {
      lessons.push(item);
      continue;
    }
    const existing = daysByEnrollment.get(item.enrollmentId);
    if (existing) {
      existing.push(item);
    } else {
      daysByEnrollment.set(item.enrollmentId, [item]);
    }
  }

  const courses: CourseEnrollmentListItem[] = [];
  for (const [enrollmentId, days] of daysByEnrollment) {
    const sortedDays = [...days].sort(compareCourseDays);
    const head = sortedDays[0];
    if (!head) continue;
    courses.push({
      kind: 'course_enrollment',
      enrollmentId,
      courseId: head.courseId,
      participantId: head.participantId,
      courseTitle: head.courseTitle,
      participantName: head.participantName,
      lifecycleStatus: head.lifecycleStatus,
      revision: head.revision,
      authorizedActions: head.authorizedActions,
      days: sortedDays,
    });
  }

  return [...lessons, ...courses].sort((left, right) =>
    listSortKey(right).localeCompare(listSortKey(left))
  );
}

function listSortKey(item: CabinetListItem): string {
  if (item.kind === 'lesson') {
    return `${item.session.date}T${item.session.time}`;
  }
  const first = item.days[0];
  return first ? sessionStartSortKey(first) : '';
}

export function cabinetListItemKey(item: CabinetListItem): string {
  if (item.kind === 'lesson') {
    return `lesson:${item.session.id}`;
  }
  return `course_enrollment:${item.enrollmentId}`;
}

/**
 * Upcoming / current / past for a course card uses the enrollment interval:
 * courseStart = earliest CourseDay start, courseEnd = latest CourseDay end.
 * Bounds reuse the same local wall-clock conversion as per-day session scope.
 * Lesson cards keep the existing per-booking scope.
 */
export function courseEnrollmentBounds(item: CourseEnrollmentListItem): {
  readonly start: Date | null;
  readonly end: Date | null;
} {
  let start: Date | null = null;
  let end: Date | null = null;
  for (const day of item.days) {
    const dayStart = resolveSessionStartDateTime(day);
    const dayEnd = resolveSessionEndDateTime(day);
    if (dayStart && (!start || dayStart.getTime() < start.getTime())) start = dayStart;
    if (dayEnd && (!end || dayEnd.getTime() > end.getTime())) end = dayEnd;
  }
  return { start, end };
}

export function isCourseEnrollmentUpcoming(item: CourseEnrollmentListItem, now: Date): boolean {
  if (!ACTIVE_LIST_STATUSES.has(item.lifecycleStatus)) return false;
  const { start } = courseEnrollmentBounds(item);
  return start ? now.getTime() < start.getTime() : false;
}

export function isCourseEnrollmentPast(item: CourseEnrollmentListItem, now: Date): boolean {
  if (item.lifecycleStatus === 'cancelled' || item.lifecycleStatus === 'withdrawn') {
    return true;
  }
  const { end } = courseEnrollmentBounds(item);
  return end ? now.getTime() >= end.getTime() : false;
}

export function isCourseEnrollmentCurrent(item: CourseEnrollmentListItem, now: Date): boolean {
  return (
    ACTIVE_LIST_STATUSES.has(item.lifecycleStatus) &&
    !isCourseEnrollmentPast(item, now) &&
    !isCourseEnrollmentUpcoming(item, now)
  );
}

export function filterCabinetListByScope(
  items: readonly CabinetListItem[],
  scope: SessionListScope,
  now = new Date()
): CabinetListItem[] {
  if (scope === 'all') return [...items];
  return items.filter((item) => {
    if (item.kind === 'lesson') {
      return (
        filterSessionsByScope([{ kind: 'lesson', session: item.session }], scope, now).length > 0
      );
    }
    if (scope === 'upcoming') return isCourseEnrollmentUpcoming(item, now);
    if (scope === 'current') return isCourseEnrollmentCurrent(item, now);
    return isCourseEnrollmentPast(item, now);
  });
}

export function cabinetListItemMatchesDate(item: CabinetListItem, dateStr: string): boolean {
  if (item.kind === 'lesson') return item.session.date === dateStr;
  return item.days.some((day) => day.date === dateStr);
}

export function filterCabinetListByDate(
  items: readonly CabinetListItem[],
  dateStr: string
): CabinetListItem[] {
  return items.filter((item) => cabinetListItemMatchesDate(item, dateStr));
}

export function formatCourseEnrollmentDateRange(
  item: CourseEnrollmentListItem,
  language: 'en' | 'ru'
): string {
  const first = item.days[0];
  const last = item.days[item.days.length - 1];
  if (!first || !last) return '';
  return formatCatalogLocalDateRange(first.date, last.date, language, { includeYear: false });
}

export function formatCourseDayCountLabel(
  count: number,
  language: 'en' | 'ru',
  forms: readonly [one: string, few: string, many: string]
): string {
  const unit = language === 'ru' ? russianPlural(count, forms) : count === 1 ? forms[0] : forms[2];
  return `${count} ${unit}`;
}

export function courseEnrollmentListBadgeStatus(
  status: CourseEnrollmentLifecycleStatus
): 'pending_cancellation' | 'confirmed' | 'pending' {
  if (status === 'pending_cancellation') return 'pending_cancellation';
  if (status === 'confirmed') return 'confirmed';
  return 'pending';
}

export function buildCourseEnrollmentScheduleLines(
  schedule: CourseScheduleProjectionReadModel,
  language: 'en' | 'ru'
): CourseEnrollmentScheduleLine[] {
  const sorted = [...schedule.courseDays].sort((left, right) => {
    const seconds = left.interval.startsAt.seconds - right.interval.startsAt.seconds;
    if (seconds !== 0) return seconds;
    const nanos = left.interval.startsAt.nanoseconds - right.interval.startsAt.nanoseconds;
    if (nanos !== 0) return nanos;
    return left.courseDayId.localeCompare(right.courseDayId);
  });

  return sorted.map((day) => {
    const start = canonicalTimestampToLocalParts(
      day.interval.startsAt.seconds,
      day.interval.startsAt.nanoseconds,
      day.timeZone
    );
    const end = canonicalTimestampToLocalParts(
      day.interval.endsAt.seconds,
      day.interval.endsAt.nanoseconds,
      day.timeZone
    );
    const dateLabel = formatSessionCalendarDateLabel(start.date, language);
    return {
      courseDayId: day.courseDayId,
      label: `${dateLabel} · ${start.time}–${end.time}`,
    };
  });
}
