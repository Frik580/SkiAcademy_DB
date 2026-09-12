import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { ParticipantIdSchema } from '../identifiers';
import {
  EMPTY_PARTICIPANT_ACHIEVEMENTS_REVISION,
  ParticipantAchievementEarnedRecordSchema,
  ParticipantAchievementIdSchema,
  ParticipantAchievementsUpdatedBySchema,
} from '../participantAchievements';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const PARTICIPANT_ACHIEVEMENTS_READ_MODEL_IDS_MAX = 32;

export const ParticipantAchievementsReadModelSchema = z
  .object({
    participantId: ParticipantIdSchema,
    earned: z.record(ParticipantAchievementIdSchema, ParticipantAchievementEarnedRecordSchema),
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema.optional(),
    updatedBy: ParticipantAchievementsUpdatedBySchema.optional(),
  })
  .strict();

export type ParticipantAchievementsReadModel = Readonly<
  z.output<typeof ParticipantAchievementsReadModelSchema>
>;

/** Missing `/participant_achievements` document. Legacy activity_logs are not a fallback. */
export function emptyParticipantAchievementsReadModel(
  participantId: z.output<typeof ParticipantIdSchema>
): ParticipantAchievementsReadModel {
  return ParticipantAchievementsReadModelSchema.parse({
    participantId,
    earned: {},
    revision: EMPTY_PARTICIPANT_ACHIEVEMENTS_REVISION,
  });
}

export const QueryParticipantAchievementsReadModelsInputSchema = z
  .object({
    scope: z.literal('managed'),
    participantIds: z
      .array(ParticipantIdSchema)
      .max(PARTICIPANT_ACHIEVEMENTS_READ_MODEL_IDS_MAX)
      .optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryParticipantAchievementsReadModelsInput = Readonly<
  z.output<typeof QueryParticipantAchievementsReadModelsInputSchema>
>;

export const QueryParticipantAchievementsReadModelsResultSchema = z
  .object({
    scope: z.literal('managed'),
    items: z.array(ParticipantAchievementsReadModelSchema),
  })
  .strict();

export type QueryParticipantAchievementsReadModelsResult = Readonly<
  z.output<typeof QueryParticipantAchievementsReadModelsResultSchema>
>;

export const FORBIDDEN_PARTICIPANT_ACHIEVEMENTS_READ_INPUT_KEYS = [
  'accountId',
  'payerAccountId',
  'userId',
  'bookedBy',
  'instructorId',
] as const;

export function rejectSpoofedParticipantAchievementsReadInput(
  input: Record<string, unknown>
): void {
  for (const key of FORBIDDEN_PARTICIPANT_ACHIEVEMENTS_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}
