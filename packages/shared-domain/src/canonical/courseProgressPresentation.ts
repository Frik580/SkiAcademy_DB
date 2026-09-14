import { z } from 'zod';
import {
  CourseEnrollmentLifecycleStatusSchema,
  type Attendance,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CourseEnrollmentAttendanceSummary,
} from './courseEnrollmentAttendanceAdminIssue';
import { courseDayAttendanceMatchesCurrentOccurrence } from './courseEnrollmentAttendancePolicy';
import { courseScheduleIsComplete } from './courseEnrollmentCreation';
import {
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  type CourseDayId,
} from './identifiers';
import { compareCanonicalTimestamps, type CanonicalTimestamp } from './primitives';

const CourseProgressDayCountSchema = z.number().finite().int().nonnegative();
const CourseProgressPercentSchema = z.number().finite().min(0).max(100);
const PERCENT_EPSILON = 1e-9;

export function courseProgressPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, (numerator / denominator) * 100));
}

export const CourseProgressPresentationSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    participantId: ParticipantIdSchema,
    courseId: CourseIdSchema,
    scheduledDays: CourseProgressDayCountSchema,
    elapsedDays: CourseProgressDayCountSchema,
    recordedDays: CourseProgressDayCountSchema,
    presentDays: CourseProgressDayCountSchema,
    absentDays: CourseProgressDayCountSchema,
    missingDays: CourseProgressDayCountSchema,
    progressPercent: CourseProgressPercentSchema,
    attendanceCoveragePercent: CourseProgressPercentSchema,
    attendanceRatePercent: CourseProgressPercentSchema.nullable(),
    lifecycleStatus: CourseEnrollmentLifecycleStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path: keyof typeof value, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });

    if (value.elapsedDays > value.scheduledDays) {
      issue('elapsedDays', 'elapsedDays must not exceed scheduledDays');
    }
    if (value.recordedDays > value.scheduledDays) {
      issue('recordedDays', 'recordedDays must not exceed scheduledDays');
    }
    if (value.presentDays + value.absentDays !== value.recordedDays) {
      issue('recordedDays', 'presentDays + absentDays must equal recordedDays');
    }
    if (value.missingDays !== value.scheduledDays - value.recordedDays) {
      issue('missingDays', 'missingDays must equal scheduledDays - recordedDays');
    }

    const expectedProgress = courseProgressPercent(value.elapsedDays, value.scheduledDays);
    if (Math.abs(value.progressPercent - expectedProgress) > PERCENT_EPSILON) {
      issue('progressPercent', 'progressPercent must equal elapsedDays / scheduledDays');
    }
    const expectedCoverage = courseProgressPercent(value.recordedDays, value.scheduledDays);
    if (Math.abs(value.attendanceCoveragePercent - expectedCoverage) > PERCENT_EPSILON) {
      issue(
        'attendanceCoveragePercent',
        'attendanceCoveragePercent must equal recordedDays / scheduledDays'
      );
    }
    const expectedRate =
      value.recordedDays === 0
        ? null
        : courseProgressPercent(value.presentDays, value.recordedDays);
    if (
      expectedRate === null
        ? value.attendanceRatePercent !== null
        : value.attendanceRatePercent === null ||
          Math.abs(value.attendanceRatePercent - expectedRate) > PERCENT_EPSILON
    ) {
      issue(
        'attendanceRatePercent',
        'attendanceRatePercent must be null without recorded attendance or equal presentDays / recordedDays'
      );
    }
  });

export type CourseProgressPresentation = Readonly<
  z.output<typeof CourseProgressPresentationSchema>
>;

function attendanceMatchesEnrollmentCurrentOccurrence(input: {
  readonly attendance: Attendance;
  readonly enrollment: CourseEnrollment;
  readonly courseDay: CourseDay;
}): boolean {
  const subject = input.attendance.subject;
  return (
    subject.subjectKind === 'course_enrollment' &&
    subject.enrollmentId === input.enrollment.enrollmentId &&
    subject.participantId === input.enrollment.participantId &&
    subject.courseId === input.enrollment.courseId &&
    subject.courseDayId === input.courseDay.courseDayId &&
    courseDayAttendanceMatchesCurrentOccurrence(input.attendance, input.courseDay)
  );
}

function attendanceSummaryFromCurrentEvidence(input: {
  readonly enrollment: CourseEnrollment;
  readonly courseDays: readonly CourseDay[];
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): Pick<
  CourseEnrollmentAttendanceSummary,
  'recordedDayCount' | 'presentDayCount' | 'absentDayCount'
> {
  let recordedDayCount = 0;
  let presentDayCount = 0;
  let absentDayCount = 0;

  for (const courseDay of input.courseDays) {
    const attendance = input.attendancesByCourseDayId.get(courseDay.courseDayId);
    if (
      !attendance ||
      !attendanceMatchesEnrollmentCurrentOccurrence({
        attendance,
        enrollment: input.enrollment,
        courseDay,
      })
    ) {
      continue;
    }
    recordedDayCount += 1;
    if (attendance.attendanceStatus === 'present') presentDayCount += 1;
    else absentDayCount += 1;
  }

  return { recordedDayCount, presentDayCount, absentDayCount };
}

export type DeriveCourseProgressPresentationInput = Readonly<{
  now: CanonicalTimestamp;
  enrollment: CourseEnrollment;
  course: Course;
  courseDays: readonly CourseDay[];
}> &
  (
    | Readonly<{
        attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
        attendanceSummary?: never;
      }>
    | Readonly<{
        attendanceSummary: CourseEnrollmentAttendanceSummary;
        attendancesByCourseDayId?: never;
      }>
  );

/**
 * Derives curriculum progress and separate Attendance metrics. This is a
 * presentation value, not a persisted aggregate and not lifecycle authority.
 */
export function deriveCourseProgressPresentation(
  input: DeriveCourseProgressPresentationInput
): CourseProgressPresentation {
  if (input.enrollment.courseId !== input.course.courseId) {
    throw new Error('CourseProgress enrollment must belong to Course');
  }
  if (!courseScheduleIsComplete(input.course, input.courseDays)) {
    throw new Error('CourseProgress requires a verified complete CourseDay schedule');
  }

  const scheduledDays = input.courseDays.length;
  const elapsedDays = input.courseDays.filter(
    (courseDay) => compareCanonicalTimestamps(input.now, courseDay.interval.endsAt) >= 0
  ).length;
  const summary = input.attendancesByCourseDayId
    ? attendanceSummaryFromCurrentEvidence({
        enrollment: input.enrollment,
        courseDays: input.courseDays,
        attendancesByCourseDayId: input.attendancesByCourseDayId,
      })
    : input.attendanceSummary;
  const recordedDays = summary.recordedDayCount;
  const presentDays = summary.presentDayCount;
  const absentDays = summary.absentDayCount;

  return CourseProgressPresentationSchema.parse({
    enrollmentId: input.enrollment.enrollmentId,
    participantId: input.enrollment.participantId,
    courseId: input.course.courseId,
    scheduledDays,
    elapsedDays,
    recordedDays,
    presentDays,
    absentDays,
    missingDays: scheduledDays - recordedDays,
    progressPercent: courseProgressPercent(elapsedDays, scheduledDays),
    attendanceCoveragePercent: courseProgressPercent(recordedDays, scheduledDays),
    attendanceRatePercent:
      recordedDays === 0 ? null : courseProgressPercent(presentDays, recordedDays),
    lifecycleStatus: input.enrollment.lifecycle.status,
  });
}
