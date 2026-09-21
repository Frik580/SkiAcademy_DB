import { z } from 'zod';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import {
  AccountIdSchema,
  CanonicalOpaqueIdSchema,
  CommandIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
  type AccountId,
  type TestSessionId,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  compareCanonicalTimestamps,
} from './primitives';
export * from './canonicalScope';

export const TEST_SESSION_STATUSES = [
  'provisioning',
  'active',
  'locked',
  'resetting',
  'deleting',
  'closed',
  'failed',
] as const;

export const TestSessionStatusSchema = z.enum(TEST_SESSION_STATUSES);
export type TestSessionStatus = z.output<typeof TestSessionStatusSchema>;

const PersistedRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

const TestSessionMaintenanceSchema = z
  .object({
    operationId: CanonicalOpaqueIdSchema.optional(),
    operationKind: z.enum(['provision', 'reset', 'delete']).optional(),
    leaseExpiresAt: CanonicalTimestampSchema.optional(),
    lastError: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((maintenance, context) => {
    if ((maintenance.operationId === undefined) !== (maintenance.operationKind === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['operationId'],
        message: 'operationId and operationKind must be present together',
      });
    }
  });

export const TestSessionSchema = z
  .object({
    testSessionId: TestSessionIdSchema,
    schemaVersion: z.literal(1),
    status: TestSessionStatusSchema,
    label: z.string().trim().min(1).max(120),
    createdByAccountId: AccountIdSchema,
    config: z
      .object({
        startingBalanceKzt: KztMinorUnitsSchema,
        clonedCourseIds: z.array(CourseIdSchema).max(64),
      })
      .strict()
      .superRefine((config, context) => {
        if (new Set(config.clonedCourseIds).size !== config.clonedCourseIds.length) {
          context.addIssue({
            code: 'custom',
            path: ['clonedCourseIds'],
            message: 'clonedCourseIds must be unique',
          });
        }
      }),
    inventoryRevision: AggregateRevisionSchema,
    maintenance: TestSessionMaintenanceSchema.optional(),
    revision: PersistedRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((session, context) => {
    if (compareCanonicalTimestamps(session.updatedAt, session.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }
  });

export type TestSession = Readonly<z.output<typeof TestSessionSchema>>;

export const TEST_ACTOR_KINDS = ['test_parent', 'test_instructor'] as const;
export const TestActorKindSchema = z.enum(TEST_ACTOR_KINDS);

export const TestActorSchema = z
  .object({
    accountId: AccountIdSchema,
    participantIds: z.array(ParticipantIdSchema).min(1).max(32),
    instructorId: InstructorIdSchema.optional(),
    kind: TestActorKindSchema,
    allowed: z.boolean(),
    dataScope: z.literal('test'),
    revision: PersistedRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((actor, context) => {
    if (compareCanonicalTimestamps(actor.updatedAt, actor.createdAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede createdAt',
      });
    }
    if (new Set(actor.participantIds).size !== actor.participantIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['participantIds'],
        message: 'participantIds must be unique',
      });
    }
    if (actor.kind === 'test_instructor' && actor.instructorId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'A test instructor requires instructorId',
      });
    }
    if (actor.kind === 'test_parent' && actor.instructorId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'A test parent cannot carry instructorId',
      });
    }
  });

export type TestActor = Readonly<z.output<typeof TestActorSchema>>;

export const TestActorAssignmentSchema = z
  .object({
    accountId: AccountIdSchema,
    activeTestSessionId: TestSessionIdSchema.nullable(),
    revision: PersistedRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict();

export type TestActorAssignment = Readonly<z.output<typeof TestActorAssignmentSchema>>;

export const TestSessionMembershipSchema = z
  .object({
    testSessionId: TestSessionIdSchema,
    accountId: AccountIdSchema,
    boundAt: CanonicalTimestampSchema,
    boundByCommandId: CommandIdSchema,
    revision: PersistedRevisionSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict();

export type TestSessionMembership = Readonly<z.output<typeof TestSessionMembershipSchema>>;

export function isTestSessionMembershipForPath(
  membership: TestSessionMembership,
  testSessionId: TestSessionId,
  accountId: AccountId
): boolean {
  return membership.testSessionId === testSessionId && membership.accountId === accountId;
}

export const MAX_ACTIVE_TEST_SESSIONS = 1;

export type TestSessionPolicyErrorCode = 'TEST_SESSION_ACTIVE_LIMIT' | 'TEST_SESSION_NOT_ACTIVE';

export class TestSessionPolicyError extends Error {
  constructor(
    readonly code: TestSessionPolicyErrorCode,
    readonly status?: TestSessionStatus
  ) {
    super(code);
    this.name = 'TestSessionPolicyError';
  }
}

export function testSessionStatusConsumesActiveSlot(status: TestSessionStatus): boolean {
  return status === 'active';
}

export function assertTestSessionActivationAllowed(
  existingStatuses: readonly TestSessionStatus[]
): void {
  const activeCount = existingStatuses.filter(testSessionStatusConsumesActiveSlot).length;
  if (activeCount >= MAX_ACTIVE_TEST_SESSIONS) {
    throw new TestSessionPolicyError('TEST_SESSION_ACTIVE_LIMIT');
  }
}

export function assertTestSessionAcceptsCommands(session: Pick<TestSession, 'status'>): void {
  if (session.status !== 'active') {
    throw new TestSessionPolicyError('TEST_SESSION_NOT_ACTIVE', session.status);
  }
}
