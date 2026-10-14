import { z } from 'zod';
import { AccountIdSchema, CommandIdSchema, InstructorIdSchema } from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const MASTERY_LEVELS = [
  { id: 1, name: 'Beginner' },
  { id: 2, name: 'Carve' },
  { id: 3, name: 'Performance' },
  { id: 4, name: 'Expert' },
] as const;
export const DEFAULT_MASTERY_PASS_PERCENTAGE = 80;
export const LevelChangeReasonSchema = z
  .object({
    category: z.enum(['initial_qualification', 'correction', 'expert_assessment', 'other']),
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export const LevelOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }).strict(),
  z.object({ action: z.literal('retain'), reason: LevelChangeReasonSchema }).strict(),
  z
    .object({
      action: z.literal('assign'),
      level: z.number().int().min(1).max(4),
      reason: LevelChangeReasonSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('request'),
      level: z.number().int().min(1).max(4),
      reason: LevelChangeReasonSchema,
      comment: z.string().trim().max(2000).optional(),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), requestId: CommandIdSchema }).strict(),
  z
    .object({
      action: z.enum(['approve', 'reject']),
      requestId: CommandIdSchema,
      reason: LevelChangeReasonSchema.optional(),
    })
    .strict(),
]);
export type LevelOperation = z.output<typeof LevelOperationSchema>;
export const ParticipantLevelRequestSchema = z
  .object({
    requestId: CommandIdSchema,
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'stale']),
    fromLevel: z.number().int().min(1).max(4),
    proposedLevel: z.number().int().min(1).max(4),
    baseLevelRevision: AggregateRevisionSchema,
    instructorId: InstructorIdSchema,
    accountId: AccountIdSchema,
    reason: LevelChangeReasonSchema,
    comment: z.string().max(2000).optional(),
    createdAt: CanonicalTimestampSchema,
    resolvedAt: CanonicalTimestampSchema.optional(),
    resolvedBy: AccountIdSchema.optional(),
    resolutionReason: LevelChangeReasonSchema.optional(),
  })
  .strict();
export const ParticipantQualificationSchema = z
  .object({
    stage: z.number().int().min(1).max(3),
    status: z.enum(['confirmed', 'review', 'retained']),
    commandId: CommandIdSchema,
    retainedEarned: z.number().nonnegative().optional(),
  })
  .strict();
export const ParticipantLevelStateSchema = z
  .object({
    levelRevision: AggregateRevisionSchema,
    assignedThroughLevel: z.number().int().min(0).max(3).optional(),
    method: z.enum(['historical', 'xp_confirmation', 'admin_assignment', 'admin_request']),
    qualifications: z.array(ParticipantQualificationSchema).max(3),
    request: ParticipantLevelRequestSchema.optional(),
  })
  .strict();
export type ParticipantLevelState = z.output<typeof ParticipantLevelStateSchema>;

export interface ProgressionSkill {
  readonly id: string;
  readonly levelTarget: number;
  readonly maxPoints: number;
}
export interface ProgressionConfig {
  readonly passPercentage: number;
  readonly items: readonly ProgressionSkill[];
}

/** Scores are evidence. Missing entries never become evaluated zeros or synthetic XP. */
export function calculateParticipantStage(
  level: number,
  scores: Readonly<Record<string, number>>,
  config: ProgressionConfig
) {
  const isMax = level >= MASTERY_LEVELS.length;
  const items = isMax ? [] : config.items.filter((item) => item.levelTarget === level);
  const maximum = items.reduce((sum, item) => sum + item.maxPoints, 0);
  const earned = items.reduce(
    (sum, item) => sum + Math.min(item.maxPoints, Math.max(0, scores[item.id] ?? 0)),
    0
  );
  const required = Math.ceil((maximum * config.passPercentage) / 100);
  const evaluated = items.filter((item) => Object.hasOwn(scores, item.id)).length;
  return {
    level,
    nextLevel: isMax ? undefined : level + 1,
    isMax,
    earned,
    maximum,
    required,
    evaluated,
    ready: !isMax && maximum > 0 && evaluated > 0 && earned >= required,
    ratio: maximum > 0 ? earned / maximum : 0,
  };
}

export function reviewParticipantQualifications(
  state: ParticipantLevelState | undefined,
  scores: Readonly<Record<string, number>>,
  config: ProgressionConfig
): ParticipantLevelState | undefined {
  if (!state) return undefined;
  return {
    ...state,
    qualifications: state.qualifications.map((q) => {
      const stage = calculateParticipantStage(q.stage, scores, config);
      if (q.status === 'review') return q;
      if (q.status === 'retained' && stage.earned >= (q.retainedEarned ?? 0)) return q;
      return stage.ready ? q : { ...q, status: 'review' as const };
    }),
  };
}
