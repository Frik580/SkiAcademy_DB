import { describe, expect, it } from 'vitest';
import {
  BOOKING_PARTY_MAX,
  BOOKING_PARTY_MIN,
  calculateFamilyGroupBookingPriceKzt,
  computePartyAfterMutation,
  evaluateClientPartyChangeTiming,
  familyGroupMultiplierBasisPoints,
  FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP,
  partitionAddedParticipantsByMarginalDelta,
  validatePartyParticipantIds,
  timestampFromDate,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain';

describe('familyGroupTariff', () => {
  it('uses dedicated nonlinear participant-count multipliers', () => {
    expect(FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP).toHaveLength(8);
    expect(familyGroupMultiplierBasisPoints(1)).toBe(10_000);
    expect(familyGroupMultiplierBasisPoints(8)).toBe(32_000);
  });

  it('calculates party prices from individual lesson price', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    expect(calculateFamilyGroupBookingPriceKzt(individual, 1)).toBe(12_000);
    expect(calculateFamilyGroupBookingPriceKzt(individual, 2)).toBe(18_000);
    expect(calculateFamilyGroupBookingPriceKzt(individual, 3)).toBe(24_000);
  });

  it('rejects invalid party sizes', () => {
    expect(() => familyGroupMultiplierBasisPoints(0)).toThrow();
    expect(() => familyGroupMultiplierBasisPoints(9)).toThrow();
  });
});

describe('bookingPartyPolicy', () => {
  const startAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));

  it('allows self-service party changes at the exact 24h boundary', () => {
    const requestAt = timestampFromDate(new Date('2026-01-14T09:00:00.000Z'));
    expect(evaluateClientPartyChangeTiming({ requestAt, startAt })).toBe('allowed');
  });

  it('rejects self-service party changes inside 24h', () => {
    const requestAt = timestampFromDate(new Date('2026-01-14T09:00:00.001Z'));
    expect(evaluateClientPartyChangeTiming({ requestAt, startAt })).toBe('inside_window_rejected');
  });

  it('validates party shape and uniqueness', () => {
    const one = [ParticipantIdSchema.parse('participant_party_01')];
    validatePartyParticipantIds(one);
    expect(() =>
      validatePartyParticipantIds([
        ...one,
        ...Array.from({ length: BOOKING_PARTY_MAX }, (_, index) =>
          ParticipantIdSchema.parse(`participant_party_${index + 2}`)
        ),
      ])
    ).toThrow();
    expect(() =>
      validatePartyParticipantIds([one[0]!, one[0]!])
    ).toThrow();
    expect(() => validatePartyParticipantIds([])).toThrow();
    expect(BOOKING_PARTY_MIN).toBe(1);
    expect(BOOKING_PARTY_MAX).toBe(8);
  });

  it('computes marginal addition deltas for batch adds', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    const additions = partitionAddedParticipantsByMarginalDelta({
      individualLessonPriceKzt: individual,
      currentParticipantIds: [ParticipantIdSchema.parse('participant_party_01')],
      participantIdsToAdd: [
        ParticipantIdSchema.parse('participant_party_02'),
        ParticipantIdSchema.parse('participant_party_03'),
      ],
    });
    expect(additions).toEqual([
      {
        participantId: ParticipantIdSchema.parse('participant_party_02'),
        requiredPriceDelta: KztMinorUnitsSchema.parse(6_000),
      },
      {
        participantId: ParticipantIdSchema.parse('participant_party_03'),
        requiredPriceDelta: KztMinorUnitsSchema.parse(6_000),
      },
    ]);
  });

  it('computes party after add/remove mutation', () => {
    const current = [
      ParticipantIdSchema.parse('participant_party_01'),
      ParticipantIdSchema.parse('participant_party_02'),
    ];
    expect(
      computePartyAfterMutation({
        currentParticipantIds: current,
        participantIdsToRemove: [ParticipantIdSchema.parse('participant_party_02')],
      })
    ).toEqual([ParticipantIdSchema.parse('participant_party_01')]);
  });
});
