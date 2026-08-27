import {
  ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
  type AdminIssue,
  type Attendance,
  type AttendanceStatus,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CourseEnrollmentAttendanceSummary,
} from './courseEnrollmentAttendanceAdminIssue';
import {
  BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS,
  evaluateInstructorAttendanceWindow,
  hasOpenOutcomeBlockingAdminIssue,
  instructorMayCorrectAttendance,
} from './bookingAttendancePolicy';
import { addMillisecondsToCanonicalTimestamp } from './guestBooking';
import type {
  CourseDayId,
  CourseEnrollmentId,
  InstructorId,
  OccurrenceId,
  ParticipantId,
} from './identifiers';
import { courseDayOccurrenceIdFromRevision } from './deterministicIdentity';
import {
  compareCanonicalTimestamps,
  AggregateRevisionSchema,
  type CanonicalTimestamp,
} from './primitives';

export { BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS as COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS };

export type CourseEnrollmentOutcomeEligibilityDecision = 'not_yet_eligible' | 'eligible';

export type CourseEnrollmentAttendanceSufficiencyOutcome =
  | 'completed'
  | 'no_show'
  | 'missing_attendance';

export type CourseEnrollmentOutcomeCalculatorDecision =
  | { readonly outcome: 'not_yet_eligible' }
  | { readonly outcome: 'blocked_pending_cancellation' }
  | { readonly outcome: 'blocked_terminal_lifecycle' }
  | { readonly outcome: 'blocked_outcome_issue'; readonly issueKind: AdminIssue['kind'] }
  | { readonly outcome: 'recorded_with_issue'; readonly issueKind: 'attendance_payment_conflict' }
  | { readonly outcome: 'resolve'; readonly lifecycle: 'completed' | 'no_show' }
  | {
      readonly outcome: 'unresolved';
      readonly issueKind: 'missing_attendance';
      readonly missingCourseDayIds: readonly CourseDayId[];
    };

export function courseDayInstructorAttendanceWindowEnd(
  endsAt: CanonicalTimestamp
): CanonicalTimestamp {
  return addMillisecondsToCanonicalTimestamp(endsAt, BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS);
}

export function evaluateCourseEnrollmentOutcomeEligibility(input: {
  readonly now: CanonicalTimestamp;
  readonly finalCourseDayEndsAt: CanonicalTimestamp;
}): CourseEnrollmentOutcomeEligibilityDecision {
  return compareCanonicalTimestamps(input.now, input.finalCourseDayEndsAt) >= 0
    ? 'eligible'
    : 'not_yet_eligible';
}

export function evaluateCourseEnrollmentAutomationEligibility(input: {
  readonly now: CanonicalTimestamp;
  readonly finalCourseDayEndsAt: CanonicalTimestamp;
}): CourseEnrollmentOutcomeEligibilityDecision {
  const automationEligibleAt = courseDayInstructorAttendanceWindowEnd(input.finalCourseDayEndsAt);
  return compareCanonicalTimestamps(input.now, automationEligibleAt) >= 0
    ? 'eligible'
    : 'not_yet_eligible';
}

export function deriveCourseEnrollmentAttendanceSufficiency(input: {
  readonly courseDayCount: number;
  readonly attendanceSummary: CourseEnrollmentAttendanceSummary | undefined;
}): CourseEnrollmentAttendanceSufficiencyOutcome {
  const summary = input.attendanceSummary;
  if (!summary) {
    return 'missing_attendance';
  }
  if (summary.presentDayCount >= 1) {
    return 'completed';
  }
  if (summary.absentDayCount === input.courseDayCount) {
    return 'no_show';
  }
  return 'missing_attendance';
}

export function missingCourseDayAttendanceIssueIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
  readonly courseDayId: CourseDayId;
  readonly participantId: ParticipantId;
  readonly occurrenceId: OccurrenceId;
}): import('./courseEnrollmentAttendanceAdminIssue').AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'missing_attendance',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
    courseDayId: input.courseDayId,
    participantId: input.participantId,
    occurrenceId: input.occurrenceId,
  };
}

export function courseEnrollmentAttendancePaymentConflictIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
  readonly occurrenceId: OccurrenceId;
  readonly participantId: ParticipantId;
}): import('./courseEnrollmentAttendanceAdminIssue').AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'attendance_payment_conflict',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
    occurrenceId: input.occurrenceId,
    participantId: input.participantId,
  };
}

export function outcomeCorrectionRequiredIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
  readonly courseDayId: CourseDayId;
  readonly participantId: ParticipantId;
  readonly occurrenceId: OccurrenceId;
}): import('./courseEnrollmentAttendanceAdminIssue').AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'outcome_correction_required',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
    courseDayId: input.courseDayId,
    participantId: input.participantId,
    occurrenceId: input.occurrenceId,
  };
}

export function deriveCourseEnrollmentLifecycleFromEvidenceCorrection(input: {
  readonly sufficiency: CourseEnrollmentAttendanceSufficiencyOutcome;
}): 'completed' | 'no_show' | 'confirmed' {
  if (input.sufficiency === 'completed') {
    return 'completed';
  }
  if (input.sufficiency === 'no_show') {
    return 'no_show';
  }
  return 'confirmed';
}

export function courseDayOccurrenceId(courseDay: CourseDay): OccurrenceId {
  return courseDayOccurrenceIdFromRevision(courseDay.courseDayId, courseDay.revision);
}

export function findCourseDayForEnrollment(
  courseDays: readonly CourseDay[],
  courseDayId: CourseDayId,
  courseId: Course['courseId']
): CourseDay | undefined {
  return courseDays.find(
    (courseDay) => courseDay.courseDayId === courseDayId && courseDay.courseId === courseId
  );
}

export function instructorAssignedToCourseDay(
  courseDay: CourseDay,
  instructorId: InstructorId
): boolean {
  return courseDay.actualInstructorIds.includes(instructorId);
}

export function applyAttendanceSummaryDelta(input: {
  readonly existing: CourseEnrollmentAttendanceSummary | undefined;
  readonly previousStatus: AttendanceStatus | undefined;
  readonly nextStatus: AttendanceStatus;
}): CourseEnrollmentAttendanceSummary {
  const existing = input.existing ?? {
    recordedDayCount: 0,
    presentDayCount: 0,
    absentDayCount: 0,
    projectionRevision: AggregateRevisionSchema.parse(0),
  };

  let recordedDayCount = existing.recordedDayCount;
  let presentDayCount = existing.presentDayCount;
  let absentDayCount = existing.absentDayCount;

  if (input.previousStatus === undefined) {
    recordedDayCount += 1;
    if (input.nextStatus === 'present') {
      presentDayCount += 1;
    } else {
      absentDayCount += 1;
    }
  } else if (input.previousStatus !== input.nextStatus) {
    if (input.previousStatus === 'present') {
      presentDayCount -= 1;
      absentDayCount += 1;
    } else {
      absentDayCount -= 1;
      presentDayCount += 1;
    }
  }

  return {
    recordedDayCount,
    presentDayCount,
    absentDayCount,
    projectionRevision: AggregateRevisionSchema.parse(existing.projectionRevision + 1),
  };
}

export function courseDayAttendanceMatchesCurrentOccurrence(
  attendance: Attendance,
  courseDay: CourseDay
): boolean {
  if (attendance.subject.subjectKind !== 'course_enrollment') {
    return false;
  }
  return attendance.subject.occurrenceId === courseDayOccurrenceId(courseDay);
}

export function buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence(input: {
  readonly courseDays: readonly CourseDay[];
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): CourseEnrollmentAttendanceSummary {
  let recordedDayCount = 0;
  let presentDayCount = 0;
  let absentDayCount = 0;

  for (const courseDay of input.courseDays) {
    const attendance = input.attendancesByCourseDayId.get(courseDay.courseDayId);
    if (!attendance || !courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay)) {
      continue;
    }
    recordedDayCount += 1;
    if (attendance.attendanceStatus === 'present') {
      presentDayCount += 1;
    } else {
      absentDayCount += 1;
    }
  }

  return {
    recordedDayCount,
    presentDayCount,
    absentDayCount,
    projectionRevision: AggregateRevisionSchema.parse(0),
  };
}

export function resolveMissingCourseDayIds(input: {
  readonly courseDays: readonly CourseDay[];
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): readonly CourseDayId[] {
  return input.courseDays
    .filter((courseDay) => {
      const attendance = input.attendancesByCourseDayId.get(courseDay.courseDayId);
      return !attendance || !courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay);
    })
    .map((courseDay) => courseDay.courseDayId);
}

export function evaluateCourseEnrollmentOutcomeCalculator(input: {
  readonly now: CanonicalTimestamp;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly courseDays: readonly CourseDay[];
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
  readonly openAdminIssues: readonly AdminIssue[];
  readonly automationOnly: boolean;
  readonly justRecordedPresentWithPaymentConflict?: boolean;
}): CourseEnrollmentOutcomeCalculatorDecision {
  const status = input.enrollment.lifecycle.status;

  if (status === 'cancelled' || status === 'withdrawn' || status === 'completed' || status === 'no_show') {
    return { outcome: 'blocked_terminal_lifecycle' };
  }

  if (status === 'pending_cancellation') {
    return { outcome: 'blocked_pending_cancellation' };
  }

  if (status !== 'confirmed') {
    return { outcome: 'blocked_terminal_lifecycle' };
  }

  const eligibility = input.automationOnly
    ? evaluateCourseEnrollmentAutomationEligibility({
        now: input.now,
        finalCourseDayEndsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
      })
    : evaluateCourseEnrollmentOutcomeEligibility({
        now: input.now,
        finalCourseDayEndsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
      });

  if (eligibility === 'not_yet_eligible') {
    return { outcome: 'not_yet_eligible' };
  }

  if (input.justRecordedPresentWithPaymentConflict) {
    return { outcome: 'recorded_with_issue', issueKind: 'attendance_payment_conflict' };
  }

  const blockingIssue = hasOpenOutcomeBlockingAdminIssue(input.openAdminIssues);
  if (blockingIssue) {
    return { outcome: 'blocked_outcome_issue', issueKind: blockingIssue.kind };
  }

  const effectiveSummary = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence({
    courseDays: input.courseDays,
    attendancesByCourseDayId: input.attendancesByCourseDayId,
  });

  const sufficiency = deriveCourseEnrollmentAttendanceSufficiency({
    courseDayCount: input.course.scheduleProjection.courseDayCount,
    attendanceSummary: effectiveSummary,
  });

  if (sufficiency === 'completed') {
    return { outcome: 'resolve', lifecycle: 'completed' };
  }
  if (sufficiency === 'no_show') {
    return { outcome: 'resolve', lifecycle: 'no_show' };
  }

  const missingCourseDayIds = resolveMissingCourseDayIds({
    courseDays: input.courseDays,
    attendancesByCourseDayId: input.attendancesByCourseDayId,
  });

  return {
    outcome: 'unresolved',
    issueKind: 'missing_attendance',
    missingCourseDayIds,
  };
}

export function attendanceCorrectionWouldContradictTerminalOutcome(input: {
  readonly enrollment: CourseEnrollment;
  readonly nextStatus: AttendanceStatus;
}): boolean {
  const status = input.enrollment.lifecycle.status;
  if (status !== 'completed' && status !== 'no_show') {
    return false;
  }
  if (status === 'completed' && input.nextStatus === 'absent') {
    return true;
  }
  if (status === 'no_show' && input.nextStatus === 'present') {
    return true;
  }
  return false;
}

export function assertCourseDayInstructorAttendanceWindow(input: {
  readonly now: CanonicalTimestamp;
  readonly courseDay: CourseDay;
}): 'before_start' | 'in_window' | 'after_instructor_window' {
  return evaluateInstructorAttendanceWindow({
    now: input.now,
    startsAt: input.courseDay.interval.startsAt,
    endsAt: input.courseDay.interval.endsAt,
  });
}

export { instructorMayCorrectAttendance };
