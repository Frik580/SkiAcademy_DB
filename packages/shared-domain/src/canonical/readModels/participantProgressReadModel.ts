import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { ParticipantIdSchema } from '../identifiers';
import {
  EMPTY_PARTICIPANT_PROGRESS_LEVEL,
  EMPTY_PARTICIPANT_PROGRESS_REVISION,
  ParticipantProgressLevelSchema,
  ParticipantProgressSkillCommentsSchema,
  ParticipantProgressSkillScoresSchema,
  ParticipantProgressUpdatedBySchema,
} from '../participantProgress';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX = 32;

export const ParticipantProgressReadModelSchema = z
  .object({
    participantId: ParticipantIdSchema,
    level: ParticipantProgressLevelSchema,
    skillScores: ParticipantProgressSkillScoresSchema,
    skillComments: ParticipantProgressSkillCommentsSchema,
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema.optional(),
    updatedBy: ParticipantProgressUpdatedBySchema.optional(),
  })
  .strict();

export type ParticipantProgressReadModel = Readonly<
  z.output<typeof ParticipantProgressReadModelSchema>
>;

/** Missing `/participant_progress` document. Legacy `/users` progress is not a fallback. */
export function emptyParticipantProgressReadModel(
  participantId: z.output<typeof ParticipantIdSchema>
): ParticipantProgressReadModel {
  return ParticipantProgressReadModelSchema.parse({
    participantId,
    level: EMPTY_PARTICIPANT_PROGRESS_LEVEL,
    skillScores: {},
    skillComments: {},
    revision: EMPTY_PARTICIPANT_PROGRESS_REVISION,
  });
}

export const QueryParticipantProgressReadModelsInputSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('managed'),
      participantIds: z
        .array(ParticipantIdSchema)
        .max(PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX)
        .optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('instructor'),
      participantIds: z
        .array(ParticipantIdSchema)
        .min(1)
        .max(PARTICIPANT_PROGRESS_READ_MODEL_IDS_MAX),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
]);

export type QueryParticipantProgressReadModelsInput = Readonly<
  z.output<typeof QueryParticipantProgressReadModelsInputSchema>
>;

export const QueryParticipantProgressReadModelsResultSchema = z
  .object({
    scope: z.enum(['managed', 'instructor']),
    items: z.array(ParticipantProgressReadModelSchema),
  })
  .strict();

export type QueryParticipantProgressReadModelsResult = Readonly<
  z.output<typeof QueryParticipantProgressReadModelsResultSchema>
>;

export const FORBIDDEN_PARTICIPANT_PROGRESS_READ_INPUT_KEYS = [
  'accountId',
  'payerAccountId',
  'userId',
  'bookedBy',
  'instructorId',
] as const;

export function rejectSpoofedParticipantProgressReadInput(input: Record<string, unknown>): void {
  for (const key of FORBIDDEN_PARTICIPANT_PROGRESS_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}