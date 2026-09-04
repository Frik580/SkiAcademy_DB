import {
  AccountIdSchema,
  AggregateRevisionSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../../lib/canonical/canonicalCommandClient';
import {
  mapCanonicalCommandResultError,
  toCanonicalCommandClientError,
} from '../../../lib/canonical/mapCanonicalCommandError';
import type { AdminIdentityAttempt } from './identityContracts';

async function assertSucceeded<Kind extends CommandKind>(
  command: Promise<CommandResult<Kind>>
): Promise<void> {
  const result = await command;
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
}

export async function executeAdminIdentityAttempt(
  adminAccountId: string,
  attempt: AdminIdentityAttempt
): Promise<void> {
  const expectedRevision = AggregateRevisionSchema.parse(attempt.expectedRevision);
  const reasonExplanation = attempt.reasonExplanation;
  try {
    if (attempt.kind === 'disable_account' || attempt.kind === 'enable_account') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: { accountId: AccountIdSchema.parse(attempt.accountId), reasonExplanation },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'change_account_role') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            accountId: AccountIdSchema.parse(attempt.accountId),
            role: attempt.role ?? 'user',
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'update_account_contact_as_administrator') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            accountId: AccountIdSchema.parse(attempt.accountId),
            displayName: attempt.displayName,
            reasonExplanation,
            ...(attempt.phoneNumber === undefined ? {} : { phoneNumber: attempt.phoneNumber }),
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'archive_participant' || attempt.kind === 'reactivate_participant') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantId: ParticipantIdSchema.parse(attempt.participantId),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'update_participant_profile') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantId: ParticipantIdSchema.parse(attempt.participantId),
            ...(attempt.displayName === undefined ? {} : { displayName: attempt.displayName }),
            ...(attempt.birthDate
              ? { age: { kind: 'birth_date' as const, birthDate: attempt.birthDate } }
              : {}),
            ...(attempt.skillLevel === undefined ? {} : { skillLevel: attempt.skillLevel }),
            ...(attempt.discipline === undefined ? {} : { discipline: attempt.discipline }),
            ...(attempt.instructorComment === undefined
              ? {}
              : { instructorComment: attempt.instructorComment }),
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
          administratorContext: true,
        })
      );
      return;
    }
    if (attempt.kind === 'assign_participant_management_as_administrator') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantManagementId: ParticipantManagementIdSchema.parse(
              attempt.participantManagementId
            ),
            participantId: ParticipantIdSchema.parse(attempt.participantId),
            accountId: AccountIdSchema.parse(attempt.accountId),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'revoke_participant_management') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantManagementId: ParticipantManagementIdSchema.parse(
              attempt.participantManagementId
            ),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
          administratorContext: true,
        })
      );
      return;
    }
    if (attempt.kind === 'create_managed_dependent_participant') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantId: ParticipantIdSchema.parse(attempt.participantId),
            participantManagementId: ParticipantManagementIdSchema.parse(
              attempt.participantManagementId
            ),
            accountId: AccountIdSchema.parse(attempt.accountId),
            displayName: attempt.displayName,
            age: { kind: 'birth_date', birthDate: attempt.birthDate },
            skillLevel: attempt.skillLevel,
            discipline: attempt.discipline,
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'provision_self_participant_for_account') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            accountId: AccountIdSchema.parse(attempt.accountId),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
        })
      );
      return;
    }
    if (attempt.kind === 'repair_participant_management_owner_guard') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            participantId: ParticipantIdSchema.parse(attempt.participantId),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (attempt.kind === 'create_instructor_catalog_entry') {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            instructorId: InstructorIdSchema.parse(attempt.instructorId),
            name: attempt.name ?? attempt.instructorId,
            pricePerHourKZT: attempt.pricePerHourKZT ?? 1,
            reasonExplanation,
            ...(attempt.accountId === undefined
              ? {}
              : { accountId: AccountIdSchema.parse(attempt.accountId) }),
            ...(attempt.specialty === undefined ? {} : { specialty: attempt.specialty }),
            ...(attempt.languages === undefined ? {} : { languages: [...attempt.languages] }),
            ...(attempt.experienceYears === undefined
              ? {}
              : { experienceYears: attempt.experienceYears }),
            ...(attempt.bio === undefined ? {} : { bio: attempt.bio }),
            ...(attempt.avatarUrl === undefined ? {} : { avatarUrl: attempt.avatarUrl }),
            ...(attempt.phoneNumber === undefined ? {} : { phoneNumber: attempt.phoneNumber }),
          },
          idempotencyKey: attempt.idempotencyKey,
          ...(attempt.accountId === undefined ? {} : { expectedRevision }),
        })
      );
      return;
    }
    if (
      attempt.kind === 'update_instructor_catalog_profile' ||
      attempt.kind === 'deactivate_instructor_catalog' ||
      attempt.kind === 'reactivate_instructor_catalog'
    ) {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            instructorId: InstructorIdSchema.parse(attempt.instructorId),
            reasonExplanation,
            ...(attempt.kind === 'update_instructor_catalog_profile'
              ? {
                  ...(attempt.name === undefined ? {} : { name: attempt.name }),
                  ...(attempt.pricePerHourKZT === undefined
                    ? {}
                    : { pricePerHourKZT: attempt.pricePerHourKZT }),
                  ...(attempt.specialty === undefined ? {} : { specialty: attempt.specialty }),
                  ...(attempt.languages === undefined ? {} : { languages: [...attempt.languages] }),
                  ...(attempt.experienceYears === undefined
                    ? {}
                    : { experienceYears: attempt.experienceYears }),
                  ...(attempt.bio === undefined ? {} : { bio: attempt.bio }),
                  ...(attempt.avatarUrl === undefined ? {} : { avatarUrl: attempt.avatarUrl }),
                  ...(attempt.phoneNumber === undefined
                    ? {}
                    : { phoneNumber: attempt.phoneNumber }),
                }
              : {}),
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
      return;
    }
    if (
      attempt.kind === 'link_account_instructor_catalog' ||
      attempt.kind === 'unlink_account_instructor_catalog'
    ) {
      await assertSucceeded(
        executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: attempt.kind,
          intent: {
            accountId: AccountIdSchema.parse(attempt.accountId),
            instructorId: InstructorIdSchema.parse(attempt.instructorId),
            reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision,
        })
      );
    }
  } catch (error) {
    throw toCanonicalCommandClientError(error, 'admin_identity');
  }
}
