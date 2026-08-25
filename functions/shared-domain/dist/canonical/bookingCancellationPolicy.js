"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS = void 0;
exports.canonicalTimestampToEpochMs = canonicalTimestampToEpochMs;
exports.evaluateClientCancellationTiming = evaluateClientCancellationTiming;
exports.refundableRetainedAmount = refundableRetainedAmount;
exports.calculateFullPaidRefundAmount = calculateFullPaidRefundAmount;
exports.assertApprovedRefundAmount = assertApprovedRefundAmount;
exports.projectCancellationFinancialEffects = projectCancellationFinancialEffects;
exports.accountOwnerCancellationReasonCode = accountOwnerCancellationReasonCode;
exports.administratorCancellationReasonCode = administratorCancellationReasonCode;
exports.unresolvedPendingCancellationIdentity = unresolvedPendingCancellationIdentity;
exports.missingBookingAttendanceIdentity = missingBookingAttendanceIdentity;
exports.resolveLateRejectionOutcome = resolveLateRejectionOutcome;
exports.isConfirmedIndividualBooking = isConfirmedIndividualBooking;
exports.isPendingCancellationIndividualBooking = isPendingCancellationIndividualBooking;
exports.isTerminalBookingLifecycle = isTerminalBookingLifecycle;
exports.isGuestConfirmedBooking = isGuestConfirmedBooking;
exports.resolveRefundDestination = resolveRefundDestination;
const paymentWalletOperations_1 = require("./paymentWalletOperations");
const primitives_1 = require("./primitives");
const primitives_2 = require("./primitives");
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
exports.INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
function canonicalTimestampToEpochMs(timestamp) {
    return timestamp.seconds * 1_000 + Math.floor(timestamp.nanoseconds / 1_000_000);
}
function evaluateClientCancellationTiming(input) {
    if ((0, primitives_1.compareCanonicalTimestamps)(input.requestAt, input.startAt) >= 0) {
        return 'after_start_rejected';
    }
    const timeUntilStartMs = canonicalTimestampToEpochMs(input.startAt) - canonicalTimestampToEpochMs(input.requestAt);
    return timeUntilStartMs >= exports.INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
        ? 'direct_cancel'
        : 'pending_request';
}
function refundableRetainedAmount(payment) {
    return primitives_2.KztMinorUnitsSchema.parse(payment.paidAmount - payment.refundedAmount);
}
function calculateFullPaidRefundAmount(payment) {
    return refundableRetainedAmount(payment);
}
function assertApprovedRefundAmount(payment, refundAmount) {
    const maxRefundable = refundableRetainedAmount(payment);
    if (refundAmount < 0 || refundAmount > maxRefundable) {
        throw new Error('Refund exceeds refundable retained funds');
    }
    return refundAmount;
}
function projectCancellationFinancialEffects(payment, refundAmount) {
    const approvedRefund = assertApprovedRefundAmount(payment, refundAmount);
    let projection = payment;
    let refundDelta = primitives_2.KztMinorUnitsSchema.parse(0);
    if (approvedRefund > 0) {
        const refunded = (0, paymentWalletOperations_1.applyRefundDelta)(payment, approvedRefund);
        projection = refunded;
        refundDelta = approvedRefund;
    }
    const outstandingAfterRefund = projection.outstandingAmount;
    let writeOffDelta = primitives_2.KztMinorUnitsSchema.parse(0);
    if (outstandingAfterRefund > 0) {
        const writtenOff = (0, paymentWalletOperations_1.applyWriteOffAmount)(projection, outstandingAfterRefund);
        projection = writtenOff;
        writeOffDelta = outstandingAfterRefund;
    }
    return { payment: projection, refundDelta, writeOffDelta };
}
function accountOwnerCancellationReasonCode() {
    return 'account_owner_cancelled';
}
function administratorCancellationReasonCode() {
    return 'administrator_cancelled';
}
function unresolvedPendingCancellationIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'unresolved_pending_cancellation',
        subjectKind: 'booking',
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
    };
}
function missingBookingAttendanceIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'missing_attendance',
        subjectKind: 'booking',
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
        participantId: input.participantId,
    };
}
function resolveLateRejectionOutcome(input) {
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, input.booking.occurrence.interval.endsAt) < 0) {
        return { outcome: 'confirmed' };
    }
    if (!input.attendance) {
        return { outcome: 'missing_attendance' };
    }
    if (input.attendance.attendanceStatus === 'present') {
        return { outcome: 'completed' };
    }
    return { outcome: 'no_show' };
}
function isConfirmedIndividualBooking(booking) {
    return booking.party.kind === 'individual' && booking.lifecycle.status === 'confirmed';
}
function isPendingCancellationIndividualBooking(booking) {
    return booking.party.kind === 'individual' && booking.lifecycle.status === 'pending_cancellation';
}
function isTerminalBookingLifecycle(booking) {
    const status = booking.lifecycle.status;
    return status === 'cancelled' || status === 'completed' || status === 'no_show';
}
function isGuestConfirmedBooking(booking) {
    return booking.attribution.bookingOrigin === 'guest' && booking.lifecycle.status === 'confirmed';
}
function resolveRefundDestination(input) {
    const accountId = input.booking.payerAccountId ?? input.payment.payerAccountId;
    return accountId === undefined ? 'manual_external' : 'wallet';
}
