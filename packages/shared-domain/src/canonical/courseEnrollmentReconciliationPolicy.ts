import {
  ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
  type AdminIssue,
  type AdminIssueDedupeIdentityInput,
  type Attendance,
  type Course,
  type CourseDay,
  type CourseEnrollment,
} from './courseEnrollmentAttendanceAdminIssue';
import type { CourseDayId } from './identifiers';
import {
  courseDayAttendanceMatchesCurrentOccurrence,
  courseDayOccurrenceId,
  courseEnrollmentAttendancePaymentConflictIdentity,
  evaluateCourseEnrollmentOutcomeCalculator,
  findCourseDayForEnrollment,
  missingCourseDayAttendanceIssueIdentity,
  type CourseEnrollmentOutcomeCalculatorDecision,
} from './courseEnrollmentAttendancePolicy';
import {
  evaluateCourseEnrollmentPaymentStartGate,
  isCourseEnrollmentPaymentStartRestrictionActive,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
} from './adminIssuePolicy';
import { courseEnrollmentSeatOccurrenceId } from './deterministicIdentity';
import { isPaymentFullyFundedForService, type Payment } from './paymentWallet';
import { isTerminalCourseEnrollmentLifecycle } from './courseEnrollmentCancellationPolicy';
import type { CourseEnrollmentId } from './identifiers';
import type { CanonicalTimestamp } from './primitives';

export const COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE = 'course_enrollment_resources' as const;

export type CourseEnrollmentReconciliationIssueKind =
  | 'payment_required_at_start'
  | 'attendance_payment_conflict'
  | 'missing_attendance';

export interface CourseEnrollmentReconciliationIssueResolution {
  readonly kind: CourseEnrollmentReconciliationIssueKind;
  readonly identity: AdminIssueDedupeIdentityInput;
  readonly reason: string;
}

export type CourseEnrollmentReconciliationDecision =
  | { readonly outcome: 'no_repair_terminal_lifecycle'; readonly openResourceReconciliationMismatch: boolean }
  | { readonly outcome: 'no_repair_pending_cancellation' }
  | {
      readonly outcome: 'repair';
      readonly issueResolutions: readonly CourseEnrollmentReconciliationIssueResolution[];
      readonly outcomeDecision: CourseEnrollmentOutcomeCalculatorDecision;
      readonly openResourceReconciliationMismatch: boolean;
    };

export function courseEnrollmentResourceReconciliationMismatchIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'resource_reconciliation_mismatch',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
    reconciliationScope: COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE,
  };
}

export function shouldResolveStalePaymentRequiredAtStartIssue(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: Payment;
  readonly issue: AdminIssue;
}): boolean {
  if (input.issue.kind !== 'payment_required_at_start' || input.issue.lifecycle.status !== 'open') {
    return false;
  }
  if (!isPaymentFullyFundedForService(input.payment)) {
    return false;
  }
  const gateDecision = evaluateCourseEnrollmentPaymentStartGate({
    now: input.course.startAt,
    enrollment: input.enrollment,
    course: input.course,
    payment: input.payment,
  });
  return gateDecision.outcome === 'fully_funded';
}

export function shouldResolveStaleAttendancePaymentConflictIssue(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: Payment;
  readonly issue: AdminIssue;
  readonly paymentRequiredAtStartStillOpen: boolean;
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): boolean {
  if (input.issue.kind !== 'attendance_payment_conflict' || input.issue.lifecycle.status !== 'open') {
    return false;
  }
  const restrictionActive = isCourseEnrollmentPaymentStartRestrictionActive({
    now: input.course.startAt,
    enrollment: input.enrollment,
    course: input.course,
    payment: input.payment,
    openPaymentRequiredAtStartIssue: input.paymentRequiredAtStartStillOpen,
  });
  if (restrictionActive) {
    return false;
  }
  for (const attendance of input.attendancesByCourseDayId.values()) {
    if (
      attendance.attendanceStatus === 'present' &&
      attendance.subject.subjectKind === 'course_enrollment' &&
      attendance.subject.enrollmentId === input.enrollment.enrollmentId
    ) {
      return true;
    }
  }
  return false;
}

export function shouldResolveStaleMissingAttendanceIssue(input: {
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly issue: AdminIssue;
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
  readonly courseDays: readonly CourseDay[];
}): boolean {
  if (input.issue.kind !== 'missing_attendance' || input.issue.lifecycle.status !== 'open') {
    return false;
  }
  const courseDayId = input.issue.courseDayId;
  if (!courseDayId) {
    return false;
  }
  const courseDay = findCourseDayForEnrollment(
    input.courseDays,
    courseDayId,
    input.course.courseId
  );
  if (!courseDay) {
    return false;
  }
  const issueOccurrenceId = input.issue.occurrenceId;
  const currentOccurrenceId = courseDayOccurrenceId(courseDay);
  if (issueOccurrenceId !== currentOccurrenceId) {
    return false;
  }
  const attendance = input.attendancesByCourseDayId.get(courseDayId);
  return attendance !== undefined && courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay);
}

function issueResolutionTargetsIssue(
  resolution: CourseEnrollmentReconciliationIssueResolution,
  issue: AdminIssue
): boolean {
  if (resolution.kind !== issue.kind) {
    return false;
  }
  if (issue.kind === 'missing_attendance') {
    return (
      resolution.identity.courseDayId === issue.courseDayId &&
      resolution.identity.occurrenceId === issue.occurrenceId
    );
  }
  return true;
}

export function evaluateCourseEnrollmentReconciliation(input: {
  readonly now: CanonicalTimestamp;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly courseDays: readonly CourseDay[];
  readonly payment: Payment;
  readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
  readonly openAdminIssues: readonly AdminIssue[];
  readonly automationOnly: boolean;
  readonly terminalEnrollmentHasActiveResourceGuard?: boolean;
}): CourseEnrollmentReconciliationDecision {
  const status = input.enrollment.lifecycle.status;

  if (status === 'pending_cancellation') {
    return { outcome: 'no_repair_pending_cancellation' };
  }

  if (isTerminalCourseEnrollmentLifecycle(input.enrollment)) {
    return {
      outcome: 'no_repair_terminal_lifecycle',
      openResourceReconciliationMismatch: input.terminalEnrollmentHasActiveResourceGuard === true,
    };
  }

  const issueResolutions: CourseEnrollmentReconciliationIssueResolution[] = [];

  const paymentStartIssue = input.openAdminIssues.find(
    (issue) =>
      issue.kind === 'payment_required_at_start' &&
      issue.lifecycle.status === 'open' &&
      issue.subjectRef.subjectKind === 'course_enrollment' &&
      issue.subjectRef.enrollmentId === input.enrollment.enrollmentId
  );

  if (
    paymentStartIssue &&
    shouldResolveStalePaymentRequiredAtStartIssue({
      enrollment: input.enrollment,
      course: input.course,
      payment: input.payment,
      issue: paymentStartIssue,
    })
  ) {
    issueResolutions.push({
      kind: 'payment_required_at_start',
      identity: paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(
        input.enrollment.enrollmentId
      ),
      reason: 'Payment fully funded; payment-start restriction cleared',
    });
  }

  const paymentRequiredStillOpen =
    paymentStartIssue !== undefined &&
    paymentStartIssue.lifecycle.status === 'open' &&
    !issueResolutions.some((resolution) => resolution.kind === 'payment_required_at_start');

  const paymentConflictIssue = input.openAdminIssues.find(
    (issue) =>
      issue.kind === 'attendance_payment_conflict' &&
      issue.lifecycle.status === 'open' &&
      issue.subjectRef.subjectKind === 'course_enrollment' &&
      issue.subjectRef.enrollmentId === input.enrollment.enrollmentId
  );

  if (
    paymentConflictIssue &&
    shouldResolveStaleAttendancePaymentConflictIssue({
      enrollment: input.enrollment,
      course: input.course,
      payment: input.payment,
      issue: paymentConflictIssue,
      paymentRequiredAtStartStillOpen: paymentRequiredStillOpen,
      attendancesByCourseDayId: input.attendancesByCourseDayId,
    })
  ) {
    issueResolutions.push({
      kind: 'attendance_payment_conflict',
      identity: courseEnrollmentAttendancePaymentConflictIdentity({
        enrollmentId: input.enrollment.enrollmentId,
        occurrenceId: paymentConflictIssue.occurrenceId ?? courseEnrollmentSeatOccurrenceId(
          input.enrollment.enrollmentId
        ),
        participantId: input.enrollment.participantId,
      }),
      reason: 'Payment restriction cleared; factual present attendance retained',
    });
  }

  for (const issue of input.openAdminIssues) {
    if (issue.kind !== 'missing_attendance' || issue.lifecycle.status !== 'open') {
      continue;
    }
    if (
      shouldResolveStaleMissingAttendanceIssue({
        enrollment: input.enrollment,
        course: input.course,
        issue,
        attendancesByCourseDayId: input.attendancesByCourseDayId,
        courseDays: input.courseDays,
      })
    ) {
      const courseDayId = issue.courseDayId!;
      const courseDay = findCourseDayForEnrollment(
        input.courseDays,
        courseDayId,
        input.course.courseId
      )!;
      issueResolutions.push({
        kind: 'missing_attendance',
        identity: missingCourseDayAttendanceIssueIdentity({
          enrollmentId: input.enrollment.enrollmentId,
          courseDayId,
          participantId: input.enrollment.participantId,
          occurrenceId: courseDayOccurrenceId(courseDay),
        }),
        reason: 'Current occurrence attendance evidence recorded',
      });
    }
  }

  const remainingOpenIssues = input.openAdminIssues.filter((issue) => {
    if (issue.lifecycle.status !== 'open') {
      return false;
    }
    return !issueResolutions.some((resolution) => issueResolutionTargetsIssue(resolution, issue));
  });

  const outcomeDecision = evaluateCourseEnrollmentOutcomeCalculator({
    now: input.now,
    enrollment: input.enrollment,
    course: input.course,
    courseDays: input.courseDays,
    attendancesByCourseDayId: input.attendancesByCourseDayId,
    openAdminIssues: remainingOpenIssues,
    automationOnly: input.automationOnly,
  });

  return {
    outcome: 'repair',
    issueResolutions,
    outcomeDecision,
    openResourceReconciliationMismatch: false,
  };
}

export function courseEnrollmentReconciliationHasMutations(input: {
  readonly decision: CourseEnrollmentReconciliationDecision;
}): boolean {
  if (input.decision.outcome === 'no_repair_pending_cancellation') {
    return false;
  }
  if (input.decision.outcome === 'no_repair_terminal_lifecycle') {
    return input.decision.openResourceReconciliationMismatch;
  }
  if (input.decision.issueResolutions.length > 0) {
    return true;
  }
  if (input.decision.openResourceReconciliationMismatch) {
    return true;
  }
  return input.decision.outcomeDecision.outcome === 'resolve';
}
