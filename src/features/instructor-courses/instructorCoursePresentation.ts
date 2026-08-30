import type { CourseDayScheduleItem } from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import type { InstructorAssignedCourseRef } from './instructorCourseContracts';

function formatCourseDayDate(courseDay: CourseDayScheduleItem): string {
  return canonicalTimestampToLocalParts(
    courseDay.interval.startsAt.seconds,
    courseDay.interval.startsAt.nanoseconds,
    courseDay.timeZone
  ).date;
}

function formatCourseDayTime(courseDay: CourseDayScheduleItem): string {
  return canonicalTimestampToLocalParts(
    courseDay.interval.startsAt.seconds,
    courseDay.interval.startsAt.nanoseconds,
    courseDay.timeZone
  ).time;
}

export function resolveAssignedCourseDays(
  assignment: Pick<InstructorAssignedCourseRef, 'assignedCourseDayIds' | 'courseSchedule'>
): readonly CourseDayScheduleItem[] {
  const assignedIds = new Set(assignment.assignedCourseDayIds);
  return assignment.courseSchedule.courseDays.filter((courseDay) =>
    assignedIds.has(courseDay.courseDayId)
  );
}

export function formatInstructorCourseScheduleSummary(
  assignment: Pick<InstructorAssignedCourseRef, 'assignedCourseDayIds' | 'courseSchedule'>
): string {
  const assignedDays = resolveAssignedCourseDays(assignment);
  if (assignedDays.length === 0) {
    return '';
  }

  const firstDay = assignedDays[0]!;
  const lastDay = assignedDays[assignedDays.length - 1]!;
  const startDate = formatCourseDayDate(firstDay);
  const endDate = formatCourseDayDate(lastDay);
  const startTime = formatCourseDayTime(firstDay);

  if (startDate === endDate) {
    return `${startDate} · ${startTime}`;
  }

  return `${startDate} – ${endDate}`;
}

export function formatInstructorCourseAssignedDaysSummary(
  assignment: Pick<InstructorAssignedCourseRef, 'assignedCourseDayIds' | 'courseSchedule'>
): string | undefined {
  const assignedDays = resolveAssignedCourseDays(assignment);
  const totalDays = assignment.courseSchedule.courseDayCount;
  if (assignedDays.length === 0 || assignedDays.length >= totalDays) {
    return undefined;
  }

  return assignedDays.map((courseDay) => String(courseDay.dayOrder)).join(', ');
}
