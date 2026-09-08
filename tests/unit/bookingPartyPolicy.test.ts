import { describe, expect, it } from 'vitest';
import {
  BOOKING_PARTY_MIN,
  calculateLessonPartyPriceKzt,
  computePartyAfterMutation,
  evaluateClientPartyChangeTiming,
  partitionAddedParticipantsByMarginalDelta,
  validatePartyParticipantIds,
  resolveAuthoritativePartyPrices,
  timestampFromDate,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain';

describe('lessonPartyPricing', () => {
  it.each([
    [1, 30, 12_000],
    [1, 60, 12_000],
    [1, 90, 12_000],
    [1, 120, 12_000],
    [2, 30, 14_500],
    [2, 60, 17_000],
    [2, 90, 19_500],
    [2, 120, 22_000],
    [3, 30, 17_000],
    [3, 60, 22_000],
    [3, 90, 27_000],
    [3, 120, 32_000],
  ] as const)(
    'prices %i participants for %i minutes from a per-hour surcharge',
    (participantCount, lessonDurationMinutes, total) => {
      expect(
        calculateLessonPartyPriceKzt({
          baseLessonPriceKzt: KztMinorUnitsSchema.parse(12_000),
          additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema.parse(5_000),
          participantCount,
          lessonDurationMinutes,
        })
      ).toBe(total);
    }
  );

  it('rejects invalid party sizes', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    const extra = KztMinorUnitsSchema.parse(6_000);
    expect(() =>
      calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: individual,
        additionalParticipantSurchargePerHourKzt: extra,
        participantCount: 0,
        lessonDurationMinutes: 60,
      })
    ).toThrow();
    expect(
      calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: individual,
        additionalParticipantSurchargePerHourKzt: extra,
        participantCount: 9,
        lessonDurationMinutes: 60,
      })
    ).toBe(60_000);
    expect(() =>
      calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: individual,
        additionalParticipantSurchargePerHourKzt: extra,
        participantCount: 1.5,
        lessonDurationMinutes: 60,
      })
    ).toThrow();
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
      validatePartyParticipantIds(
        Array.from({ length: 9 }, (_, index) =>
          ParticipantIdSchema.parse(`participant_party_${index + 1}`)
        )
      )
    ).not.toThrow();
    expect(() => validatePartyParticipantIds([one[0]!, one[0]!])).toThrow();
    expect(() => validatePartyParticipantIds([])).toThrow();
    expect(BOOKING_PARTY_MIN).toBe(1);
  });

  it('computes marginal addition deltas for batch adds', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    const additions = partitionAddedParticipantsByMarginalDelta({
      individualLessonPriceKzt: individual,
      additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema.parse(6_000),
      lessonDurationMinutes: 60,
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

  it('allocates batch-add marginal deltas that sum to the canonical party price delta', () => {
    const individual = KztMinorUnitsSchema.parse(12_000);
    const current = [ParticipantIdSchema.parse('participant_party_01')];
    const toAdd = [
      ParticipantIdSchema.parse('participant_party_02'),
      ParticipantIdSchema.parse('participant_party_03'),
    ];
    const additions = partitionAddedParticipantsByMarginalDelta({
      individualLessonPriceKzt: individual,
      additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema.parse(6_000),
      lessonDurationMinutes: 60,
      currentParticipantIds: current,
      participantIdsToAdd: toAdd,
    });
    const prices = resolveAuthoritativePartyPrices({
      individualLessonPriceKzt: individual,
      additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema.parse(6_000),
      lessonDurationMinutes: 60,
      currentParticipantIds: current,
      nextParticipantIds: [...current, ...toAdd],
    });
    const requirementSum = additions.reduce((sum, entry) => sum + entry.requiredPriceDelta, 0);
    expect(requirementSum).toBe(prices.signedPriceDelta);
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
});
