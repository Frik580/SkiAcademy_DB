"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS = exports.COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS = void 0;
exports.isCourseCapacityFrozen = isCourseCapacityFrozen;
exports.shouldReleasePreStartSeatOnTerminalization = shouldReleasePreStartSeatOnTerminalization;
exports.evaluateClientCourseCancellationTiming = evaluateClientCourseCancellationTiming;
exports.calculatePolicyRefundAmount = calculatePolicyRefundAmount;
exports.assertApprovedCourseRefundAmount = assertApprovedCourseRefundAmount;
exports.projectCourseCancellationFinancialEffects = projectCourseCancellationFinancialEffects;
exports.accountOwnerCourseCancellationReasonCode = accountOwnerCourseCancellationReasonCode;
exports.administratorCourseCancellationReasonCode = administratorCourseCancellationReasonCode;
exports.guestCourseCancellationReasonCode = guestCourseCancellationReasonCode;
exports.reservationExpiredCourseCancellationReasonCode = reservationExpiredCourseCancellationReasonCode;
exports.unresolvedCourseEnrollmentPendingCancellationIdentity = unresolvedCourseEnrollmentPendingCancellationIdentity;
exports.resolveCourseEnrollmentRefundDestination = resolveCourseEnrollmentRefundDestination;
exports.resolveAdminCancellationApprovalTerminalStatus = resolveAdminCancellationApprovalTerminalStatus;
exports.isActiveCourseEnrollmentLifecycle = isActiveCourseEnrollmentLifecycle;
exports.isConfirmedOrPendingCourseEnrollment = isConfirmedOrPendingCourseEnrollment;
exports.isPendingCancellationCourseEnrollment = isPendingCancellationCourseEnrollment;
exports.isTerminalCourseEnrollmentLifecycle = isTerminalCourseEnrollmentLifecycle;
const paymentWalletOperations_1 = require("./paymentWalletOperations");
const bookingCancellationPolicy_1 = require("./bookingCancellationPolicy");
const primitives_1 = require("./primitives");
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
exports.COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1_000;
exports.COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS = 2 * 24 * 60 * 60 * 1_000;
function isCourseCapacityFrozen(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.courseStartAt) >= 0;
}
function shouldReleasePreStartSeatOnTerminalization(input) {
    return !isCourseCapacityFrozen(input);
}
function evaluateClientCourseCancellationTiming(input) {
    const timeUntilStartMs = (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.startAt) - (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.requestAt);
    if (timeUntilStartMs >= exports.COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS) {
        return { kind: 'direct_cancel', refundPercentBasisPoints: 10_000 };
    }
    if (timeUntilStartMs >= exports.COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS) {
        return { kind: 'direct_cancel', refundPercentBasisPoints: 5_000 };
    }
    return { kind: 'pending_request' };
}
function calculatePolicyRefundAmount(input) {
    const maxRefundable = (0, bookingCancellationPolicy_1.refundableRetainedAmount)(input.payment);
    if (maxRefundable <= 0) {
        return primitives_1.KztMinorUnitsSchema.parse(0);
    }
    if (!Number.isInteger(input.refundPercentBasisPoints) ||
        input.refundPercentBasisPoints < 0 ||
        input.refundPercentBasisPoints > 10_000) {
        throw new Error('Refund percent must be between 0 and 10000 basis points');
    }
    const rawRefund = Math.floor((maxRefundable * input.refundPercentBasisPoints + 5_000) / 10_000);
    return primitives_1.KztMinorUnitsSchema.parse(Math.min(Math.max(0, rawRefund), maxRefundable));
}
function assertApprovedCourseRefundAmount(payment, refundAmount) {
    const maxRefundable = (0, bookingCancellationPolicy_1.refundableRetainedAmount)(payment);
    if (refundAmount < 0 || refundAmount > maxRefundable) {
        throw new Error('Refund exceeds refundable retained funds');
    }
    return refundAmount;
}
function projectCourseCancellationFinancialEffects(payment, refundAmount) {
    const approvedRefund = assertApprovedCourseRefundAmount(payment, refundAmount);
    let projection = payment;
    let refundDelta = primitives_1.KztMinorUnitsSchema.parse(0);
    if (approvedRefund > 0) {
        const refunded = (0, paymentWalletOperations_1.applyRefundDelta)(payment, approvedRefund);
        projection = refunded;
        refundDelta = approvedRefund;
    }
    const outstandingAfterRefund = projection.outstandingAmount;
    let writeOffDelta = primitives_1.KztMinorUnitsSchema.parse(0);
    if (outstandingAfterRefund > 0) {
        const writtenOff = (0, paymentWalletOperations_1.applyWriteOffAmount)(projection, outstandingAfterRefund);
        projection = writtenOff;
        writeOffDelta = outstandingAfterRefund;
    }
    return { payment: projection, refundDelta, writeOffDelta };
}
function accountOwnerCourseCancellationReasonCode() {
    return 'account_owner_cancelled';
}
function administratorCourseCancellationReasonCode() {
    return 'administrator_cancelled';
}
function guestCourseCancellationReasonCode() {
    return 'guest_cancelled';
}
function reservationExpiredCourseCancellationReasonCode() {
    return 'reservation_expired';
}
function unresolvedCourseEnrollmentPendingCancellationIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'unresolved_pending_cancellation',
        subjectKind: 'course_enrollment',
        subjectId: input.enrollmentId,
    };
}
function resolveCourseEnrollmentRefundDestination(payment) {
    return payment.payerAccountId === undefined ? 'manual_external' : 'wallet';
}
function resolveAdminCancellationApprovalTerminalStatus(input) {
    if (input.refundAmount > 0) {
        return 'cancelled';
    }
    if (input.bookingOrigin === 'guest') {
        return 'cancelled';
    }
    return 'withdrawn';
}
function isActiveCourseEnrollmentLifecycle(enrollment) {
    const status = enrollment.lifecycle.status;
    return status === 'pending' || status === 'confirmed' || status === 'pending_cancellation';
}
function isConfirmedOrPendingCourseEnrollment(enrollment) {
    const status = enrollment.lifecycle.status;
    return status === 'confirmed' || status === 'pending';
}
function isPendingCancellationCourseEnrollment(enrollment) {
    return enrollment.lifecycle.status === 'pending_cancellation';
}
function isTerminalCourseEnrollmentLifecycle(enrollment) {
    const status = enrollment.lifecycle.status;
    return (status === 'cancelled' ||
        status === 'withdrawn' ||
        status === 'completed' ||
        status === 'no_show');
}
