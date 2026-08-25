import {
  calculateIndividualBookingPriceKzt,
  resolveInstructorHourlyRateKzt,
  type InstructorTariffInput,
  type ResolvedBookingSchedule,
} from './bookingCreation';
import { BOOKING_PARTY_MAX, BOOKING_PARTY_MIN } from './bookingOccurrenceProposalChange';
import { KztMinorUnitsSchema, type KztMinorUnits } from './primitives';

/**
 * Approved dedicated participant-count tariff expressed as basis-point multipliers of the
 * canonical individual lesson price for the same instructor and duration.
 */
export const FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP = [
  10_000,
  15_000,
  20_000,
  24_000,
  27_000,
  29_000,
  31_000,
  32_000,
] as const;

export function familyGroupMultiplierBasisPoints(participantCount: number): number {
  if (
    !Number.isInteger(participantCount) ||
    participantCount < BOOKING_PARTY_MIN ||
    participantCount > BOOKING_PARTY_MAX
  ) {
    throw new Error('Invalid family/group party size');
  }
  return FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP[participantCount - 1]!;
}

export function calculateFamilyGroupBookingPriceKzt(
  individualLessonPriceKzt: KztMinorUnits,
  participantCount: number
): KztMinorUnits {
  if (individualLessonPriceKzt <= 0) {
    throw new Error('Individual lesson price must be positive');
  }
  const multiplierBp = familyGroupMultiplierBasisPoints(participantCount);
  return KztMinorUnitsSchema.parse(
    Math.round((individualLessonPriceKzt * multiplierBp) / 10_000)
  );
}

export function resolveFamilyGroupBookingPriceKzt(input: {
  readonly tariff: InstructorTariffInput;
  readonly schedule: Pick<ResolvedBookingSchedule, 'durationMinutes'>;
  readonly participantCount: number;
}): KztMinorUnits {
  const hourlyRate = resolveInstructorHourlyRateKzt(input.tariff);
  const individualPrice = calculateIndividualBookingPriceKzt(
    hourlyRate,
    input.schedule.durationMinutes
  );
  return calculateFamilyGroupBookingPriceKzt(individualPrice, input.participantCount);
}

export function resolveMarginalPartyAdditionPriceDeltaKzt(input: {
  readonly individualLessonPriceKzt: KztMinorUnits;
  readonly currentParticipantCount: number;
  readonly addedParticipantCount: number;
}): KztMinorUnits {
  if (input.addedParticipantCount <= 0) {
    throw new Error('Added participant count must be positive');
  }
  const currentPrice = calculateFamilyGroupBookingPriceKzt(
    input.individualLessonPriceKzt,
    input.currentParticipantCount
  );
  const nextPrice = calculateFamilyGroupBookingPriceKzt(
    input.individualLessonPriceKzt,
    input.currentParticipantCount + input.addedParticipantCount
  );
  return KztMinorUnitsSchema.parse(nextPrice - currentPrice);
}
