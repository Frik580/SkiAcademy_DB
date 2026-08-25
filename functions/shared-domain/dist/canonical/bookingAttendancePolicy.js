"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS = void 0;
exports.bookingInstructorAttendanceWindowEnd = bookingInstructorAttendanceWindowEnd;
exports.evaluateInstructorAttendanceWindow = evaluateInstructorAttendanceWindow;
exports.evaluateBookingOutcomeEligibility = evaluateBookingOutcomeEligibility;
exports.evaluateBookingAutomationEligibility = evaluateBookingAutomationEligibility;
exports.resolveBookingAttendanceTargets = resolveBookingAttendanceTargets;
exports.deriveIndividualBookingAttendanceOutcome = deriveIndividualBookingAttendanceOutcome;
exports.deriveGroupBookingAttendanceOutcome = deriveGroupBookingAttendanceOutcome;
exports.missingBookingAttendanceIssueIdentity = missingBookingAttendanceIssueIdentity;
exports.attendancePaymentConflictIdentity = attendancePaymentConflictIdentity;
exports.hasOpenOutcomeBlockingAdminIssue = hasOpenOutcomeBlockingAdminIssue;
exports.shouldCreateAttendancePaymentConflict = shouldCreateAttendancePaymentConflict;
exports.evaluateBookingOutcomeCalculator = evaluateBookingOutcomeCalculator;
exports.instructorMayCorrectAttendance = instructorMayCorrectAttendance;
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const guestBooking_1 = require("./guestBooking");
const primitives_1 = require("./primitives");
exports.BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS = 24 * 60 * 60 * 1_000;
function bookingInstructorAttendanceWindowEnd(endsAt) {
    return (0, guestBooking_1.addMillisecondsToCanonicalTimestamp)(endsAt, exports.BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS);
}
function evaluateInstructorAttendanceWindow(input) {
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, input.startsAt) < 0) {
        return 'before_start';
    }
    const windowEnd = bookingInstructorAttendanceWindowEnd(input.endsAt);
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, windowEnd) <= 0) {
        return 'in_window';
    }
    return 'after_instructor_window';
}
function evaluateBookingOutcomeEligibility(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.endsAt) >= 0 ? 'eligible' : 'not_yet_eligible';
}
function evaluateBookingAutomationEligibility(input) {
    const automationEligibleAt = bookingInstructorAttendanceWindowEnd(input.endsAt);
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, automationEligibleAt) >= 0
        ? 'eligible'
        : 'not_yet_eligible';
}
function resolveBookingAttendanceTargets(booking, participantId) {
    const { serviceParty } = booking.occurrence;
    if (!serviceParty.frozenAt) {
        return { outcome: 'service_party_not_frozen' };
    }
    if (!serviceParty.participantIds.includes(participantId)) {
        return { outcome: 'participant_not_in_target', participantId };
    }
    return { outcome: 'ready', participantIds: serviceParty.participantIds };
}
function deriveIndividualBookingAttendanceOutcome(attendance) {
    if (!attendance) {
        return 'missing_attendance';
    }
    return attendance.attendanceStatus === 'present' ? 'completed' : 'no_show';
}
function deriveGroupBookingAttendanceOutcome(input) {
    let presentCount = 0;
    let absentCount = 0;
    const missingParticipantIds = [];
    for (const participantId of input.targetParticipantIds) {
        const attendance = input.attendancesByParticipantId.get(participantId);
        if (!attendance) {
            missingParticipantIds.push(participantId);
            continue;
        }
        if (attendance.attendanceStatus === 'present') {
            presentCount += 1;
        }
        else {
            absentCount += 1;
        }
    }
    if (presentCount >= 1) {
        return { outcome: 'completed', missingParticipantIds };
    }
    if (absentCount === input.targetParticipantIds.length) {
        return { outcome: 'no_show', missingParticipantIds };
    }
    return { outcome: 'missing_attendance', missingParticipantIds };
}
function missingBookingAttendanceIssueIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'missing_attendance',
        subjectKind: 'booking',
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
        participantId: input.participantId,
    };
}
function attendancePaymentConflictIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'attendance_payment_conflict',
        subjectKind: 'booking',
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
        participantId: input.participantId,
    };
}
function hasOpenOutcomeBlockingAdminIssue(issues) {
    return issues.find((issue) => issue.lifecycle.status === 'open' &&
        issue.blocksOutcome &&
        (issue.kind === 'payment_required_at_start' ||
            issue.kind === 'unresolved_pending_cancellation' ||
            issue.kind === 'attendance_payment_conflict' ||
            issue.kind === 'outcome_correction_required'));
}
function shouldCreateAttendancePaymentConflict(input) {
    return input.attendanceStatus === 'present' && input.openPaymentRequiredAtStart;
}
function evaluateBookingOutcomeCalculator(input) {
    const { booking } = input;
    const status = booking.lifecycle.status;
    if (status === 'cancelled' || status === 'completed' || status === 'no_show') {
        return { outcome: 'blocked_terminal_lifecycle' };
    }
    if (status === 'pending_cancellation') {
        return { outcome: 'blocked_pending_cancellation' };
    }
    if (status !== 'confirmed') {
        return { outcome: 'blocked_terminal_lifecycle' };
    }
    const eligibility = input.automationOnly
        ? evaluateBookingAutomationEligibility({
            now: input.now,
            endsAt: booking.occurrence.interval.endsAt,
        })
        : evaluateBookingOutcomeEligibility({
            now: input.now,
            endsAt: booking.occurrence.interval.endsAt,
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
    if (!booking.occurrence.serviceParty.frozenAt) {
        return {
            outcome: 'unresolved',
            issueKind: 'missing_attendance',
            missingParticipantIds: booking.occurrence.serviceParty.participantIds,
        };
    }
    const targetParticipantIds = booking.occurrence.serviceParty.participantIds;
    const sufficiency = booking.party.kind === 'individual'
        ? {
            outcome: deriveIndividualBookingAttendanceOutcome(input.attendancesByParticipantId.get(targetParticipantIds[0])),
            missingParticipantIds: input.attendancesByParticipantId.has(targetParticipantIds[0])
                ? []
                : [targetParticipantIds[0]],
        }
        : deriveGroupBookingAttendanceOutcome({
            targetParticipantIds,
            attendancesByParticipantId: input.attendancesByParticipantId,
        });
    if (sufficiency.outcome === 'completed') {
        return { outcome: 'resolve', lifecycle: 'completed' };
    }
    if (sufficiency.outcome === 'no_show') {
        return { outcome: 'resolve', lifecycle: 'no_show' };
    }
    return {
        outcome: 'unresolved',
        issueKind: 'missing_attendance',
        missingParticipantIds: sufficiency.missingParticipantIds,
    };
}
function instructorMayCorrectAttendance(input) {
    return (input.existing.recordedBy.kind === 'instructor' &&
        input.existing.recordedBy.instructorId === input.instructorId);
}
