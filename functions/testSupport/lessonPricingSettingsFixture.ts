import type { Firestore } from 'firebase-admin/firestore';

type TimestampLike = Readonly<{
  seconds: number;
  nanoseconds: number;
}>;

export async function seedLessonPricingSettingsFixture(
  firestore: Firestore,
  input: Readonly<{
    decidedAt: TimestampLike;
    correlationId: string;
    maxParticipantsPerLesson?: number;
  }>
): Promise<void> {
  await firestore.doc('lesson_pricing_settings/lesson_booking').set({
    settingsId: 'lesson_booking',
    additionalParticipantSurchargePerHourKzt: 6_000,
    maxParticipantsPerLesson: input.maxParticipantsPerLesson ?? 4,
    revision: 1,
    createdAt: input.decidedAt,
    updatedAt: input.decidedAt,
    audit: {
      createdByCommandId: 'command_seed_lesson_pricing_settings',
      lastChangedByCommandId: 'command_seed_lesson_pricing_settings',
      correlationId: input.correlationId,
    },
  });
}
