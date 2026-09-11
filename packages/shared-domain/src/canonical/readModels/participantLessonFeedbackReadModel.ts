import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantLessonFeedbackIdSchema,
} from '../identifiers';
import {
  EMPTY_PARTICIPANT_LESSON_FEEDBACK_REVISION,
  ParticipantLessonFeedbackItemIdSchema,
  ParticipantLessonFeedbackItemTextSchema,
  ParticipantLessonFeedbackUpdatedBySchema,
} from '../participantLessonFeedback';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_IDS_MAX = 32;
export const PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_LESSON_IDS_MAX = 50;

export const ParticipantLessonFeedbackReadModelItemSchema = z
  .object({
    itemId: ParticipantLessonFeedbackItemIdSchema,
    text: ParticipantLessonFeedbackItemTextSchema,
    completed: z.boolean(),
  })
  .strict();

export type ParticipantLessonFeedbackReadModelItem = Readonly<
  z.output<typeof ParticipantLessonFeedbackReadModelItemSchema>
>;

export const ParticipantLessonFeedbackReadModelSchema = z
  .object({
    feedbackId: ParticipantLessonFeedbackIdSchema,
    participantId: ParticipantIdSchema,
    lessonBookingId: BookingIdSchema,
    instructorId: InstructorIdSchema.optional(),
    items: z.array(ParticipantLessonFeedbackReadModelItemSchema),
    revision: AggregateRevisionSchema,
    lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lessonStartsAt: CanonicalTimestampSchema.optional(),
    updatedAt: CanonicalTimestampSchema.optional(),
    updatedBy: ParticipantLessonFeedbackUpdatedBySchema.optional(),
  })
  .strict()
  .superRefine((model, context) => {
    if (model.revision >= 1 && model.instructorId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'Persisted lesson feedback requires instructorId',
      });
    }
    const seenItemIds = new Set<string>();
    for (const [index, item] of model.items.entries()) {
      if (seenItemIds.has(item.itemId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'itemId'],
          message: 'Duplicate feedback item ids are not allowed',
        });
      }
      seenItemIds.add(item.itemId);
    }
  });

export type ParticipantLessonFeedbackReadModel = Readonly<
  z.output<typeof ParticipantLessonFeedbackReadModelSchema>
>;

export function participantLessonFeedbackReadModelItemsWithCompletion(input: {
  readonly items: ReadonlyArray<{ itemId: string; text: string }>;
  readonly completedItemIds: readonly string[];
}): ParticipantLessonFeedbackReadModelItem[] {
  const completed = new Set(input.completedItemIds);
  return input.items.map((item) => ({
    itemId: ParticipantLessonFeedbackItemIdSchema.parse(item.itemId),
    text: ParticipantLessonFeedbackItemTextSchema.parse(item.text),
    completed: completed.has(item.itemId),
  }));
}

export function emptyParticipantLessonFeedbackReadModel(input: {
  readonly feedbackId: z.output<typeof ParticipantLessonFeedbackIdSchema>;
  readonly participantId: z.output<typeof ParticipantIdSchema>;
  readonly lessonBookingId: z.output<typeof BookingIdSchema>;
}): ParticipantLessonFeedbackReadModel {
  return ParticipantLessonFeedbackReadModelSchema.parse({
    feedbackId: input.feedbackId,
    participantId: input.participantId,
    lessonBookingId: input.lessonBookingId,
    items: [],
    revision: EMPTY_PARTICIPANT_LESSON_FEEDBACK_REVISION,
  });
}

export const QueryParticipantLessonFeedbackReadModelsInputSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('instructor_lesson'),
      participantId: ParticipantIdSchema,
      lessonBookingId: BookingIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('managed_participant'),
      participantIds: z
        .array(ParticipantIdSchema)
        .min(1)
        .max(PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_IDS_MAX),
      lessonBookingIds: z
        .array(BookingIdSchema)
        .max(PARTICIPANT_LESSON_FEEDBACK_READ_MODEL_LESSON_IDS_MAX)
        .optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('managed_latest'),
      participantId: ParticipantIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
]);

export type QueryParticipantLessonFeedbackReadModelsInput = Readonly<
  z.output<typeof QueryParticipantLessonFeedbackReadModelsInputSchema>
>;

export const QueryParticipantLessonFeedbackReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('instructor_lesson'),
      item: ParticipantLessonFeedbackReadModelSchema.nullable(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('managed_participant'),
      items: z.array(ParticipantLessonFeedbackReadModelSchema),
    })
    .strict(),
  z
    .object({
      scope: z.literal('managed_latest'),
      item: ParticipantLessonFeedbackReadModelSchema.nullable(),
    })
    .strict(),
]);

export type QueryParticipantLessonFeedbackReadModelsResult = Readonly<
  z.output<typeof QueryParticipantLessonFeedbackReadModelsResultSchema>
>;

export const FORBIDDEN_PARTICIPANT_LESSON_FEEDBACK_READ_INPUT_KEYS = [
  'accountId',
  'payerAccountId',
  'userId',
  'bookedBy',
  'instructorId',
  'recommendations',
  'completedRecommendationIds',
] as const;

export function rejectSpoofedParticipantLessonFeedbackReadInput(
  input: Record<string, unknown>
): void {
  for (const key of FORBIDDEN_PARTICIPANT_LESSON_FEEDBACK_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}
