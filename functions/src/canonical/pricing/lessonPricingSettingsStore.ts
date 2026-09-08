import {
  LESSON_PRICING_SETTINGS_ID,
  LessonPricingSettingsSchema,
  type LessonPricingSettings,
} from '@ski-academy/shared-domain';

export const LESSON_PRICING_SETTINGS_DOCUMENT_PATH =
  `lesson_pricing_settings/${LESSON_PRICING_SETTINGS_ID}` as const;

const LEGACY_ADDITIONAL_PARTICIPANT_SURCHARGE_FIELD = 'additionalParticipantSurchargeKzt';

export function parseLessonPricingSettings(
  data: Record<string, unknown> | undefined
): LessonPricingSettings | undefined {
  if (!data) {
    return undefined;
  }
  const normalized: Record<string, unknown> = { ...data };
  if (
    normalized.additionalParticipantSurchargePerHourKzt === undefined &&
    normalized[LEGACY_ADDITIONAL_PARTICIPANT_SURCHARGE_FIELD] !== undefined
  ) {
    normalized.additionalParticipantSurchargePerHourKzt =
      normalized[LEGACY_ADDITIONAL_PARTICIPANT_SURCHARGE_FIELD];
  }
  delete normalized[LEGACY_ADDITIONAL_PARTICIPANT_SURCHARGE_FIELD];
  const parsed = LessonPricingSettingsSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}
