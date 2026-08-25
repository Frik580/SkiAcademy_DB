import { type PaymentAccountingProjection } from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import { type CanonicalTimestamp } from './primitives';
import { type KztMinorUnits } from './primitives';
import type { Booking, BookingCancellationReasonCode } from './bookingOccurrenceProposalChange';
import type { Payment } from './paymentWallet';
import type { AdminIssueDedupeIdentityInput, Attendance } from './courseEnrollmentAttendanceAdminIssue';
import type { BookingId, OccurrenceId, ParticipantId } from './identifiers';
export declare const INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS: number;
export type ClientCancellationTimingDecision = 'direct_cancel' | 'pending_request' | 'after_start_rejected';
export type BookingCancellationResolutionDecision = 'approve' | 'reject' | 'direct_cancel';
export type LateRejectionOutcomeDecision = {
    readonly outcome: 'confirmed';
} | {
    readonly outcome: 'completed';
} | {
    readonly outcome: 'no_show';
} | {
    readonly outcome: 'missing_attendance';
};
export declare function canonicalTimestampToEpochMs(timestamp: CanonicalTimestamp): number;
export declare function evaluateClientCancellationTiming(input: {
    readonly requestAt: CanonicalTimestamp;
    readonly startAt: CanonicalTimestamp;
}): ClientCancellationTimingDecision;
export declare function refundableRetainedAmount(payment: PaymentAccountingFields): KztMinorUnits;
export declare function calculateFullPaidRefundAmount(payment: PaymentAccountingFields): KztMinorUnits;
export declare function assertApprovedRefundAmount(payment: PaymentAccountingFields, refundAmount: KztMinorUnits): KztMinorUnits;
export interface CancellationFinancialProjection {
    readonly payment: PaymentAccountingProjection;
    readonly refundDelta: KztMinorUnits;
    readonly writeOffDelta: KztMinorUnits;
}
export declare function projectCancellationFinancialEffects(payment: PaymentAccountingFields, refundAmount: KztMinorUnits): CancellationFinancialProjection;
export declare function accountOwnerCancellationReasonCode(): BookingCancellationReasonCode;
export declare function administratorCancellationReasonCode(): BookingCancellationReasonCode;
export declare function unresolvedPendingCancellationIdentity(input: {
    readonly bookingId: BookingId;
    readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput;
export declare function missingBookingAttendanceIdentity(input: {
    readonly bookingId: BookingId;
    readonly occurrenceId: OccurrenceId;
    readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput;
export declare function resolveLateRejectionOutcome(input: {
    readonly now: CanonicalTimestamp;
    readonly booking: Booking;
    readonly attendance: Attendance | undefined;
}): LateRejectionOutcomeDecision;
export declare function isConfirmedIndividualBooking(booking: Booking): boolean;
export declare function isPendingCancellationIndividualBooking(booking: Booking): boolean;
export declare function isTerminalBookingLifecycle(booking: Booking): boolean;
export declare function isGuestConfirmedBooking(booking: Booking): boolean;
export declare function resolveRefundDestination(input: {
    readonly booking: Booking;
    readonly payment: Payment;
}): 'wallet' | 'manual_external';
