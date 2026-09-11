import { z } from 'zod';
import {
  AccountIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantLessonFeedbackIdSchema,
  type ParticipantId,
  type ParticipantLessonFeedbackId,
} from './identifiers';
import { participantLessonFeedbackIdFromLessonParticipant } from './deterministicIdentity';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

/** Reuses instructor skill-comment bounds for per-item lesson feedback text. */
export const PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH = 2_000;
export const PARTICIPANT_LESSON_FEEDBACK_ITEM_ID_MAX_LENGTH = 64;
export const PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX = 32;

export const ParticipantLessonFeedbackItemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTICIPANT_LESSON_FEEDBACK_ITEM_ID_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
    'Feedback item id must be a bounded URL-safe opaque value'
  );

export const ParticipantLessonFeedbackItemTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTICIPANT_LESSON_FEEDBACK_ITEM_TEXT_MAX_LENGTH);

export const ParticipantLessonFeedbackItemSchema = z
  .object({
    itemId: ParticipantLessonFeedbackItemIdSchema,
    text: ParticipantLessonFeedbackItemTextSchema,
  })
  .strict();

export type ParticipantLessonFeedbackItem = Readonly<
  z.output<typeof ParticipantLessonFeedbackItemSchema>
>;

export const ParticipantLessonFeedbackItemsSchema = z
  .array(ParticipantLessonFeedbackItemSchema)
  .max(PARTICIPANT_LESSON_FEEDBACK_ITEMS_MAX)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.itemId)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'itemId'],
          message: 'Duplicate feedback item ids are not allowed',
        });
      }
      seen.add(item.itemId);
    }
  });

export const ParticipantLessonFeedbackCompletedItemIdsSchema = z
  .array(ParticipantLessonFeedbackItemIdSchema)
  .superRefine((completedItemIds, context) => {
    const seen = new Set<string>();
    for (const [index, itemId] of completedItemIds.entries()) {
      if (seen.has(itemId)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate completed item ids are not allowed',
        });
      }
      seen.add(itemId);
    }
  });

const ParticipantLessonFeedbackAuditLinkSchema = z
  .object({
    createdByCommandId: CommandIdSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export const ParticipantLessonFeedbackUpdatedBySchema = z
  .object({
    kind: z.literal('instructor'),
    instructorId: InstructorIdSchema,
    accountId: AccountIdSchema,
  })
  .strict();

export type ParticipantLessonFeedbackUpdatedBy = Readonly<
  z.output<typeof ParticipantLessonFeedbackUpdatedBySchema>
>;

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const ParticipantLessonFeedbackIdentitySchema = z
  .object({
    participantId: ParticipantIdSchema,
    lessonBookingId: BookingIdSchema,
  })
  .strict();

export type ParticipantLessonFeedbackIdentity = Readonly<
  z.output<typeof ParticipantLessonFeedbackIdentitySchema>
>;

export const ParticipantLessonFeedbackSchema = z
  .object({
    feedbackId: ParticipantLessonFeedbackIdSchema,
    participantId: ParticipantIdSchema,
    lessonBookingId: BookingIdSchema,
    instructorId: InstructorIdSchema,
    items: ParticipantLessonFeedbackItemsSchema,
    completedItemIds: ParticipantLessonFeedbackCompletedItemIdsSchema,
    updatedBy: ParticipantLessonFeedbackUpdatedBySchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: ParticipantLessonFeedbackAuditLinkSchema,
  })
  .strict()
  .superRefine((feedback, context) => {
    const itemIds = new Set(feedback.items.map((item) => item.itemId));
    for (const [index, itemId] of feedback.completedItemIds.entries()) {
      if (!itemIds.has(itemId)) {
        context.addIssue({
          code: 'custom',
          path: ['completedItemIds', index],
          message: 'Completed item id must reference an existing feedback item',
        });
      }
    }
  });

export type ParticipantLessonFeedback = Readonly<z.output<typeof ParticipantLessonFeedbackSchema>>;

export const EMPTY_PARTICIPANT_LESSON_FEEDBACK_REVISION = 0;

/** Missing aggregate is empty start. Legacy Booking recommendation fields are not copied. */
export function emptyParticipantLessonFeedbackProjection(
  identity: ParticipantLessonFeedbackIdentity
): {
  readonly feedbackId: ParticipantLessonFeedbackId;
  readonly participantId: ParticipantId;
  readonly lessonBookingId: z.output<typeof BookingIdSchema>;
  readonly items: readonly ParticipantLessonFeedbackItem[];
  readonly completedItemIds: readonly string[];
  readonly revision: number;
} {
  const parsed = ParticipantLessonFeedbackIdentitySchema.parse(identity);
  return {
    feedbackId: participantLessonFeedbackIdFromLessonParticipant(parsed),
    participantId: parsed.participantId,
    lessonBookingId: parsed.lessonBookingId,
    items: [],
    completedItemIds: [],
    revision: EMPTY_PARTICIPANT_LESSON_FEEDBACK_REVISION,
  };
}

export const SaveParticipantLessonFeedbackItemInputSchema = ParticipantLessonFeedbackItemSchema;

export const SaveParticipantLessonFeedbackItemsInputSchema =
  ParticipantLessonFeedbackItemsSchema;

export function normalizeParticipantLessonFeedbackItems(
  items: readonly { itemId: string; text: string }[]
): ParticipantLessonFeedbackItem[] {
  return ParticipantLessonFeedbackItemsSchema.parse(
    items.map((item) => ({
      itemId: item.itemId,
      text: item.text,
    }))
  );
}
