import type { Firestore } from 'firebase-admin/firestore';
import {
  LessonPricingSettingsReadModelSchema,
  type QueryLessonPricingSettingsReadModelResult,
} from '@ski-academy/shared-domain';
import {
  LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
  parseLessonPricingSettings,
} from '../pricing/lessonPricingSettingsStore';

export async function queryLessonPricingSettingsReadModel(
  firestore: Firestore
): Promise<QueryLessonPricingSettingsReadModelResult> {
  const snapshot = await firestore.doc(LESSON_PRICING_SETTINGS_DOCUMENT_PATH).get();
  const settings = parseLessonPricingSettings(
    snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
  );
  const item = settings
    ? LessonPricingSettingsReadModelSchema.parse({
        configured: true,
        additionalParticipantSurchargePerHourKzt: settings.additionalParticipantSurchargePerHourKzt,
        maxParticipantsPerLesson: settings.maxParticipantsPerLesson,
        revision: settings.revision,
      })
    : LessonPricingSettingsReadModelSchema.parse({ configured: false });
  return { scope: 'lesson_pricing_settings', item };
}
