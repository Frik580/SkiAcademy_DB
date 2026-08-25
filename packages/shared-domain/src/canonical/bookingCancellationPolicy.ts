import {
  applyRefundDelta,
  applyWriteOffAmount,
  type PaymentAccountingProjection,
} from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';
import { KztMinorUnitsSchema, type KztMinorUnits } from './primitives';
import type { Booking, BookingCancellationReasonCode } from './bookingOccurrenceProposalChange';
import type { Payment } from './paymentWallet';
import type {
  AdminIssueDedupeIdentityInput,
  Attendance,
} from './courseEnrollmentAttendanceAdminIssue';
import { ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION } from './courseEnrollmentAttendanceAdminIssue';
import type { BookingId, OccurrenceId, ParticipantId } from './identifiers';

export const INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ClientCancellationTimingDecision =
  | 'direct_cancel'
  | 'pending_request'
  | 'after_start_rejected';

export type BookingCancellationResolutionDecision = 'approve' | 'reject' | 'direct_cancel';

export type LateRejectionOutcomeDecision =
  | { readonly outcome: 'confirmed' }
  | { readonly outcome: 'completed' }
  | { readonly outcome: 'no_show' }
  | { readonly outcome: 'missing_attendance' };

export function canonicalTimestampToEpochMs(timestamp: CanonicalTimestamp): number {
  return timestamp.seconds * 1_000 + Math.floor(timestamp.nanoseconds / 1_000_000);
}

export function evaluateClientCancellationTiming(input: {
  readonly requestAt: CanonicalTimestamp;
  readonly startAt: CanonicalTimestamp;
}): ClientCancellationTimingDecision {
  if (compareCanonicalTimestamps(input.requestAt, input.startAt) >= 0) {
    return 'after_start_rejected';
  }
  const timeUntilStartMs =
    canonicalTimestampToEpochMs(input.startAt) - canonicalTimestampToEpochMs(input.requestAt);
  return timeUntilStartMs >= INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    ? 'direct_cancel'
    : 'pending_request';
}

export function refundableRetainedAmount(payment: PaymentAccountingFields): KztMinorUnits {
  return KztMinorUnitsSchema.parse(payment.paidAmount - payment.refundedAmount);
}

export function calculateFullPaidRefundAmount(payment: PaymentAccountingFields): KztMinorUnits {
  return refundableRetainedAmount(payment);
}

export function assertApprovedRefundAmount(
  payment: PaymentAccountingFields,
  refundAmount: KztMinorUnits
): KztMinorUnits {
  const maxRefundable = refundableRetainedAmount(payment);
  if (refundAmount < 0 || refundAmount > maxRefundable) {
    throw new Error('Refund exceeds refundable retained funds');
  }
  return refundAmount;
}

export interface CancellationFinancialProjection {
  readonly payment: PaymentAccountingProjection;
  readonly refundDelta: KztMinorUnits;
  readonly writeOffDelta: KztMinorUnits;
}

export function projectCancellationFinancialEffects(
  payment: PaymentAccountingFields,
  refundAmount: KztMinorUnits
): CancellationFinancialProjection {
  const approvedRefund = assertApprovedRefundAmount(payment, refundAmount);
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

export function accountOwnerCancellationReasonCode(): BookingCancellationReasonCode {
  return 'account_owner_cancelled';
}

export function administratorCancellationReasonCode(): BookingCancellationReasonCode {
  return 'administrator_cancelled';
}

export function unresolvedPendingCancellationIdentity(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'unresolved_pending_cancellation',
    subjectKind: 'booking',
    subjectId: input.bookingId,
    occurrenceId: input.occurrenceId,
  };
}

export function missingBookingAttendanceIdentity(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
  readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'missing_attendance',
    subjectKind: 'booking',
    subjectId: input.bookingId,
    occurrenceId: input.occurrenceId,
    participantId: input.participantId,
  };
}

export function resolveLateRejectionOutcome(input: {
  readonly now: CanonicalTimestamp;
  readonly booking: Booking;
  readonly attendance: Attendance | undefined;
}): LateRejectionOutcomeDecision {
  if (compareCanonicalTimestamps(input.now, input.booking.occurrence.interval.endsAt) < 0) {
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

export function isConfirmedIndividualBooking(booking: Booking): boolean {
  return booking.party.kind === 'individual' && booking.lifecycle.status === 'confirmed';
}

export function isPendingCancellationIndividualBooking(booking: Booking): boolean {
  return booking.party.kind === 'individual' && booking.lifecycle.status === 'pending_cancellation';
}

export function isTerminalBookingLifecycle(booking: Booking): boolean {
  const status = booking.lifecycle.status;
  return status === 'cancelled' || status === 'completed' || status === 'no_show';
}

export function isGuestConfirmedBooking(booking: Booking): boolean {
  return booking.attribution.bookingOrigin === 'guest' && booking.lifecycle.status === 'confirmed';
}

export function resolveRefundDestination(input: {
  readonly booking: Booking;
  readonly payment: Payment;
}): 'wallet' | 'manual_external' {
  const accountId = input.booking.payerAccountId ?? input.payment.payerAccountId;
  return accountId === undefined ? 'manual_external' : 'wallet';
}
