import type { Course, CourseDay } from './courseEnrollmentAttendanceAdminIssue';
import { COURSE_DAY_MAX } from './courseEnrollmentAttendanceAdminIssue';
import type { InstructorId } from './identifiers';
import {
  compareCanonicalTimestamps,
  AggregateRevisionSchema,
  type CanonicalTimestamp,
  type TimeInterval,
} from './primitives';

export function assertInstructorOnCourseRoster(
  course: Course,
  instructorId: InstructorId
): boolean {
  return course.instructorRosterIds.includes(instructorId);
}

export function resolveNextCourseDayOrder(existingDays: readonly CourseDay[]): number {
  if (existingDays.length === 0) {
    return 1;
  }
  const maxOrder = existingDays.reduce((max, day) => Math.max(max, day.dayOrder), 0);
  return maxOrder + 1;
}

export function assertStrictlyIncreasingCourseDayStarts(
  existingDays: readonly CourseDay[],
  newInterval: TimeInterval
): void {
  for (const existingDay of existingDays) {
    if (compareCanonicalTimestamps(newInterval.startsAt, existingDay.interval.startsAt) <= 0) {
      throw new Error('CourseDay startsAt must be strictly after existing CourseDay startsAt values');
    }
  }
}

export function assertCourseDayCountWithinLimit(existingDayCount: number): void {
  if (existingDayCount >= COURSE_DAY_MAX) {
    throw new Error('CourseDay count exceeds canonical maximum');
  }
}

export function deriveCourseScheduleProjectionAfterDayAdded(
  course: Course,
  newInterval: TimeInterval
): Course['scheduleProjection'] {
  const finalCourseDayEndsAt =
    compareCanonicalTimestamps(
      newInterval.endsAt,
      course.scheduleProjection.finalCourseDayEndsAt
    ) > 0
      ? newInterval.endsAt
      : course.scheduleProjection.finalCourseDayEndsAt;

  return {
    courseDayCount: course.scheduleProjection.courseDayCount,
    finalCourseDayEndsAt,
    courseScheduleRevision: AggregateRevisionSchema.parse(
      course.scheduleProjection.courseScheduleRevision + 1
    ),
  };
}

export function courseDayIntervalHasStarted(
  interval: TimeInterval,
  decidedAt: CanonicalTimestamp
): boolean {
  return compareCanonicalTimestamps(decidedAt, interval.startsAt) >= 0;
}

export function deriveCourseStartAtAfterFirstDay(
  course: Course,
  firstDayInterval: TimeInterval,
  existingDayCount: number
): CanonicalTimestamp {
  if (existingDayCount > 0) {
    return course.startAt;
  }
  return firstDayInterval.startsAt;
}
