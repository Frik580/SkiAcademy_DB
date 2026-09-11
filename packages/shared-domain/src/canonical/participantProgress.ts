import { z } from 'zod';
import {
  AccountIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  type ParticipantId,
} from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const PARTICIPANT_PROGRESS_SKILL_ID_MAX_LENGTH = 64;
export const PARTICIPANT_PROGRESS_SKILL_SCORE_MAX = 100;
export const PARTICIPANT_PROGRESS_SKILL_ENTRY_MAX = 128;
export const PARTICIPANT_PROGRESS_COMMENT_MAX_LENGTH = 2_000;
export const PARTICIPANT_PROGRESS_LEVEL_MIN = 1;
export const PARTICIPANT_PROGRESS_LEVEL_MAX = 4;

export const ParticipantProgressSkillIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTICIPANT_PROGRESS_SKILL_ID_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
    'Skill id must be a bounded URL-safe opaque value'
  );

export const ParticipantProgressSkillScoreSchema = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(PARTICIPANT_PROGRESS_SKILL_SCORE_MAX);

export const ParticipantProgressLevelSchema = z
  .number()
  .finite()
  .int()
  .min(PARTICIPANT_PROGRESS_LEVEL_MIN)
  .max(PARTICIPANT_PROGRESS_LEVEL_MAX);

export const ParticipantProgressSkillCommentSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTICIPANT_PROGRESS_COMMENT_MAX_LENGTH);

const ParticipantProgressAuditLinkSchema = z
  .object({
    createdByCommandId: CommandIdSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export const ParticipantProgressUpdatedBySchema = z
  .object({
    kind: z.literal('instructor'),
    instructorId: InstructorIdSchema,
    accountId: AccountIdSchema,
  })
  .strict();

export type ParticipantProgressUpdatedBy = Readonly<
  z.output<typeof ParticipantProgressUpdatedBySchema>
>;

function addSkillMapSizeIssue(
  context: z.RefinementCtx,
  path: string,
  size: number
): void {
  if (size > PARTICIPANT_PROGRESS_SKILL_ENTRY_MAX) {
    context.addIssue({
      code: 'custom',
      path: [path],
      message: `At most ${PARTICIPANT_PROGRESS_SKILL_ENTRY_MAX} skill entries are allowed`,
    });
  }
}

export const ParticipantProgressSkillScoresSchema = z
  .record(ParticipantProgressSkillIdSchema, ParticipantProgressSkillScoreSchema)
  .superRefine((scores, context) => {
    addSkillMapSizeIssue(context, 'skillScores', Object.keys(scores).length);
  });

export const ParticipantProgressSkillCommentsSchema = z
  .record(ParticipantProgressSkillIdSchema, ParticipantProgressSkillCommentSchema)
  .superRefine((comments, context) => {
    addSkillMapSizeIssue(context, 'skillComments', Object.keys(comments).length);
  });

export function normalizeParticipantProgressSkillComments(
  comments: Record<string, string> | undefined
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [skillId, comment] of Object.entries(comments ?? {})) {
    const trimmed = comment.trim();
    if (!trimmed) continue;
    normalized[skillId] = ParticipantProgressSkillCommentSchema.parse(trimmed);
  }
  return ParticipantProgressSkillCommentsSchema.parse(normalized);
}

export function normalizeParticipantProgressSkillScores(
  scores: Record<string, number> | undefined
): Record<string, number> {
  return ParticipantProgressSkillScoresSchema.parse(scores ?? {});
}

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const ParticipantProgressSchema = z
  .object({
    participantId: ParticipantIdSchema,
    level: ParticipantProgressLevelSchema,
    skillScores: ParticipantProgressSkillScoresSchema,
    skillComments: ParticipantProgressSkillCommentsSchema,
    updatedBy: ParticipantProgressUpdatedBySchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: ParticipantProgressAuditLinkSchema,
  })
  .strict();

export type ParticipantProgress = Readonly<z.output<typeof ParticipantProgressSchema>>;

export const EMPTY_PARTICIPANT_PROGRESS_LEVEL = PARTICIPANT_PROGRESS_LEVEL_MIN;
export const EMPTY_PARTICIPANT_PROGRESS_REVISION = 0;

/** Missing `/participant_progress/{id}` is empty start. Legacy `/users` progress is not copied. */
export function emptyParticipantProgressProjection(participantId: ParticipantId) {
  return {
    participantId,
    level: EMPTY_PARTICIPANT_PROGRESS_LEVEL,
    skillScores: {} as Record<string, number>,
    skillComments: {} as Record<string, string>,
    revision: EMPTY_PARTICIPANT_PROGRESS_REVISION,
  };
}
