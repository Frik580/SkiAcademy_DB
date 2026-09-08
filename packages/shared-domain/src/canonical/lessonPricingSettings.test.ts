import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  LessonPricingSettingsSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  accountCommandActor,
  calculateLessonPartyPriceKzt,
  computeCommandFingerprintFromEnvelope,
  timestampFromDate,
  type CommandEnvelope,
} from '..';
import { KztMinorUnitsSchema } from './primitives';

const base = KztMinorUnitsSchema.parse(12_000);
const surchargePerHour = KztMinorUnitsSchema.parse(5_000);

describe('canonical lesson party pricing', () => {
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
    'prices %i participants for %i minutes with a per-hour surcharge',
    (participantCount, lessonDurationMinutes, total) => {
      expect(
        calculateLessonPartyPriceKzt({
          baseLessonPriceKzt: base,
          additionalParticipantSurchargePerHourKzt: surchargePerHour,
          participantCount,
          lessonDurationMinutes,
        })
      ).toBe(total);
    }
  );

  it('validates the canonical KZT settings aggregate and revision', () => {
    const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    expect(
      LessonPricingSettingsSchema.parse({
        settingsId: 'lesson_booking',
        additionalParticipantSurchargePerHourKzt: 6_000,
        maxParticipantsPerLesson: 4,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'command_pricing_create',
          lastChangedByCommandId: 'command_pricing_create',
          correlationId: 'correlation_pricing_create',
        },
      })
    ).toMatchObject({
      additionalParticipantSurchargePerHourKzt: 6_000,
      maxParticipantsPerLesson: 4,
    });
    expect(
      LessonPricingSettingsSchema.safeParse({
        settingsId: 'lesson_booking',
        additionalParticipantSurchargePerHourKzt: -1,
        maxParticipantsPerLesson: 4,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'command_pricing_create',
          lastChangedByCommandId: 'command_pricing_create',
          correlationId: 'correlation_pricing_create',
        },
      }).success
    ).toBe(false);
    for (const invalidMax of [0, -1, 1.5, Number.NaN]) {
      expect(
        LessonPricingSettingsSchema.safeParse({
          settingsId: 'lesson_booking',
          additionalParticipantSurchargePerHourKzt: 6_000,
          maxParticipantsPerLesson: invalidMax,
          revision: 1,
          createdAt: at,
          updatedAt: at,
          audit: {
            createdByCommandId: 'command_pricing_create',
            lastChangedByCommandId: 'command_pricing_create',
            correlationId: 'correlation_pricing_create',
          },
        }).success
      ).toBe(false);
    }
  });

  it('still parses pre-F3 canonical Bookings without a pricing snapshot', () => {
    const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const participantIds = [ParticipantIdSchema.parse('participant_pricing_legacy_01')];
    expect(
      BookingSchema.safeParse({
        bookingId: BookingIdSchema.parse('booking_pricing_legacy_01'),
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: AccountIdSchema.parse('account_pricing_legacy_01') },
        },
        party: { kind: 'individual', participantIds },
        occurrence: {
          occurrenceId: 'occurrence_pricing_legacy_01',
          instructorId: InstructorIdSchema.parse('instructor_pricing_legacy_01'),
          interval: { startsAt: at, endsAt: timestampFromDate(new Date('2026-01-01T01:00:00.000Z')) },
          timeZone: 'UTC',
          scheduleRevision: 1,
          serviceParty: { participantIds, frozenAt: at },
        },
        lifecycle: { status: 'confirmed' },
        paymentId: PaymentIdSchema.parse('payment_pricing_legacy_01'),
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'command_pricing_legacy',
          lastChangedByCommandId: 'command_pricing_legacy',
          correlationId: 'correlation_pricing_legacy',
        },
      }).success
    ).toBe(true);
  });

  it('parses a single-participant F3 pricing snapshot', () => {
    const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const participantIds = [ParticipantIdSchema.parse('participant_pricing_single_01')];
    expect(
      BookingSchema.safeParse({
        bookingId: BookingIdSchema.parse('booking_pricing_single_01'),
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: AccountIdSchema.parse('account_pricing_single_01') },
        },
        party: { kind: 'individual', participantIds },
        occurrence: {
          occurrenceId: 'occurrence_pricing_single_01',
          instructorId: InstructorIdSchema.parse('instructor_pricing_single_01'),
          interval: { startsAt: at, endsAt: timestampFromDate(new Date('2026-01-01T01:00:00.000Z')) },
          timeZone: 'UTC',
          scheduleRevision: 1,
          serviceParty: { participantIds, frozenAt: at },
        },
        lifecycle: { status: 'confirmed' },
        paymentId: PaymentIdSchema.parse('payment_pricing_single_01'),
        pricingSnapshot: {
          strategyVersion: 'lesson_party:v1',
          baseLessonPriceKzt: 12_000,
          additionalParticipantSurchargePerHourKzt: 5_000,
          settingsRevision: 1,
          lessonDurationMinutes: 60,
          participantCount: 1,
          totalPriceKzt: 12_000,
        },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit: {
          createdByCommandId: 'command_pricing_single',
          lastChangedByCommandId: 'command_pricing_single',
          correlationId: 'correlation_pricing_single',
        },
      }).success
    ).toBe(true);
  });

  it('enforces the Booking pricing snapshot formula', () => {
    const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const participantIds = [
      ParticipantIdSchema.parse('participant_pricing_01'),
      ParticipantIdSchema.parse('participant_pricing_02'),
    ];
    const candidate = {
      bookingId: BookingIdSchema.parse('booking_pricing_01'),
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: AccountIdSchema.parse('account_pricing_01') },
      },
      party: { kind: 'family_group', participantIds },
      occurrence: {
        occurrenceId: 'occurrence_pricing_01',
        instructorId: InstructorIdSchema.parse('instructor_pricing_01'),
        interval: { startsAt: at, endsAt: timestampFromDate(new Date('2026-01-01T01:30:00.000Z')) },
        timeZone: 'UTC',
        scheduleRevision: 1,
        serviceParty: { participantIds, frozenAt: at },
      },
      lifecycle: { status: 'confirmed' },
      paymentId: PaymentIdSchema.parse('payment_pricing_01'),
      pricingSnapshot: {
        strategyVersion: 'lesson_party:v1',
        baseLessonPriceKzt: 12_000,
        additionalParticipantSurchargePerHourKzt: 5_000,
        settingsRevision: 1,
        lessonDurationMinutes: 90,
        participantCount: 2,
        totalPriceKzt: 19_500,
      },
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit: {
        createdByCommandId: 'command_pricing_booking',
        lastChangedByCommandId: 'command_pricing_booking',
        correlationId: 'correlation_pricing_booking',
      },
    };
    expect(BookingSchema.safeParse(candidate).success).toBe(true);
    expect(
      BookingSchema.safeParse({
        ...candidate,
        pricingSnapshot: { ...candidate.pricingSnapshot, totalPriceKzt: 17_999 },
      }).success
    ).toBe(false);
    expect(
      BookingSchema.safeParse({
        ...candidate,
        pricingSnapshot: { ...candidate.pricingSnapshot, lessonDurationMinutes: 60 },
      }).success
    ).toBe(false);
  });

  it('treats participant ordering as irrelevant to create command idempotency', () => {
    const participantA = ParticipantIdSchema.parse('participant_fingerprint_a');
    const participantB = ParticipantIdSchema.parse('participant_fingerprint_b');
    const baseEnvelope = {
      kind: 'create_confirmed_booking',
      context: {
        actor: accountCommandActor(AccountIdSchema.parse('account_fingerprint_01')),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'fingerprint-order-01',
        correlationId: CorrelationIdSchema.parse('correlation_fingerprint_01'),
        source: 'client_callable',
        calendarInput: { localDate: '2026-01-10', localTime: '09:00', durationMinutes: 60 },
        timezone: 'UTC',
      },
      intent: {
        bookingId: BookingIdSchema.parse('booking_fingerprint_01'),
        instructorId: InstructorIdSchema.parse('instructor_fingerprint_01'),
        participantIds: [participantA, participantB],
      },
    } as CommandEnvelope<'create_confirmed_booking'>;
    expect(computeCommandFingerprintFromEnvelope(baseEnvelope)).toBe(
      computeCommandFingerprintFromEnvelope({
        ...baseEnvelope,
        intent: { ...baseEnvelope.intent, participantIds: [participantB, participantA] },
      })
    );
  });
});
