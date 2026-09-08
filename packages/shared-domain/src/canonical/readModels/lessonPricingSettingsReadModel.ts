import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { MaxParticipantsPerLessonSchema } from '../lessonPricingSettings';
import { AggregateRevisionSchema, KztMinorUnitsSchema } from '../primitives';

export const QueryLessonPricingSettingsReadModelInputSchema = z
  .object({
    scope: z.literal('lesson_pricing_settings'),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryLessonPricingSettingsReadModelInput = z.output<
  typeof QueryLessonPricingSettingsReadModelInputSchema
>;

export const LessonPricingSettingsReadModelSchema = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false) }).strict(),
  z
    .object({
      configured: z.literal(true),
      additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema,
      maxParticipantsPerLesson: MaxParticipantsPerLessonSchema,
      revision: AggregateRevisionSchema.refine((revision) => revision >= 1),
    })
    .strict(),
]);

export type LessonPricingSettingsReadModel = z.output<typeof LessonPricingSettingsReadModelSchema>;

export const QueryLessonPricingSettingsReadModelResultSchema = z
  .object({
    scope: z.literal('lesson_pricing_settings'),
    item: LessonPricingSettingsReadModelSchema,
  })
  .strict();

export type QueryLessonPricingSettingsReadModelResult = z.output<
  typeof QueryLessonPricingSettingsReadModelResultSchema
>;
