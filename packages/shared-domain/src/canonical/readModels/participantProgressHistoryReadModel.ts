import { z } from 'zod';
import { InstructorIdSchema, ParticipantIdSchema } from '../identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  ParticipantProgressSkillIdSchema,
  ParticipantProgressSkillScoreSchema,
  ParticipantProgressSkillCommentSchema,
} from '../participantProgress';

export const PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE = 20;
export const PARTICIPANT_PROGRESS_HISTORY_RESPONSE_BYTES_MAX = 2 * 1024 * 1024;
// Event IDs append a revision to a canonical Participant ID; they are not new domain IDs.
export const ParticipantProgressHistoryEventIdSchema = z
  .string()
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const ParticipantProgressHistoryCursorSchema = z.string().min(1).max(16384);

export const ParticipantProgressHistoryItemSchema = z
  .object({
    id: ParticipantProgressHistoryEventIdSchema,
    participantId: ParticipantIdSchema,
    revision: AggregateRevisionSchema,
    at: CanonicalTimestampSchema,
    kind: z.literal('update_participant_progress'),
    instructorId: InstructorIdSchema.optional(),
    skillChanges: z
      .array(
        z
          .object({
            skillId: ParticipantProgressSkillIdSchema,
            previousScore: ParticipantProgressSkillScoreSchema.optional(),
            newScore: ParticipantProgressSkillScoreSchema.optional(),
          })
          .strict()
      )
      .max(256),
    commentChanges: z
      .array(
        z
          .object({
            skillId: ParticipantProgressSkillIdSchema,
            previousText: ParticipantProgressSkillCommentSchema.optional(),
            newText: ParticipantProgressSkillCommentSchema.optional(),
          })
          .strict()
      )
      .max(256),
  })
  .strict();
export type ParticipantProgressHistoryItem = Readonly<
  z.output<typeof ParticipantProgressHistoryItemSchema>
>;

export const QueryParticipantProgressHistoryReadModelsInputSchema = z
  .object({
    scope: z.literal('instructor'),
    participantId: ParticipantIdSchema,
    cursor: ParticipantProgressHistoryCursorSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();
export type QueryParticipantProgressHistoryReadModelsInput = Readonly<
  z.output<typeof QueryParticipantProgressHistoryReadModelsInputSchema>
>;

export const QueryParticipantProgressHistoryReadModelsResultSchema = z
  .object({
    scope: z.literal('instructor'),
    participantId: ParticipantIdSchema,
    items: z
      .array(ParticipantProgressHistoryItemSchema)
      .max(PARTICIPANT_PROGRESS_HISTORY_PAGE_SIZE),
    // May be present with no items after a bounded scan of non-observation events.
    nextCursor: ParticipantProgressHistoryCursorSchema.optional(),
  })
  .strict();
export type QueryParticipantProgressHistoryReadModelsResult = Readonly<
  z.output<typeof QueryParticipantProgressHistoryReadModelsResultSchema>
>;
