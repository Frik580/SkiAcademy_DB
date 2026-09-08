import {
  BOOKING_PARTY_MIN,
  type Booking,
  type BookingPartyKind,
} from './bookingOccurrenceProposalChange';
import {
  canonicalTimestampToEpochMs,
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  isTerminalBookingLifecycle,
} from './bookingCancellationPolicy';
import type { IncrementalRequirement, PaymentAccountingFields } from './paymentWallet';
import { deriveRetainedAmount } from './paymentWallet';
import {
  KztMinorUnitsSchema,
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
  type KztMinorUnits,
} from './primitives';
import type { ParticipantId } from './identifiers';
import { calculateLessonPartyPriceKzt } from './lessonPricingSettings';

export const BOOKING_PARTY_CHANGE_WINDOW_MS = INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS;

export type ClientPartyChangeTimingDecision =
  'allowed' | 'inside_window_rejected' | 'after_start_rejected';

export function evaluateClientPartyChangeTiming(input: {
  readonly requestAt: CanonicalTimestamp;
  readonly startAt: CanonicalTimestamp;
}): ClientPartyChangeTimingDecision {
  if (compareCanonicalTimestamps(input.requestAt, input.startAt) >= 0) {
    return 'after_start_rejected';
  }
  const timeUntilStartMs =
    canonicalTimestampToEpochMs(input.startAt) - canonicalTimestampToEpochMs(input.requestAt);
  return timeUntilStartMs >= BOOKING_PARTY_CHANGE_WINDOW_MS ? 'allowed' : 'inside_window_rejected';
}

export function isPartyChangeEligibleBooking(booking: Booking): boolean {
  if (isTerminalBookingLifecycle(booking)) {
    return false;
  }
  if (booking.lifecycle.status === 'pending') {
    return false;
  }
  if (booking.lifecycle.status === 'pending_cancellation') {
    return false;
  }
  return booking.lifecycle.status === 'confirmed';
}

export function duplicateParticipantIndexes(participantIds: readonly ParticipantId[]): number[] {
  const seen = new Map<ParticipantId, number>();
  const duplicates: number[] = [];
  participantIds.forEach((participantId, index) => {
    if (seen.has(participantId)) {
      duplicates.push(index);
    } else {
      seen.set(participantId, index);
    }
  });
  return duplicates;
}

export function validatePartyParticipantIds(participantIds: readonly ParticipantId[]): void {
  if (participantIds.length < BOOKING_PARTY_MIN) {
    throw new Error('Booking party must contain at least one Participant');
  }
  if (duplicateParticipantIndexes(participantIds).length > 0) {
    throw new Error('Booking party participant IDs must be unique');
  }
}

export function computePartyAfterMutation(input: {
  readonly currentParticipantIds: readonly ParticipantId[];
  readonly participantIdsToAdd?: readonly ParticipantId[];
  readonly participantIdsToRemove?: readonly ParticipantId[];
}): ParticipantId[] {
  const toRemove = new Set(input.participantIdsToRemove ?? []);
  const next = input.currentParticipantIds.filter((participantId) => !toRemove.has(participantId));
  for (const participantId of input.participantIdsToAdd ?? []) {
    if (!next.includes(participantId)) {
      next.push(participantId);
    }
  }
  return next;
}

export function derivePartyKindFromCount(participantCount: number): BookingPartyKind {
  return participantCount === 1 ? 'individual' : 'family_group';
}

export function resolveAuthoritativePartyPrices(input: {
  readonly individualLessonPriceKzt: KztMinorUnits;
  readonly additionalParticipantSurchargePerHourKzt: KztMinorUnits;
  readonly lessonDurationMinutes: number;
  readonly currentParticipantIds: readonly ParticipantId[];
  readonly nextParticipantIds: readonly ParticipantId[];
}): {
  readonly currentPrice: KztMinorUnits;
  readonly nextPrice: KztMinorUnits;
  readonly signedPriceDelta: number;
} {
  const currentPrice = calculateLessonPartyPriceKzt({
    baseLessonPriceKzt: input.individualLessonPriceKzt,
    additionalParticipantSurchargePerHourKzt: input.additionalParticipantSurchargePerHourKzt,
    participantCount: input.currentParticipantIds.length,
    lessonDurationMinutes: input.lessonDurationMinutes,
  });
  const nextPrice = calculateLessonPartyPriceKzt({
    baseLessonPriceKzt: input.individualLessonPriceKzt,
    additionalParticipantSurchargePerHourKzt: input.additionalParticipantSurchargePerHourKzt,
    participantCount: input.nextParticipantIds.length,
    lessonDurationMinutes: input.lessonDurationMinutes,
  });
  return {
    currentPrice,
    nextPrice,
    signedPriceDelta: nextPrice - currentPrice,
  };
}

export function calculateSelfServiceRemoveRefundBasisKzt(input: {
  readonly individualLessonPriceKzt: KztMinorUnits;
  readonly additionalParticipantSurchargePerHourKzt: KztMinorUnits;
  readonly lessonDurationMinutes: number;
  readonly currentParticipantIds: readonly ParticipantId[];
  readonly nextParticipantIds: readonly ParticipantId[];
}): KztMinorUnits {
  const prices = resolveAuthoritativePartyPrices(input);
  if (prices.signedPriceDelta >= 0) {
    throw new Error('Self-service remove requires a lower authoritative party price');
  }
  return KztMinorUnitsSchema.parse(-prices.signedPriceDelta);
}

export function calculateAdminLateRemoveRefundAmountKzt(input: {
  readonly tariffDifferenceKzt: KztMinorUnits;
  readonly refundPercentBasisPoints: number;
  readonly maxRefundableKzt: KztMinorUnits;
}): KztMinorUnits {
  if (input.tariffDifferenceKzt <= 0) {
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
    (input.tariffDifferenceKzt * input.refundPercentBasisPoints + 5_000) / 10_000
  );
  const capped = Math.min(rawRefund, input.tariffDifferenceKzt, input.maxRefundableKzt);
  return KztMinorUnitsSchema.parse(Math.max(0, capped));
}

export function isIncrementalRequirementFullyFunded(
  requirement: Pick<
    IncrementalRequirement,
    'requiredPriceDelta' | 'allocatedSettledAmount' | 'allocatedRetainedAmount' | 'state'
  >
): boolean {
  if (requirement.state === 'rolled_back') {
    return false;
  }
  return (
    requirement.allocatedSettledAmount === requirement.requiredPriceDelta &&
    requirement.allocatedRetainedAmount === requirement.requiredPriceDelta
  );
}

export function listUnpaidActiveIncrementalRequirements(
  requirements: readonly IncrementalRequirement[]
): IncrementalRequirement[] {
  return requirements.filter(
    (requirement) =>
      requirement.state === 'active' && !isIncrementalRequirementFullyFunded(requirement)
  );
}

export function maxPartyRemoveRefundKzt(
  payment: PaymentAccountingFields,
  tariffDifferenceKzt: KztMinorUnits
): KztMinorUnits {
  return KztMinorUnitsSchema.parse(
    Math.min(payment.paidAmount - payment.refundedAmount, tariffDifferenceKzt)
  );
}

export function partitionAddedParticipantsByMarginalDelta(input: {
  readonly individualLessonPriceKzt: KztMinorUnits;
  readonly additionalParticipantSurchargePerHourKzt: KztMinorUnits;
  readonly lessonDurationMinutes: number;
  readonly currentParticipantIds: readonly ParticipantId[];
  readonly participantIdsToAdd: readonly ParticipantId[];
}): ReadonlyArray<{
  readonly participantId: ParticipantId;
  readonly requiredPriceDelta: KztMinorUnits;
}> {
  const additions: Array<{ participantId: ParticipantId; requiredPriceDelta: KztMinorUnits }> = [];
  let runningCount = input.currentParticipantIds.length;
  for (const participantId of input.participantIdsToAdd) {
    const requiredPriceDelta = calculateLessonPartyPriceKzt({
      baseLessonPriceKzt: input.individualLessonPriceKzt,
      additionalParticipantSurchargePerHourKzt: input.additionalParticipantSurchargePerHourKzt,
      participantCount: runningCount + 1,
      lessonDurationMinutes: input.lessonDurationMinutes,
    });
    const previousPrice = calculateLessonPartyPriceKzt({
      baseLessonPriceKzt: input.individualLessonPriceKzt,
      additionalParticipantSurchargePerHourKzt: input.additionalParticipantSurchargePerHourKzt,
      participantCount: runningCount,
      lessonDurationMinutes: input.lessonDurationMinutes,
    });
    additions.push({
      participantId,
      requiredPriceDelta: KztMinorUnitsSchema.parse(requiredPriceDelta - previousPrice),
    });
    runningCount += 1;
  }
  return additions;
}

export function retainedAmountAfterRefund(
  payment: PaymentAccountingFields,
  refundDelta: KztMinorUnits
): KztMinorUnits {
  return deriveRetainedAmount(
    payment.paidAmount,
    KztMinorUnitsSchema.parse(payment.refundedAmount + refundDelta)
  );
}
