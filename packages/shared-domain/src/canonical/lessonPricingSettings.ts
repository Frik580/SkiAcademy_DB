import { z } from 'zod';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import { LessonPricingSettingsIdSchema, type LessonPricingSettingsId } from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  type KztMinorUnits,
  type TimeInterval,
} from './primitives';

export const LESSON_PRICING_SETTINGS_ID: LessonPricingSettingsId =
  LessonPricingSettingsIdSchema.parse('lesson_booking');

const PersistedRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const LessonDurationMinutesSchema = z
  .number()
  .finite()
  .int()
  .positive()
  .max(24 * 60);

export const MaxParticipantsPerLessonSchema = z
  .number()
  .finite()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

export const LessonPricingSettingsSchema = z
  .object({
    settingsId: LessonPricingSettingsIdSchema,
    additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema,
    maxParticipantsPerLesson: MaxParticipantsPerLessonSchema,
    revision: PersistedRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict();

export type LessonPricingSettings = Readonly<z.output<typeof LessonPricingSettingsSchema>>;

export function lessonDurationMinutesFromInterval(interval: TimeInterval): number {
  const startMs =
    interval.startsAt.seconds * 1_000 + interval.startsAt.nanoseconds / 1_000_000;
  const endMs = interval.endsAt.seconds * 1_000 + interval.endsAt.nanoseconds / 1_000_000;
  return Math.max(1, Math.round((endMs - startMs) / 60_000));
}

export function calculateLessonPartyPriceKzt(input: {
  readonly baseLessonPriceKzt: KztMinorUnits;
  readonly additionalParticipantSurchargePerHourKzt: KztMinorUnits;
  readonly participantCount: number;
  readonly lessonDurationMinutes: number;
}): KztMinorUnits {
  if (
    !Number.isInteger(input.participantCount) ||
    input.participantCount < 1 ||
    !Number.isSafeInteger(input.participantCount)
  ) {
    throw new RangeError(`participantCount must be a positive safe integer`);
  }
  const durationMinutes = LessonDurationMinutesSchema.parse(input.lessonDurationMinutes);
  const additionalParticipantCount = input.participantCount - 1;
  return KztMinorUnitsSchema.parse(
    input.baseLessonPriceKzt +
      Math.round(
        (input.additionalParticipantSurchargePerHourKzt *
          additionalParticipantCount *
          durationMinutes) /
          60
      )
  );
}
