import { z } from 'zod';
import {
  AccountIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  type CommandId,
  type CorrelationId,
  type ParticipantId,
} from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema, type CanonicalTimestamp } from './primitives';
import type { CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import { nextAggregateRevision } from './revisionConcurrency';

export const PARTICIPANT_ACHIEVEMENT_ID_MAX_LENGTH = 64;
export const PARTICIPANT_ACHIEVEMENTS_MAX = 64;
export const PARTICIPANT_ACHIEVEMENT_RECORD_BATCH_MAX = 32;

export const FORBIDDEN_PARTICIPANT_ACHIEVEMENT_IDS = ['feedback_given'] as const;

export const COURSE_GRADUATE_ACHIEVEMENT_ID = 'course_graduate' as const;
export const SERVER_ISSUED_PARTICIPANT_ACHIEVEMENT_IDS = [COURSE_GRADUATE_ACHIEVEMENT_ID] as const;

export const ParticipantAchievementIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(PARTICIPANT_ACHIEVEMENT_ID_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
    'Achievement id must be a bounded URL-safe opaque value'
  )
  .refine(
    (value) =>
      !FORBIDDEN_PARTICIPANT_ACHIEVEMENT_IDS.includes(
        value as (typeof FORBIDDEN_PARTICIPANT_ACHIEVEMENT_IDS)[number]
      ),
    'Account-level achievements cannot be stored on a Participant'
  );

export type ParticipantAchievementId = z.output<typeof ParticipantAchievementIdSchema>;

export const ParticipantAchievementSourceSchema = z.enum([
  'participant_attendance',
  'participant_progress',
  'participant_lesson_feedback',
  'course_completion',
]);

export type ParticipantAchievementSource = z.output<typeof ParticipantAchievementSourceSchema>;

export const ParticipantAchievementEarnedRecordSchema = z
  .object({
    earnedAt: CanonicalTimestampSchema,
    source: ParticipantAchievementSourceSchema,
  })
  .strict();

export type ParticipantAchievementEarnedRecord = Readonly<
  z.output<typeof ParticipantAchievementEarnedRecordSchema>
>;

const ParticipantAchievementsAuditLinkSchema = z
  .object({
    createdByCommandId: CommandIdSchema,
    lastChangedByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export const ParticipantAchievementsUpdatedBySchema = z
  .object({
    kind: z.literal('account'),
    accountId: AccountIdSchema,
  })
  .strict();

export type ParticipantAchievementsUpdatedBy = Readonly<
  z.output<typeof ParticipantAchievementsUpdatedBySchema>
>;

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (value) => value >= 1,
  'Persisted aggregate revision must be at least one'
);

export const ParticipantAchievementsSchema = z
  .object({
    participantId: ParticipantIdSchema,
    earned: z.record(ParticipantAchievementIdSchema, ParticipantAchievementEarnedRecordSchema),
    updatedBy: ParticipantAchievementsUpdatedBySchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: ParticipantAchievementsAuditLinkSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const size = Object.keys(value.earned).length;
    if (size > PARTICIPANT_ACHIEVEMENTS_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['earned'],
        message: `At most ${PARTICIPANT_ACHIEVEMENTS_MAX} earned achievements are allowed`,
      });
    }
    for (const [achievementId, record] of Object.entries(value.earned)) {
      const isCourseGraduate = achievementId === COURSE_GRADUATE_ACHIEVEMENT_ID;
      if (isCourseGraduate && record.source !== 'course_completion') {
        context.addIssue({
          code: 'custom',
          path: ['earned', achievementId, 'source'],
          message: 'course_graduate must use course_completion source',
        });
      }
      if (!isCourseGraduate && record.source === 'course_completion') {
        context.addIssue({
          code: 'custom',
          path: ['earned', achievementId, 'source'],
          message: 'course_completion source is reserved for course_graduate',
        });
      }
    }
  });

export type ParticipantAchievements = Readonly<z.output<typeof ParticipantAchievementsSchema>>;

export const EMPTY_PARTICIPANT_ACHIEVEMENTS_REVISION = 0;

export function emptyParticipantAchievementsProjection(participantId: ParticipantId) {
  return {
    participantId,
    earned: {} as Record<string, ParticipantAchievementEarnedRecord>,
    revision: EMPTY_PARTICIPANT_ACHIEVEMENTS_REVISION,
  };
}

const ClientRecordableParticipantAchievementIdSchema = ParticipantAchievementIdSchema.refine(
  (value) =>
    !SERVER_ISSUED_PARTICIPANT_ACHIEVEMENT_IDS.includes(
      value as (typeof SERVER_ISSUED_PARTICIPANT_ACHIEVEMENT_IDS)[number]
    ),
  'Server-issued achievements cannot be recorded by a managing Account'
);

export const RecordParticipantAchievementInputSchema = z
  .object({
    achievementId: ClientRecordableParticipantAchievementIdSchema,
    earnedAt: CanonicalTimestampSchema,
    source: ParticipantAchievementSourceSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'course_completion') {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'course_completion achievements are issued server-side',
      });
    }
  });

export type RecordParticipantAchievementInput = Readonly<
  z.output<typeof RecordParticipantAchievementInputSchema>
>;

export const CourseGraduateAchievementTargetSchema = z
  .object({
    achievementId: z.literal(COURSE_GRADUATE_ACHIEVEMENT_ID),
    enrollmentId: CourseEnrollmentIdSchema,
    participantId: ParticipantIdSchema,
    courseId: CourseIdSchema,
    earnedAt: CanonicalTimestampSchema,
    source: z.literal('course_completion'),
  })
  .strict();

export type CourseGraduateAchievementTarget = Readonly<
  z.output<typeof CourseGraduateAchievementTargetSchema>
>;

/** The only accepted evidence contract for later server-side course_graduate issuance. */
export function courseGraduateAchievementTargetFromEnrollment(
  enrollment: Pick<CourseEnrollment, 'enrollmentId' | 'participantId' | 'courseId' | 'lifecycle'>
): CourseGraduateAchievementTarget | undefined {
  if (enrollment.lifecycle.status !== 'completed') return undefined;
  return CourseGraduateAchievementTargetSchema.parse({
    achievementId: COURSE_GRADUATE_ACHIEVEMENT_ID,
    enrollmentId: enrollment.enrollmentId,
    participantId: enrollment.participantId,
    courseId: enrollment.courseId,
    earnedAt: enrollment.lifecycle.completedAt,
    source: 'course_completion',
  });
}

export function mergeOnceEarnedParticipantAchievements(
  currentEarned: Readonly<Record<string, ParticipantAchievementEarnedRecord>>,
  items: readonly {
    readonly achievementId: string;
    readonly earnedAt: CanonicalTimestamp;
    readonly source: ParticipantAchievementSource;
  }[]
): {
  readonly earned: Record<string, ParticipantAchievementEarnedRecord>;
  readonly newlyEarnedAchievementIds: string[];
} {
  const earned = { ...currentEarned };
  const newlyEarnedAchievementIds: string[] = [];
  for (const item of items) {
    if (earned[item.achievementId]) continue;
    earned[item.achievementId] = {
      earnedAt: item.earnedAt,
      source: item.source,
    };
    newlyEarnedAchievementIds.push(item.achievementId);
  }
  return { earned, newlyEarnedAchievementIds };
}

export function buildParticipantAchievementsAggregate(input: {
  readonly participantId: ParticipantId;
  readonly current: ParticipantAchievements | undefined;
  readonly earned: Record<string, ParticipantAchievementEarnedRecord>;
  readonly shouldWrite: boolean;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly now: CanonicalTimestamp;
  readonly updatedBy?: ParticipantAchievementsUpdatedBy;
}): ParticipantAchievements {
  const nextRevision = input.shouldWrite
    ? input.current
      ? nextAggregateRevision(input.current.revision)
      : AggregateRevisionSchema.parse(1)
    : (input.current?.revision ?? AggregateRevisionSchema.parse(1));
  return ParticipantAchievementsSchema.parse({
    participantId: input.participantId,
    earned: input.earned,
    ...(input.updatedBy
      ? { updatedBy: input.updatedBy }
      : input.current?.updatedBy
        ? { updatedBy: input.current.updatedBy }
        : {}),
    revision: input.shouldWrite || input.current ? nextRevision : AggregateRevisionSchema.parse(1),
    createdAt: input.current?.createdAt ?? input.now,
    updatedAt: input.shouldWrite ? input.now : (input.current?.updatedAt ?? input.now),
    audit: {
      createdByCommandId: input.current?.audit.createdByCommandId ?? input.commandId,
      lastChangedByCommandId: input.shouldWrite
        ? input.commandId
        : (input.current?.audit.lastChangedByCommandId ?? input.commandId),
      correlationId: input.correlationId,
    },
  });
}

export function courseGraduateAchievementIssuanceState(input: {
  readonly enrollment: Pick<
    CourseEnrollment,
    'enrollmentId' | 'participantId' | 'courseId' | 'lifecycle'
  >;
  readonly current: ParticipantAchievements | undefined;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly now: CanonicalTimestamp;
}): { readonly planned: ParticipantAchievements; readonly shouldWrite: boolean } | undefined {
  const target = courseGraduateAchievementTargetFromEnrollment(input.enrollment);
  if (!target) return undefined;
  const merged = mergeOnceEarnedParticipantAchievements(input.current?.earned ?? {}, [
    {
      achievementId: target.achievementId,
      earnedAt: target.earnedAt,
      source: target.source,
    },
  ]);
  if (merged.newlyEarnedAchievementIds.length === 0) {
    return input.current ? { planned: input.current, shouldWrite: false } : undefined;
  }
  return {
    shouldWrite: true,
    planned: buildParticipantAchievementsAggregate({
      participantId: target.participantId,
      current: input.current,
      earned: merged.earned,
      shouldWrite: true,
      commandId: input.commandId,
      correlationId: input.correlationId,
      now: input.now,
    }),
  };
}

export const RecordParticipantAchievementsIntentSchema = z
  .object({
    participantId: ParticipantIdSchema,
    earned: z
      .array(RecordParticipantAchievementInputSchema)
      .min(1)
      .max(PARTICIPANT_ACHIEVEMENT_RECORD_BATCH_MAX),
  })
  .strict()
  .superRefine((intent, context) => {
    const seen = new Set<string>();
    for (const [index, item] of intent.earned.entries()) {
      if (seen.has(item.achievementId)) {
        context.addIssue({
          code: 'custom',
          path: ['earned', index, 'achievementId'],
          message: 'Duplicate achievement ids are not allowed in one command',
        });
      }
      seen.add(item.achievementId);
    }
  });
