import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AccountIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
} from '../identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
} from '../primitives';
import { TestActorKindSchema, TestSessionStatusSchema } from '../testSessions';

export const TEST_SESSION_READ_SCOPES = [
  'test_session_list',
  'test_session_inventory',
  'test_actor_directory',
  'live_course_templates',
] as const;

export const TestSessionReadScopeSchema = z.enum(TEST_SESSION_READ_SCOPES);
export type TestSessionReadScope = (typeof TEST_SESSION_READ_SCOPES)[number];

export const TEST_SESSION_READ_MODEL_PAGE_SIZE_DEFAULT = 20;
export const TEST_SESSION_READ_MODEL_PAGE_SIZE_MAX = 50;
export const TEST_SESSION_INVENTORY_ID_PAGE_SIZE = 25;

export const QueryTestSessionReadModelsInputSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('test_session_list'),
      pageSize: z.number().int().min(1).max(TEST_SESSION_READ_MODEL_PAGE_SIZE_MAX).optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('test_session_inventory'),
      testSessionId: TestSessionIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('test_actor_directory'),
      pageSize: z.number().int().min(1).max(TEST_SESSION_READ_MODEL_PAGE_SIZE_MAX).optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('live_course_templates'),
      pageSize: z.number().int().min(1).max(TEST_SESSION_READ_MODEL_PAGE_SIZE_MAX).optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
]);

export type QueryTestSessionReadModelsInput = Readonly<
  z.output<typeof QueryTestSessionReadModelsInputSchema>
>;

export const TestSessionListItemSchema = z
  .object({
    testSessionId: TestSessionIdSchema,
    status: TestSessionStatusSchema,
    label: z.string().trim().min(1).max(120),
    createdByAccountId: AccountIdSchema,
    startingBalanceKzt: KztMinorUnitsSchema,
    inventoryRevision: AggregateRevisionSchema,
    revision: AggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type TestSessionListItem = Readonly<z.output<typeof TestSessionListItemSchema>>;

export const TestSessionInventoryCountsSchema = z
  .object({
    bookings: z.number().int().min(0),
    courseClones: z.number().int().min(0),
    enrollments: z.number().int().min(0),
    payments: z.number().int().min(0),
    attendance: z.number().int().min(0),
    issues: z.number().int().min(0),
    assignedActors: z.number().int().min(0),
  })
  .strict();

export type TestSessionInventoryCounts = Readonly<
  z.output<typeof TestSessionInventoryCountsSchema>
>;

export const TestSessionInventoryReadModelSchema = z
  .object({
    testSessionId: TestSessionIdSchema,
    status: TestSessionStatusSchema,
    label: z.string().trim().min(1).max(120),
    createdByAccountId: AccountIdSchema,
    startingBalanceKzt: KztMinorUnitsSchema,
    clonedCourseIds: z.array(CourseIdSchema).max(64),
    assignedAccountIds: z.array(AccountIdSchema).max(TEST_SESSION_INVENTORY_ID_PAGE_SIZE),
    counts: TestSessionInventoryCountsSchema,
    inventoryRevision: AggregateRevisionSchema,
    revision: AggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type TestSessionInventoryReadModel = Readonly<
  z.output<typeof TestSessionInventoryReadModelSchema>
>;

export const TestActorDirectoryItemSchema = z
  .object({
    accountId: AccountIdSchema,
    kind: TestActorKindSchema,
    allowed: z.boolean(),
    participantIds: z.array(ParticipantIdSchema).max(32),
    instructorId: InstructorIdSchema.optional(),
    activeTestSessionId: TestSessionIdSchema.nullable(),
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export type TestActorDirectoryItem = Readonly<z.output<typeof TestActorDirectoryItemSchema>>;

export const LiveCourseTemplateItemSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
    lifecycle: z.enum(['active', 'archived']),
    revision: AggregateRevisionSchema,
  })
  .strict();

export type LiveCourseTemplateItem = Readonly<z.output<typeof LiveCourseTemplateItemSchema>>;

export const QueryTestSessionReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('test_session_list'),
      items: z.array(TestSessionListItemSchema),
    })
    .strict(),
  z
    .object({
      scope: z.literal('test_session_inventory'),
      item: TestSessionInventoryReadModelSchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('test_actor_directory'),
      items: z.array(TestActorDirectoryItemSchema),
    })
    .strict(),
  z
    .object({
      scope: z.literal('live_course_templates'),
      items: z.array(LiveCourseTemplateItemSchema),
    })
    .strict(),
]);

export type QueryTestSessionReadModelsResult = Readonly<
  z.output<typeof QueryTestSessionReadModelsResultSchema>
>;
