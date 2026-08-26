import { type PaymentAccountingProjection } from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import { type CanonicalTimestamp, type KztMinorUnits } from './primitives';
import type { Payment } from './paymentWallet';
import type { AdminIssueDedupeIdentityInput, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import type { CourseEnrollmentId } from './identifiers';
import type { ImmutableBookingAttribution } from './bookingOccurrenceProposalChange';
export declare const COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS: number;
export declare const COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS: number;
export type ClientCourseCancellationTimingDecision = {
    readonly kind: 'direct_cancel';
    readonly refundPercentBasisPoints: number;
} | {
    readonly kind: 'pending_request';
};
export type CourseEnrollmentCancellationResolutionDecision = 'approve' | 'reject' | 'direct_cancel';
export declare function isCourseCapacityFrozen(input: {
    readonly now: CanonicalTimestamp;
    readonly courseStartAt: CanonicalTimestamp;
}): boolean;
export declare function shouldReleasePreStartSeatOnTerminalization(input: {
    readonly now: CanonicalTimestamp;
    readonly courseStartAt: CanonicalTimestamp;
}): boolean;
export declare function evaluateClientCourseCancellationTiming(input: {
    readonly requestAt: CanonicalTimestamp;
    readonly startAt: CanonicalTimestamp;
}): ClientCourseCancellationTimingDecision;
export declare function calculatePolicyRefundAmount(input: {
    readonly payment: PaymentAccountingFields;
    readonly refundPercentBasisPoints: number;
}): KztMinorUnits;
export declare function assertApprovedCourseRefundAmount(payment: PaymentAccountingFields, refundAmount: KztMinorUnits): KztMinorUnits;
export interface CourseCancellationFinancialProjection {
    readonly payment: PaymentAccountingProjection;
    readonly refundDelta: KztMinorUnits;
    readonly writeOffDelta: KztMinorUnits;
}
export declare function projectCourseCancellationFinancialEffects(payment: PaymentAccountingFields, refundAmount: KztMinorUnits): CourseCancellationFinancialProjection;
export declare function accountOwnerCourseCancellationReasonCode(): 'account_owner_cancelled';
export declare function administratorCourseCancellationReasonCode(): 'administrator_cancelled';
export declare function guestCourseCancellationReasonCode(): 'guest_cancelled';
export declare function reservationExpiredCourseCancellationReasonCode(): 'reservation_expired';
export declare function unresolvedCourseEnrollmentPendingCancellationIdentity(input: {
    readonly enrollmentId: CourseEnrollmentId;
}): AdminIssueDedupeIdentityInput;
export declare function resolveCourseEnrollmentRefundDestination(payment: Pick<Payment, 'payerAccountId'>): 'wallet' | 'manual_external';
export declare function resolveAdminCancellationApprovalTerminalStatus(input: {
    readonly refundAmount: KztMinorUnits;
    readonly bookingOrigin: ImmutableBookingAttribution['bookingOrigin'];
}): 'cancelled' | 'withdrawn';
export declare function isActiveCourseEnrollmentLifecycle(enrollment: Pick<CourseEnrollment, 'lifecycle'>): boolean;
export declare function isConfirmedOrPendingCourseEnrollment(enrollment: Pick<CourseEnrollment, 'lifecycle'>): boolean;
export declare function isPendingCancellationCourseEnrollment(enrollment: Pick<CourseEnrollment, 'lifecycle'>): boolean;
export declare function isTerminalCourseEnrollmentLifecycle(enrollment: Pick<CourseEnrollment, 'lifecycle'>): boolean;
