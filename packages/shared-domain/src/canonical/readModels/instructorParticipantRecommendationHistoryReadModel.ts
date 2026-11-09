import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantLessonFeedbackIdSchema,
} from '../identifiers';
import { PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX } from '../participantLessonFeedback';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';
import { ParticipantLessonFeedbackReadModelItemSchema } from './participantLessonFeedbackReadModel';

export const INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE = 20;
const CursorTokenSchema = z.string().min(1).max(8192);

export const InstructorParticipantRecommendationHistoryItemSchema = z
  .object({
    feedbackId: ParticipantLessonFeedbackIdSchema,
    participantId: ParticipantIdSchema,
    lessonBookingId: BookingIdSchema,
    instructorId: InstructorIdSchema,
    lessonStartsAt: CanonicalTimestampSchema,
    lessonDate: z.iso.date().optional(),
    items: z
      .array(ParticipantLessonFeedbackReadModelItemSchema)
      .min(1)
      .max(PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX),
    revision: AggregateRevisionSchema.refine((revision) => revision >= 1),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export const QueryInstructorParticipantRecommendationHistoryReadModelsInputSchema = z
  .object({
    scope: z.literal('instructor'),
    participantId: ParticipantIdSchema,
    cursor: CursorTokenSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export const QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema = z
  .object({
    scope: z.literal('instructor'),
    participantId: ParticipantIdSchema,
    items: z
      .array(InstructorParticipantRecommendationHistoryItemSchema)
      .max(INSTRUCTOR_RECOMMENDATION_HISTORY_PAGE_SIZE),
    nextCursor: CursorTokenSchema.optional(),
  })
  .strict();

export type QueryInstructorParticipantRecommendationHistoryReadModelsInput = Readonly<
  z.output<typeof QueryInstructorParticipantRecommendationHistoryReadModelsInputSchema>
>;

export type QueryInstructorParticipantRecommendationHistoryReadModelsResult = Readonly<
  z.output<typeof QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema>
>;
