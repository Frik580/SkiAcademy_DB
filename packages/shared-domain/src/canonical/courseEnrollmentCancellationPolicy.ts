import {
  applyRefundDelta,
  applyWriteOffAmount,
  type PaymentAccountingProjection,
} from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import {
  canonicalTimestampToEpochMs,
  refundableRetainedAmount,
} from './bookingCancellationPolicy';
import {
  compareCanonicalTimestamps,
  KztMinorUnitsSchema,
  type CanonicalTimestamp,
  type KztMinorUnits,
} from './primitives';
import type { Payment } from './paymentWallet';
import type { AdminIssueDedupeIdentityInput, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import { ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION } from './courseEnrollmentAttendanceAdminIssue';
import type { CourseEnrollmentId } from './identifiers';
import type { ImmutableBookingAttribution } from './bookingOccurrenceProposalChange';

export const COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1_000;
export const COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS = 2 * 24 * 60 * 60 * 1_000;

export type ClientCourseCancellationTimingDecision =
  | { readonly kind: 'direct_cancel'; readonly refundPercentBasisPoints: number }
  | { readonly kind: 'pending_request' };

export type CourseEnrollmentCancellationResolutionDecision =
  | 'approve'
  | 'reject'
  | 'direct_cancel';

export function isCourseCapacityFrozen(input: {
  readonly now: CanonicalTimestamp;
  readonly courseStartAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.courseStartAt) >= 0;
}

export function shouldReleasePreStartSeatOnTerminalization(input: {
  readonly now: CanonicalTimestamp;
  readonly courseStartAt: CanonicalTimestamp;
}): boolean {
  return !isCourseCapacityFrozen(input);
}

export function evaluateClientCourseCancellationTiming(input: {
  readonly requestAt: CanonicalTimestamp;
  readonly startAt: CanonicalTimestamp;
}): ClientCourseCancellationTimingDecision {
  const timeUntilStartMs =
    canonicalTimestampToEpochMs(input.startAt) - canonicalTimestampToEpochMs(input.requestAt);

  if (timeUntilStartMs >= COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS) {
    return { kind: 'direct_cancel', refundPercentBasisPoints: 10_000 };
  }
  if (timeUntilStartMs >= COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS) {
    return { kind: 'direct_cancel', refundPercentBasisPoints: 5_000 };
  }
  return { kind: 'pending_request' };
}

export function calculatePolicyRefundAmount(input: {
  readonly payment: PaymentAccountingFields;
  readonly refundPercentBasisPoints: number;
}): KztMinorUnits {
  const maxRefundable = refundableRetainedAmount(input.payment);
  if (maxRefundable <= 0) {
    return KztMinorUnitsSchema.parse(0);
  }
  if (
    !Number.isInteger(input.refundPercentBasisPoints) ||
    input.refundPercentBasisPoints < 0 ||
    input.refundPercentBasisPoints > 10_000
  ) {
    throw new Error('Refund percent must be between 0 and 10000 basis points');
  }
  const rawRefund = Math.floor(
    (maxRefundable * input.refundPercentBasisPoints + 5_000) / 10_000
  );
  return KztMinorUnitsSchema.parse(Math.min(Math.max(0, rawRefund), maxRefundable));
}

export function assertApprovedCourseRefundAmount(
  payment: PaymentAccountingFields,
  refundAmount: KztMinorUnits
): KztMinorUnits {
  const maxRefundable = refundableRetainedAmount(payment);
  if (refundAmount < 0 || refundAmount > maxRefundable) {
    throw new Error('Refund exceeds refundable retained funds');
  }
  return refundAmount;
}

export interface CourseCancellationFinancialProjection {
  readonly payment: PaymentAccountingProjection;
  readonly refundDelta: KztMinorUnits;
  readonly writeOffDelta: KztMinorUnits;
}

export function projectCourseCancellationFinancialEffects(
  payment: PaymentAccountingFields,
  refundAmount: KztMinorUnits
): CourseCancellationFinancialProjection {
  const approvedRefund = assertApprovedCourseRefundAmount(payment, refundAmount);
  let projection = payment as PaymentAccountingProjection;
  let refundDelta = KztMinorUnitsSchema.parse(0);

  if (approvedRefund > 0) {
    const refunded = applyRefundDelta(payment, approvedRefund);
    projection = refunded;
    refundDelta = approvedRefund;
  }

  const outstandingAfterRefund = projection.outstandingAmount;
  let writeOffDelta = KztMinorUnitsSchema.parse(0);
  if (outstandingAfterRefund > 0) {
    const writtenOff = applyWriteOffAmount(projection, outstandingAfterRefund);
    projection = writtenOff;
    writeOffDelta = outstandingAfterRefund;
  }

  return { payment: projection, refundDelta, writeOffDelta };
}

export function accountOwnerCourseCancellationReasonCode(): 'account_owner_cancelled' {
  return 'account_owner_cancelled';
}

export function administratorCourseCancellationReasonCode(): 'administrator_cancelled' {
  return 'administrator_cancelled';
}

export function guestCourseCancellationReasonCode(): 'guest_cancelled' {
  return 'guest_cancelled';
}

export function reservationExpiredCourseCancellationReasonCode(): 'reservation_expired' {
  return 'reservation_expired';
}

export function unresolvedCourseEnrollmentPendingCancellationIdentity(input: {
  readonly enrollmentId: CourseEnrollmentId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'unresolved_pending_cancellation',
    subjectKind: 'course_enrollment',
    subjectId: input.enrollmentId,
  };
}

export function resolveCourseEnrollmentRefundDestination(
  payment: Pick<Payment, 'payerAccountId'>
): 'wallet' | 'manual_external' {
  return payment.payerAccountId === undefined ? 'manual_external' : 'wallet';
}

export function resolveAdminCancellationApprovalTerminalStatus(input: {
  readonly refundAmount: KztMinorUnits;
  readonly bookingOrigin: ImmutableBookingAttribution['bookingOrigin'];
}): 'cancelled' | 'withdrawn' {
  if (input.refundAmount > 0) {
    return 'cancelled';
  }
  if (input.bookingOrigin === 'guest') {
    return 'cancelled';
  }
  return 'withdrawn';
}

export function isActiveCourseEnrollmentLifecycle(
  enrollment: Pick<CourseEnrollment, 'lifecycle'>
): boolean {
  const status = enrollment.lifecycle.status;
  return status === 'pending' || status === 'confirmed' || status === 'pending_cancellation';
}

export function isConfirmedOrPendingCourseEnrollment(
  enrollment: Pick<CourseEnrollment, 'lifecycle'>
): boolean {
  const status = enrollment.lifecycle.status;
  return status === 'confirmed' || status === 'pending';
}

export function isPendingCancellationCourseEnrollment(
  enrollment: Pick<CourseEnrollment, 'lifecycle'>
): boolean {
  return enrollment.lifecycle.status === 'pending_cancellation';
}

export function isTerminalCourseEnrollmentLifecycle(
  enrollment: Pick<CourseEnrollment, 'lifecycle'>
): boolean {
  const status = enrollment.lifecycle.status;
  return (
    status === 'cancelled' ||
    status === 'withdrawn' ||
    status === 'completed' ||
    status === 'no_show'
  );
}
