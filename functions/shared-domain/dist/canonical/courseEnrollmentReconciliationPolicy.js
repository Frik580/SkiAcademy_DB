"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE = void 0;
exports.courseEnrollmentResourceReconciliationMismatchIdentity = courseEnrollmentResourceReconciliationMismatchIdentity;
exports.shouldResolveStalePaymentRequiredAtStartIssue = shouldResolveStalePaymentRequiredAtStartIssue;
exports.shouldResolveStaleAttendancePaymentConflictIssue = shouldResolveStaleAttendancePaymentConflictIssue;
exports.shouldResolveStaleMissingAttendanceIssue = shouldResolveStaleMissingAttendanceIssue;
exports.evaluateCourseEnrollmentReconciliation = evaluateCourseEnrollmentReconciliation;
exports.courseEnrollmentReconciliationHasMutations = courseEnrollmentReconciliationHasMutations;
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const courseEnrollmentAttendancePolicy_1 = require("./courseEnrollmentAttendancePolicy");
const adminIssuePolicy_1 = require("./adminIssuePolicy");
const deterministicIdentity_1 = require("./deterministicIdentity");
const paymentWallet_1 = require("./paymentWallet");
const courseEnrollmentCancellationPolicy_1 = require("./courseEnrollmentCancellationPolicy");
exports.COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE = 'course_enrollment_resources';
function courseEnrollmentResourceReconciliationMismatchIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'resource_reconciliation_mismatch',
        subjectKind: 'course_enrollment',
        subjectId: input.enrollmentId,
        reconciliationScope: exports.COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE,
    };
}
function shouldResolveStalePaymentRequiredAtStartIssue(input) {
    if (input.issue.kind !== 'payment_required_at_start' || input.issue.lifecycle.status !== 'open') {
        return false;
    }
    if (!(0, paymentWallet_1.isPaymentFullyFundedForService)(input.payment)) {
        return false;
    }
    const gateDecision = (0, adminIssuePolicy_1.evaluateCourseEnrollmentPaymentStartGate)({
        now: input.course.startAt,
        enrollment: input.enrollment,
        course: input.course,
        payment: input.payment,
    });
    return gateDecision.outcome === 'fully_funded';
}
function shouldResolveStaleAttendancePaymentConflictIssue(input) {
    if (input.issue.kind !== 'attendance_payment_conflict' || input.issue.lifecycle.status !== 'open') {
        return false;
    }
    const restrictionActive = (0, adminIssuePolicy_1.isCourseEnrollmentPaymentStartRestrictionActive)({
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
        if (attendance.attendanceStatus === 'present' &&
            attendance.subject.subjectKind === 'course_enrollment' &&
            attendance.subject.enrollmentId === input.enrollment.enrollmentId) {
            return true;
        }
    }
    return false;
}
function shouldResolveStaleMissingAttendanceIssue(input) {
    if (input.issue.kind !== 'missing_attendance' || input.issue.lifecycle.status !== 'open') {
        return false;
    }
    const courseDayId = input.issue.courseDayId;
    if (!courseDayId) {
        return false;
    }
    const courseDay = (0, courseEnrollmentAttendancePolicy_1.findCourseDayForEnrollment)(input.courseDays, courseDayId, input.course.courseId);
    if (!courseDay) {
        return false;
    }
    const issueOccurrenceId = input.issue.occurrenceId;
    const currentOccurrenceId = (0, courseEnrollmentAttendancePolicy_1.courseDayOccurrenceId)(courseDay);
    if (issueOccurrenceId !== currentOccurrenceId) {
        return false;
    }
    const attendance = input.attendancesByCourseDayId.get(courseDayId);
    return attendance !== undefined && (0, courseEnrollmentAttendancePolicy_1.courseDayAttendanceMatchesCurrentOccurrence)(attendance, courseDay);
}
function issueResolutionTargetsIssue(resolution, issue) {
    if (resolution.kind !== issue.kind) {
        return false;
    }
    if (issue.kind === 'missing_attendance') {
        return (resolution.identity.courseDayId === issue.courseDayId &&
            resolution.identity.occurrenceId === issue.occurrenceId);
    }
    return true;
}
function evaluateCourseEnrollmentReconciliation(input) {
    const status = input.enrollment.lifecycle.status;
    if (status === 'pending_cancellation') {
        return { outcome: 'no_repair_pending_cancellation' };
    }
    if ((0, courseEnrollmentCancellationPolicy_1.isTerminalCourseEnrollmentLifecycle)(input.enrollment)) {
        return {
            outcome: 'no_repair_terminal_lifecycle',
            openResourceReconciliationMismatch: input.terminalEnrollmentHasActiveResourceGuard === true,
        };
    }
    const issueResolutions = [];
    const paymentStartIssue = input.openAdminIssues.find((issue) => issue.kind === 'payment_required_at_start' &&
        issue.lifecycle.status === 'open' &&
        issue.subjectRef.subjectKind === 'course_enrollment' &&
        issue.subjectRef.enrollmentId === input.enrollment.enrollmentId);
    if (paymentStartIssue &&
        shouldResolveStalePaymentRequiredAtStartIssue({
            enrollment: input.enrollment,
            course: input.course,
            payment: input.payment,
            issue: paymentStartIssue,
        })) {
        issueResolutions.push({
            kind: 'payment_required_at_start',
            identity: (0, adminIssuePolicy_1.paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment)(input.enrollment.enrollmentId),
            reason: 'Payment fully funded; payment-start restriction cleared',
        });
    }
    const paymentRequiredStillOpen = paymentStartIssue !== undefined &&
        paymentStartIssue.lifecycle.status === 'open' &&
        !issueResolutions.some((resolution) => resolution.kind === 'payment_required_at_start');
    const paymentConflictIssue = input.openAdminIssues.find((issue) => issue.kind === 'attendance_payment_conflict' &&
        issue.lifecycle.status === 'open' &&
        issue.subjectRef.subjectKind === 'course_enrollment' &&
        issue.subjectRef.enrollmentId === input.enrollment.enrollmentId);
    if (paymentConflictIssue &&
        shouldResolveStaleAttendancePaymentConflictIssue({
            enrollment: input.enrollment,
            course: input.course,
            payment: input.payment,
            issue: paymentConflictIssue,
            paymentRequiredAtStartStillOpen: paymentRequiredStillOpen,
            attendancesByCourseDayId: input.attendancesByCourseDayId,
        })) {
        issueResolutions.push({
            kind: 'attendance_payment_conflict',
            identity: (0, courseEnrollmentAttendancePolicy_1.courseEnrollmentAttendancePaymentConflictIdentity)({
                enrollmentId: input.enrollment.enrollmentId,
                occurrenceId: paymentConflictIssue.occurrenceId ?? (0, deterministicIdentity_1.courseEnrollmentSeatOccurrenceId)(input.enrollment.enrollmentId),
                participantId: input.enrollment.participantId,
            }),
            reason: 'Payment restriction cleared; factual present attendance retained',
        });
    }
    for (const issue of input.openAdminIssues) {
        if (issue.kind !== 'missing_attendance' || issue.lifecycle.status !== 'open') {
            continue;
        }
        if (shouldResolveStaleMissingAttendanceIssue({
            enrollment: input.enrollment,
            course: input.course,
            issue,
            attendancesByCourseDayId: input.attendancesByCourseDayId,
            courseDays: input.courseDays,
        })) {
            const courseDayId = issue.courseDayId;
            const courseDay = (0, courseEnrollmentAttendancePolicy_1.findCourseDayForEnrollment)(input.courseDays, courseDayId, input.course.courseId);
            issueResolutions.push({
                kind: 'missing_attendance',
                identity: (0, courseEnrollmentAttendancePolicy_1.missingCourseDayAttendanceIssueIdentity)({
                    enrollmentId: input.enrollment.enrollmentId,
                    courseDayId,
                    participantId: input.enrollment.participantId,
                    occurrenceId: (0, courseEnrollmentAttendancePolicy_1.courseDayOccurrenceId)(courseDay),
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
    const outcomeDecision = (0, courseEnrollmentAttendancePolicy_1.evaluateCourseEnrollmentOutcomeCalculator)({
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
function courseEnrollmentReconciliationHasMutations(input) {
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
