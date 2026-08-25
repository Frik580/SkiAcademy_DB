import { type AdminIssue, type AdminIssueDedupeIdentityInput, type Attendance, type AttendanceStatus } from './courseEnrollmentAttendanceAdminIssue';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { BookingId, InstructorId, OccurrenceId, ParticipantId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
export declare const BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS: number;
export type InstructorAttendanceWindowDecision = 'before_start' | 'in_window' | 'after_instructor_window';
export type BookingOutcomeEligibilityDecision = 'not_yet_eligible' | 'eligible';
export type BookingAttendanceTargetDecision = {
    readonly outcome: 'ready';
    readonly participantIds: readonly ParticipantId[];
} | {
    readonly outcome: 'service_party_not_frozen';
} | {
    readonly outcome: 'participant_not_in_target';
    readonly participantId: ParticipantId;
};
export type IndividualBookingAttendanceOutcome = 'completed' | 'no_show' | 'missing_attendance';
export type GroupBookingAttendanceOutcome = 'completed' | 'no_show' | 'missing_attendance';
export type BookingOutcomeCalculatorDecision = {
    readonly outcome: 'not_yet_eligible';
} | {
    readonly outcome: 'blocked_pending_cancellation';
} | {
    readonly outcome: 'blocked_terminal_lifecycle';
} | {
    readonly outcome: 'blocked_outcome_issue';
    readonly issueKind: AdminIssue['kind'];
} | {
    readonly outcome: 'recorded_with_issue';
    readonly issueKind: 'attendance_payment_conflict';
} | {
    readonly outcome: 'resolve';
    readonly lifecycle: 'completed' | 'no_show';
} | {
    readonly outcome: 'unresolved';
    readonly issueKind: 'missing_attendance';
    readonly missingParticipantIds: readonly ParticipantId[];
};
export declare function bookingInstructorAttendanceWindowEnd(endsAt: CanonicalTimestamp): CanonicalTimestamp;
export declare function evaluateInstructorAttendanceWindow(input: {
    readonly now: CanonicalTimestamp;
    readonly startsAt: CanonicalTimestamp;
    readonly endsAt: CanonicalTimestamp;
}): InstructorAttendanceWindowDecision;
export declare function evaluateBookingOutcomeEligibility(input: {
    readonly now: CanonicalTimestamp;
    readonly endsAt: CanonicalTimestamp;
}): BookingOutcomeEligibilityDecision;
export declare function evaluateBookingAutomationEligibility(input: {
    readonly now: CanonicalTimestamp;
    readonly endsAt: CanonicalTimestamp;
}): BookingOutcomeEligibilityDecision;
export declare function resolveBookingAttendanceTargets(booking: Booking, participantId: ParticipantId): BookingAttendanceTargetDecision;
export declare function deriveIndividualBookingAttendanceOutcome(attendance: Attendance | undefined): IndividualBookingAttendanceOutcome;
export declare function deriveGroupBookingAttendanceOutcome(input: {
    readonly targetParticipantIds: readonly ParticipantId[];
    readonly attendancesByParticipantId: ReadonlyMap<ParticipantId, Attendance>;
}): {
    readonly outcome: GroupBookingAttendanceOutcome;
    readonly missingParticipantIds: readonly ParticipantId[];
};
export declare function missingBookingAttendanceIssueIdentity(input: {
    readonly bookingId: BookingId;
    readonly occurrenceId: OccurrenceId;
    readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput;
export declare function attendancePaymentConflictIdentity(input: {
    readonly bookingId: BookingId;
    readonly occurrenceId: OccurrenceId;
    readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput;
export declare function hasOpenOutcomeBlockingAdminIssue(issues: readonly AdminIssue[]): AdminIssue | undefined;
export declare function shouldCreateAttendancePaymentConflict(input: {
    readonly attendanceStatus: AttendanceStatus;
    readonly openPaymentRequiredAtStart: boolean;
}): boolean;
export declare function evaluateBookingOutcomeCalculator(input: {
    readonly now: CanonicalTimestamp;
    readonly booking: Booking;
    readonly attendancesByParticipantId: ReadonlyMap<ParticipantId, Attendance>;
    readonly openAdminIssues: readonly AdminIssue[];
    readonly automationOnly: boolean;
    readonly justRecordedPresentWithPaymentConflict?: boolean;
}): BookingOutcomeCalculatorDecision;
export declare function instructorMayCorrectAttendance(input: {
    readonly existing: Attendance;
    readonly instructorId: InstructorId;
}): boolean;
