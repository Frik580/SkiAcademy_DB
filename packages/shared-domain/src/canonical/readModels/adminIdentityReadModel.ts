import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
} from '../identifiers';
import {
  AdminIdentityAccountRoleProjectionSchema,
  AdminIdentityAuthorizedActionSchema,
  AdminIdentityInstructorLinkProjectionSchema,
  AdminIdentityManagedParticipantSummarySchema,
  AdminIdentityManagingAccountSummarySchema,
  IdentityDiagnosticSchema,
  InstructorCatalogSpecialtySchema,
} from '../identityAdministration';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';

export const ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX = 50;

export const ADMIN_IDENTITY_READ_SCOPES = [
  'admin_account_list',
  'admin_account_detail',
  'admin_participant_list',
  'admin_participant_detail',
  'admin_instructor_list',
  'admin_instructor_detail',
  'admin_eligible_participants',
] as const;

export type AdminIdentityReadScope = (typeof ADMIN_IDENTITY_READ_SCOPES)[number];
export const AdminIdentityReadScopeSchema = z.enum(ADMIN_IDENTITY_READ_SCOPES);

const pageSizeSchema = z
  .number()
  .int()
  .positive()
  .max(ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX)
  .optional();

export const AdminAccountListItemSchema = z
  .object({
    accountId: AccountIdSchema,
    displayName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320).optional(),
    lifecycle: z.enum(['active', 'disabled', 'uninitialized']),
    role: AdminIdentityAccountRoleProjectionSchema,
    managedParticipantCount: z.number().int().nonnegative(),
    instructorLink: AdminIdentityInstructorLinkProjectionSchema,
    diagnosticCount: z.number().int().nonnegative(),
    revision: AggregateRevisionSchema.optional(),
    authorizedActions: z.array(AdminIdentityAuthorizedActionSchema).max(8),
    updatedAt: CanonicalTimestampSchema.optional(),
  })
  .strict();

export type AdminAccountListItem = z.output<typeof AdminAccountListItemSchema>;

export const AdminAccountDetailReadModelSchema = AdminAccountListItemSchema.extend({
  managedParticipants: z.array(AdminIdentityManagedParticipantSummarySchema).max(50),
  diagnostics: z.array(IdentityDiagnosticSchema).max(32),
  phoneNumber: z.string().trim().max(32).optional(),
}).strict();

export type AdminAccountDetailReadModel = z.output<typeof AdminAccountDetailReadModelSchema>;

export const AdminParticipantListItemSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
    classification: z.enum(['self', 'dependent', 'unmanaged_guest']),
    lifecycle: z.enum(['active', 'archived']),
    blockedInstructorCount: z.number().int().nonnegative(),
    managingAccountCount: z.number().int().nonnegative(),
    diagnosticCount: z.number().int().nonnegative(),
    revision: AggregateRevisionSchema,
    authorizedActions: z.array(AdminIdentityAuthorizedActionSchema).max(8),
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type AdminParticipantListItem = z.output<typeof AdminParticipantListItemSchema>;

export const AdminParticipantProfileProjectionSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    age: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('birth_date'),
          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .strict(),
      z
        .object({
          kind: z.literal('age_years'),
          years: z.number().finite().int().min(0).max(125),
        })
        .strict(),
    ]),
    skillLevel: z.string().trim().min(1).max(64),
    discipline: z.enum(['ski', 'snowboard']),
    instructorComment: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const AdminParticipantDetailReadModelSchema = AdminParticipantListItemSchema.extend({
  profile: AdminParticipantProfileProjectionSchema,
  managers: z.array(AdminIdentityManagingAccountSummarySchema).max(8),
  instructorRelationshipCount: z.number().int().nonnegative(),
  diagnostics: z.array(IdentityDiagnosticSchema).max(32),
  archiveBlockedByCommitments: z.boolean(),
}).strict();

export type AdminParticipantDetailReadModel = z.output<typeof AdminParticipantDetailReadModelSchema>;

export const AdminInstructorListItemSchema = z
  .object({
    instructorId: InstructorIdSchema,
    name: z.string().trim().min(1).max(200),
    specialty: InstructorCatalogSpecialtySchema.optional(),
    isAvailable: z.boolean(),
    linkedAccountId: AccountIdSchema.optional(),
    linkedAccountDisplayName: z.string().trim().min(1).max(200).optional(),
    pricePerHourKZT: z.number().finite().int().positive().optional(),
    courseRosterCount: z.number().int().nonnegative(),
    courseDayAssignmentCount: z.number().int().nonnegative(),
    revision: AggregateRevisionSchema,
    authorizedActions: z.array(AdminIdentityAuthorizedActionSchema).max(8),
  })
  .strict();

export type AdminInstructorListItem = z.output<typeof AdminInstructorListItemSchema>;

export const AdminInstructorDetailReadModelSchema = AdminInstructorListItemSchema.extend({
  bio: z.string().trim().max(4_000).optional(),
  avatarUrl: z.string().trim().min(1).max(2_000).optional(),
  phoneNumber: z.string().trim().max(32).optional(),
  languages: z.array(z.string()).max(16).optional(),
  experienceYears: z.number().finite().int().min(0).max(80).optional(),
  linkedAccountLifecycle: z.enum(['active', 'disabled', 'uninitialized']).optional(),
  futureLessonCommitmentCount: z.number().int().nonnegative(),
  futureCourseDayAssignmentCount: z.number().int().nonnegative(),
  unlinkBlockedByCommitments: z.boolean(),
  diagnostics: z.array(IdentityDiagnosticSchema).max(32),
}).strict();

export type AdminInstructorDetailReadModel = z.output<typeof AdminInstructorDetailReadModelSchema>;

export const AdminEligibleParticipantItemSchema = z
  .object({
    participantId: ParticipantIdSchema,
    participantManagementId: ParticipantManagementIdSchema,
    displayName: z.string().trim().min(1).max(200),
    authority: z.enum(['self', 'parent_guardian']),
    revision: AggregateRevisionSchema,
    lifecycle: z.literal('active'),
  })
  .strict();

export type AdminEligibleParticipantItem = z.output<typeof AdminEligibleParticipantItemSchema>;

const listInputBase = {
  search: z.string().trim().min(1).max(200).optional(),
  pageSize: pageSizeSchema,
  cursor: z.string().trim().min(1).max(512).optional(),
  idempotencyKey: IdempotencyKeySchema.optional(),
} as const;

export const QueryAdminIdentityReadModelsInputSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('admin_account_list'),
      ...listInputBase,
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_account_detail'),
      accountId: AccountIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_participant_list'),
      ...listInputBase,
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_participant_detail'),
      participantId: ParticipantIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_instructor_list'),
      ...listInputBase,
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_instructor_detail'),
      instructorId: InstructorIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_eligible_participants'),
      accountId: AccountIdSchema,
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
]);

export type QueryAdminIdentityReadModelsInput = z.output<
  typeof QueryAdminIdentityReadModelsInputSchema
>;

export const QueryAdminIdentityReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('admin_account_list'),
      items: z.array(AdminAccountListItemSchema).max(ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_account_detail'),
      item: AdminAccountDetailReadModelSchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_participant_list'),
      items: z.array(AdminParticipantListItemSchema).max(ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_participant_detail'),
      item: AdminParticipantDetailReadModelSchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_instructor_list'),
      items: z.array(AdminInstructorListItemSchema).max(ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX),
      nextCursor: z.string().trim().min(1).max(512).optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_instructor_detail'),
      item: AdminInstructorDetailReadModelSchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('admin_eligible_participants'),
      accountId: AccountIdSchema,
      items: z.array(AdminEligibleParticipantItemSchema).max(50),
    })
    .strict(),
]);

export type QueryAdminIdentityReadModelsResult = z.output<
  typeof QueryAdminIdentityReadModelsResultSchema
>;

export function encodeAdminIdentityListCursor(input: {
  readonly documentId: string;
  readonly sortKey?: string;
}): string {
  return Buffer.from(
    JSON.stringify(
      input.sortKey === undefined
        ? { documentId: input.documentId }
        : { documentId: input.documentId, sortKey: input.sortKey }
    ),
    'utf8'
  ).toString('base64url');
}

export function decodeAdminIdentityListCursor(cursor: string): {
  readonly documentId: string;
  readonly sortKey?: string;
} {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    readonly documentId?: unknown;
    readonly sortKey?: unknown;
  };
  if (typeof parsed.documentId !== 'string' || parsed.documentId.length === 0) {
    throw new Error('invalid_cursor');
  }
  return {
    documentId: parsed.documentId,
    ...(typeof parsed.sortKey === 'string' && parsed.sortKey.length > 0
      ? { sortKey: parsed.sortKey }
      : {}),
  };
}
