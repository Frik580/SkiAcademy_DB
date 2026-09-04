import { z } from 'zod';
import type { Account } from './accountParticipantAccess';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
} from './identifiers';
import { AggregateRevisionSchema } from './primitives';

export const ACCOUNT_ROLES = ['user', 'admin'] as const;
export const AccountRoleSchema = z.enum(ACCOUNT_ROLES);
export type AccountRole = z.output<typeof AccountRoleSchema>;

export const InstructorCatalogSpecialtySchema = z.enum(['ski', 'snowboard', 'both']);

export const InstructorCatalogEntrySchema = z
  .object({
    instructorId: InstructorIdSchema,
    name: z.string().trim().min(1).max(200),
    specialty: InstructorCatalogSpecialtySchema.optional(),
    languages: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
    experienceYears: z.number().finite().int().min(0).max(80).optional(),
    bio: z.string().trim().max(4_000).optional(),
    avatarUrl: z.string().trim().min(1).max(2_000).optional(),
    pricePerHourKZT: z.number().finite().int().positive().optional(),
    pricePerHour: z.number().finite().positive().optional(),
    phoneNumber: z.string().trim().max(32).optional(),
    isAvailable: z.boolean(),
    rating: z.number().finite().min(0).max(5).optional(),
    reviewsCount: z.number().finite().int().min(0).optional(),
    revision: AggregateRevisionSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.pricePerHourKZT === undefined && entry.pricePerHour === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['pricePerHourKZT'],
        message: 'Catalog entry requires a price',
      });
    }
  });

export type InstructorCatalogEntry = Readonly<z.output<typeof InstructorCatalogEntrySchema>>;

export function parseInstructorCatalogRevision(
  data: Record<string, unknown> | undefined
): z.output<typeof AggregateRevisionSchema> {
  const revision = data?.revision;
  if (typeof revision === 'number' && Number.isInteger(revision) && revision >= 1) {
    return AggregateRevisionSchema.parse(revision);
  }
  return AggregateRevisionSchema.parse(1);
}

export const IDENTITY_DIAGNOSTIC_TYPES = [
  'missing_canonical_account_fields',
  'account_missing_self_participant',
  'conflicting_self_participants',
  'missing_active_management',
  'invalid_management_account_reference',
  'duplicate_active_management',
  'missing_owner_guard',
  'mismatched_owner_guard',
  'instructor_catalog_missing_for_link',
  'account_instructor_link_mismatch',
  'dangling_instructor_relationship',
  'duplicate_participant_unresolved',
] as const;

export const IdentityDiagnosticTypeSchema = z.enum(IDENTITY_DIAGNOSTIC_TYPES);
export type IdentityDiagnosticType = z.output<typeof IdentityDiagnosticTypeSchema>;

export const IDENTITY_DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;
export const IdentityDiagnosticSeveritySchema = z.enum(IDENTITY_DIAGNOSTIC_SEVERITIES);

export const IdentityDiagnosticSchema = z
  .object({
    diagnosticType: IdentityDiagnosticTypeSchema,
    severity: IdentityDiagnosticSeveritySchema,
    subject: z.string().trim().min(1).max(256),
    evidence: z.string().trim().min(1).max(1_000),
    safeRepairAvailable: z.boolean(),
    safeRepairKind: z
      .enum(['provision_self_participant_for_account', 'repair_participant_management_owner_guard'])
      .optional(),
  })
  .strict();

export type IdentityDiagnostic = z.output<typeof IdentityDiagnosticSchema>;

export function evaluateChangeAccountRole(input: {
  readonly actorSystemRole: 'owner' | undefined;
  readonly actorAccountId: Account['accountId'];
  readonly targetAccountId: Account['accountId'];
  readonly targetSystemRole: 'owner' | undefined;
  readonly nextRole: AccountRole;
}): 'allowed' | 'actor_not_owner' | 'target_is_owner' | 'self_demotion_forbidden' {
  if (input.actorSystemRole !== 'owner') {
    return 'actor_not_owner';
  }
  if (input.targetSystemRole === 'owner') {
    return 'target_is_owner';
  }
  if (input.actorAccountId === input.targetAccountId && input.nextRole !== 'admin') {
    return 'self_demotion_forbidden';
  }
  return 'allowed';
}

export function evaluateDisableAccount(input: {
  readonly targetSystemRole: 'owner' | undefined;
}): 'allowed' | 'system_owner_protected' {
  return input.targetSystemRole === 'owner' ? 'system_owner_protected' : 'allowed';
}

export function evaluateAdminManagementAssignment(input: {
  readonly participantManagementKind: 'unmanaged_guest' | 'managed';
  readonly initialManagementEligibleAccountId?: Account['accountId'];
  readonly targetAccountId: Account['accountId'];
  readonly targetAccountActive: boolean;
}):
  | 'allowed'
  | 'already_managed'
  | 'target_inactive'
  | 'eligible_account_mismatch' {
  if (!input.targetAccountActive) {
    return 'target_inactive';
  }
  if (input.participantManagementKind === 'managed') {
    return 'already_managed';
  }
  if (
    input.initialManagementEligibleAccountId !== undefined &&
    input.initialManagementEligibleAccountId !== input.targetAccountId
  ) {
    return 'eligible_account_mismatch';
  }
  return 'allowed';
}

export function evaluateAdminManagementRevocation(input: {
  readonly authority: 'self' | 'parent_guardian';
}): 'allowed' | 'self_management_forbidden' {
  return input.authority === 'self' ? 'self_management_forbidden' : 'allowed';
}

export const PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT = 32;

export function participantArchiveBlockedByCommitments(input: {
  readonly bookings: readonly { readonly lifecycle: { readonly status: string } }[];
  readonly enrollments: readonly { readonly lifecycle: { readonly status: string } }[];
  readonly bookingScanCapped: boolean;
  readonly enrollmentScanCapped: boolean;
  readonly unparsedCommitmentCount?: number;
}): boolean {
  if (input.bookingScanCapped || input.enrollmentScanCapped) {
    return true;
  }
  if ((input.unparsedCommitmentCount ?? 0) > 0) {
    return true;
  }
  return (
    input.bookings.some((booking) => {
      const status = booking.lifecycle.status;
      return status !== 'cancelled' && status !== 'completed' && status !== 'no_show';
    }) ||
    input.enrollments.some((enrollment) => {
      const status = enrollment.lifecycle.status;
      return (
        status !== 'cancelled' &&
        status !== 'withdrawn' &&
        status !== 'completed' &&
        status !== 'no_show'
      );
    })
  );
}

export const AdminIdentityAuthorizedActionKindSchema = z.enum([
  'disable_account',
  'enable_account',
  'change_account_role',
  'update_account_contact_as_administrator',
  'archive_participant',
  'reactivate_participant',
  'update_participant_profile',
  'assign_participant_management_as_administrator',
  'revoke_participant_management',
  'create_managed_dependent_participant',
  'provision_self_participant_for_account',
  'repair_participant_management_owner_guard',
  'create_instructor_catalog_entry',
  'update_instructor_catalog_profile',
  'deactivate_instructor_catalog',
  'reactivate_instructor_catalog',
  'link_account_instructor_catalog',
  'unlink_account_instructor_catalog',
]);

export type AdminIdentityAuthorizedActionKind = z.output<
  typeof AdminIdentityAuthorizedActionKindSchema
>;

export const AdminIdentityAuthorizedActionSchema = z
  .object({
    kind: AdminIdentityAuthorizedActionKindSchema,
    expectedRevision: AggregateRevisionSchema,
    expectedSecondaryRevision: AggregateRevisionSchema.optional(),
  })
  .strict();

export type AdminIdentityAuthorizedAction = z.output<typeof AdminIdentityAuthorizedActionSchema>;

export const AdminIdentityAccountRoleProjectionSchema = z
  .object({
    role: AccountRoleSchema,
    systemRole: z.literal('owner').optional(),
  })
  .strict();

export const AdminIdentityInstructorLinkProjectionSchema = z
  .object({
    instructorId: InstructorIdSchema.optional(),
    isInstructor: z.boolean(),
  })
  .strict();

export const AdminIdentityManagedParticipantSummarySchema = z
  .object({
    participantId: ParticipantIdSchema,
    participantManagementId: ParticipantManagementIdSchema,
    displayName: z.string().trim().min(1).max(200),
    authority: z.enum(['self', 'parent_guardian']),
    lifecycle: z.enum(['active', 'archived']),
    revision: AggregateRevisionSchema,
    skillLevel: z.string().trim().min(1).max(64).optional(),
    discipline: z.enum(['ski', 'snowboard']).optional(),
    age: z
      .discriminatedUnion('kind', [
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
      ])
      .optional(),
  })
  .strict();

export const AdminIdentityManagingAccountSummarySchema = z
  .object({
    accountId: AccountIdSchema,
    participantManagementId: ParticipantManagementIdSchema,
    displayName: z.string().trim().min(1).max(200),
    authority: z.enum(['self', 'parent_guardian']),
    managementRevision: AggregateRevisionSchema,
  })
  .strict();

export function diagnoseAccountIdentity(input: {
  readonly profileExists: boolean;
  readonly account?: Pick<Account, 'accountId' | 'lifecycle'>;
  readonly activeSelfManagementCount: number;
  readonly activeManagementCount: number;
  readonly ownerGuardMatchesUniqueSelf: boolean;
  readonly ownerGuardPresent: boolean;
  readonly linkedInstructorId?: string;
  readonly instructorCatalogExists: boolean;
}): IdentityDiagnostic[] {
  const diagnostics: IdentityDiagnostic[] = [];
  if (!input.profileExists) {
    return diagnostics;
  }
  if (!input.account) {
    diagnostics.push({
      diagnosticType: 'missing_canonical_account_fields',
      severity: 'warning',
      subject: 'account',
      evidence: 'users document exists without canonical Account fields',
      safeRepairAvailable: false,
    });
  }
  if (input.activeSelfManagementCount === 0) {
    diagnostics.push({
      diagnosticType: 'account_missing_self_participant',
      severity: 'warning',
      subject: 'participant_management',
      evidence: 'no active self ParticipantManagement for this Account',
      safeRepairAvailable: true,
      safeRepairKind: 'provision_self_participant_for_account',
    });
  }
  if (input.activeSelfManagementCount > 1) {
    diagnostics.push({
      diagnosticType: 'conflicting_self_participants',
      severity: 'error',
      subject: 'participant_management',
      evidence: 'more than one active self ParticipantManagement',
      safeRepairAvailable: false,
    });
  }
  if (
    input.activeSelfManagementCount === 1 &&
    !input.ownerGuardPresent
  ) {
    diagnostics.push({
      diagnosticType: 'missing_owner_guard',
      severity: 'warning',
      subject: 'participant_management_active_owner',
      evidence: 'active self management exists without owner guard',
      safeRepairAvailable: true,
      safeRepairKind: 'repair_participant_management_owner_guard',
    });
  }
  if (
    input.activeSelfManagementCount === 1 &&
    input.ownerGuardPresent &&
    !input.ownerGuardMatchesUniqueSelf
  ) {
    diagnostics.push({
      diagnosticType: 'mismatched_owner_guard',
      severity: 'error',
      subject: 'participant_management_active_owner',
      evidence: 'owner guard does not match the unique self management',
      safeRepairAvailable: false,
    });
  }
  if (input.linkedInstructorId && !input.instructorCatalogExists) {
    diagnostics.push({
      diagnosticType: 'instructor_catalog_missing_for_link',
      severity: 'warning',
      subject: 'instructor',
      evidence: 'Account.instructorId has no matching catalog entry',
      safeRepairAvailable: false,
    });
  }
  return diagnostics;
}

export function diagnoseParticipantIdentity(input: {
  readonly participantId: string;
  readonly managementKind: 'unmanaged_guest' | 'managed';
  readonly activeManagementCount: number;
  readonly ownerGuardPresent: boolean;
  readonly ownerGuardMatchesUniqueOwner: boolean;
}): IdentityDiagnostic[] {
  const diagnostics: IdentityDiagnostic[] = [];
  if (input.managementKind === 'managed' && input.activeManagementCount === 0) {
    diagnostics.push({
      diagnosticType: 'missing_active_management',
      severity: 'error',
      subject: `participant:${input.participantId}`,
      evidence: 'Participant is marked managed without active ParticipantManagement',
      safeRepairAvailable: false,
    });
  }
  if (input.activeManagementCount > 1) {
    diagnostics.push({
      diagnosticType: 'duplicate_active_management',
      severity: 'error',
      subject: `participant:${input.participantId}`,
      evidence: 'more than one active ParticipantManagement owner',
      safeRepairAvailable: false,
    });
  }
  if (
    input.managementKind === 'managed' &&
    input.activeManagementCount === 1 &&
    !input.ownerGuardPresent
  ) {
    diagnostics.push({
      diagnosticType: 'missing_owner_guard',
      severity: 'warning',
      subject: `participant:${input.participantId}`,
      evidence: 'unique active owner exists without owner guard',
      safeRepairAvailable: true,
      safeRepairKind: 'repair_participant_management_owner_guard',
    });
  }
  if (
    input.managementKind === 'managed' &&
    input.activeManagementCount === 1 &&
    input.ownerGuardPresent &&
    !input.ownerGuardMatchesUniqueOwner
  ) {
    diagnostics.push({
      diagnosticType: 'mismatched_owner_guard',
      severity: 'error',
      subject: `participant:${input.participantId}`,
      evidence: 'owner guard does not uniquely match the active owner',
      safeRepairAvailable: false,
    });
  }
  return diagnostics;
}
