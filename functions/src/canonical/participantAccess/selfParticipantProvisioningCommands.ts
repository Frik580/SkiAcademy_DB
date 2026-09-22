import {
  AccountSchema,
  AggregateRevisionSchema,
  CanonicalCommandError,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  participantManagementIdFromSelfProvisioning,
  resolveCommandIdempotencyIdentity,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type Account,
  type AccountId,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CanonicalExecutionScope,
  type CommandResult,
  type Participant,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  commitAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
} from '../resourceClaims/uniquenessGuards';
import { buildParticipantAccessAuditPlan } from './participantAccessAudit';
import { assertAdministrator, requireAccountActor } from './participantAccessAuthorization';
import {
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
  accountPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipant,
  parseParticipantManagement,
  participantManagementActiveOwnerPath,
  participantManagementPath,
  participantPath,
} from './participantAccessStore';

const DEFAULT_SELF_PARTICIPANT_AGE_YEARS = 18;
const DEFAULT_SELF_PARTICIPANT_SKILL_LEVEL = 'beginner';
const DEFAULT_SELF_PARTICIPANT_DISCIPLINE = 'ski' as const;

type SelfProvisioningKind = 'provision_self_participant' | 'provision_self_participant_for_account';

type SelfIdentityProjectionRepair = {
  readonly displayName?: string;
  readonly avatarUrl?: string;
};

function provisioningConflict(envelope: CommandEnvelope<SelfProvisioningKind>): never {
  throw new CanonicalCommandError('blocked_relationship', {
    correlationId: envelope.context.correlationId,
    details: { resourceKind: 'participant', reason: 'conflict' },
  });
}

function isAlreadyExistsCommitConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === 6 || code === 'already-exists';
}

function readDisplayName(
  envelope: CommandEnvelope<SelfProvisioningKind>,
  profile: Record<string, unknown>
): string {
  const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  if (!displayName) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'displayName', reason: 'required' },
    });
  }
  return displayName;
}

function readProfileDisplayName(profile: Record<string, unknown>): string {
  return typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
}

function readProfileAvatarUrl(profile: Record<string, unknown>): string {
  return typeof profile.avatarUrl === 'string' ? profile.avatarUrl.trim() : '';
}

/**
 * Canonical self Participant wins. Never copies UserProfile fields back onto Participant.
 * Avatar is repaired only when Participant already has avatarUrl.
 */
export function buildSelfIdentityProjectionRepair(
  profile: Record<string, unknown>,
  selfParticipant: Pick<Participant, 'displayName' | 'avatarUrl'>
): SelfIdentityProjectionRepair | undefined {
  const patch: { displayName?: string; avatarUrl?: string } = {};

  if (readProfileDisplayName(profile) !== selfParticipant.displayName) {
    patch.displayName = selfParticipant.displayName;
  }

  const canonicalAvatar = selfParticipant.avatarUrl?.trim();
  if (canonicalAvatar && readProfileAvatarUrl(profile) !== canonicalAvatar) {
    patch.avatarUrl = canonicalAvatar;
  }

  return patch.displayName !== undefined || patch.avatarUrl !== undefined ? patch : undefined;
}

function persistentTestAccountMatchesExecution(
  profile: Record<string, unknown>,
  scope: CanonicalExecutionScope
): boolean {
  if (scope.dataScope !== 'test' || profile.dataScope !== 'test') return false;
  const testSessionId = profile.testSessionId;
  return testSessionId === undefined || testSessionId === scope.testSessionId;
}

function assertProfileCanProvision(
  envelope: CommandEnvelope<SelfProvisioningKind>,
  profile: Record<string, unknown>
): void {
  if (profile.isClientActive === false) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  const lifecycle = profile.lifecycle;
  if (
    lifecycle !== null &&
    typeof lifecycle === 'object' &&
    (lifecycle as { readonly status?: unknown }).status === 'disabled'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

function provisionSelfForTargetAccount<Kind extends SelfProvisioningKind>(
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  targetAccountId: AccountId
): Promise<CommandResult<Kind>> {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const resolveExistingTestIdentity = environment.scope?.dataScope === 'test';
  const deterministicParticipantId = selfParticipantIdFromAccountId(targetAccountId);
  const deterministicManagementId = participantManagementIdFromSelfProvisioning(targetAccountId);

  let accountRecord: Account | undefined;
  let accountNeedsInitialization = false;
  let accountNeedsScopeRepair = false;
  let profileData: Record<string, unknown> = {};
  let participantRecord!: Participant;
  let managementRecord!: ParticipantManagement;
  let shouldCreateSelfParticipant = false;
  let projectionRepair: SelfIdentityProjectionRepair | undefined;
  let plannedOwnerGuard:
    | Awaited<ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>>
    | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind> = {
    read: async (session) => {
      accountNeedsInitialization = false;
      accountNeedsScopeRepair = false;
      shouldCreateSelfParticipant = false;
      projectionRepair = undefined;
      plannedOwnerGuard = undefined;
      const userPath = accountPath(targetAccountId);
      const accountRead = await session.tx.get({ path: userPath });
      session.plan.planRead({ path: userPath, category: 'authorization_check' });
      if (!accountRead.exists || !accountRead.data) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      profileData = accountRead.data;
      assertProfileCanProvision(envelope, profileData);
      accountRecord = parseAccount(profileData);
      if (accountRecord?.lifecycle.status === 'disabled') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      if (resolveExistingTestIdentity) {
        if (
          !accountRecord ||
          !environment.scope ||
          !persistentTestAccountMatchesExecution(profileData, environment.scope)
        ) {
          throw new CanonicalCommandError('cross_scope_forbidden', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'conflict' },
          });
        }
        accountNeedsInitialization = false;
      } else {
        if (
          (profileData.dataScope !== undefined && profileData.dataScope !== 'live') ||
          profileData.testSessionId !== undefined
        ) {
          throw new CanonicalCommandError('cross_scope_forbidden', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'conflict' },
          });
        }
        accountNeedsInitialization = accountRecord === undefined;
        accountNeedsScopeRepair = profileData.dataScope === undefined;
        if (accountNeedsInitialization || accountNeedsScopeRepair) {
          session.plan.planMutation({
            path: userPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
          });
        }
      }

      const managementDocuments = await session.tx.query({
        collection: 'participant_management',
        where: { field: 'accountId', op: '==', value: targetAccountId },
      });
      session.plan.planRead({
        path: 'participant_management/query_by_account',
        category: 'authorization_check',
      });

      const activeSelfDocuments = managementDocuments.filter(
        (document) => document.data?.authority === 'self' && document.data?.status === 'active'
      );
      if (activeSelfDocuments.length > 1) {
        provisioningConflict(envelope);
      }

      if (activeSelfDocuments.length === 1) {
        const managementDocument = activeSelfDocuments[0]!;
        session.plan.planRead({
          path: managementDocument.path,
          category: 'authorization_check',
        });
        const existingManagement = parseParticipantManagement(managementDocument.data);
        if (!existingManagement || existingManagement.accountId !== targetAccountId) {
          provisioningConflict(envelope);
        }

        const existingParticipantRead = await session.tx.get({
          path: participantPath(existingManagement.participantId),
        });
        session.plan.planRead({
          path: participantPath(existingManagement.participantId),
          category: 'aggregate',
        });
        const existingParticipant = parseParticipant(
          existingParticipantRead.exists ? existingParticipantRead.data : undefined
        );
        if (
          !existingParticipant ||
          existingParticipant.lifecycle.status !== 'active' ||
          existingParticipant.management.kind !== 'managed' ||
          existingParticipant.management.participantManagementId !==
            existingManagement.participantManagementId
        ) {
          provisioningConflict(envelope);
        }

        const ownerGuardRead = await session.tx.get({
          path: participantManagementActiveOwnerPath(existingParticipant.participantId),
        });
        session.plan.planRead({
          path: participantManagementActiveOwnerPath(existingParticipant.participantId),
          category: 'authorization_check',
        });
        const ownerGuard = parseActiveOwnerGuard(
          ownerGuardRead.exists ? ownerGuardRead.data : undefined
        );
        if (
          !ownerGuard ||
          ownerGuard.accountId !== targetAccountId ||
          ownerGuard.participantManagementId !== existingManagement.participantManagementId
        ) {
          provisioningConflict(envelope);
        }

        participantRecord = existingParticipant;
        managementRecord = existingManagement;
        // TEST login resolves the provisioned identity. It does not repair the
        // account mirror, which would mutate persistent TestActor identity.
        projectionRepair = resolveExistingTestIdentity
          ? undefined
          : buildSelfIdentityProjectionRepair(profileData, existingParticipant);
        if (projectionRepair && !accountNeedsInitialization && !accountNeedsScopeRepair) {
          session.plan.planMutation({
            path: userPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
          });
        }
        return;
      }

      if (resolveExistingTestIdentity) {
        provisioningConflict(envelope);
      }

      const participantRead = await session.tx.get({
        path: participantPath(deterministicParticipantId),
      });
      session.plan.planRead({
        path: participantPath(deterministicParticipantId),
        category: 'aggregate',
      });
      const managementRead = await session.tx.get({
        path: participantManagementPath(deterministicManagementId),
      });
      session.plan.planRead({
        path: participantManagementPath(deterministicManagementId),
        category: 'aggregate',
      });
      if (participantRead.exists || managementRead.exists) {
        provisioningConflict(envelope);
      }

      shouldCreateSelfParticipant = true;
      plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
        correlationId: envelope.context.correlationId,
        commandId: identity.commandKey,
        decidedAt: environment.clock.decidedAt(),
        participantId: deterministicParticipantId,
        accountId: targetAccountId,
        participantManagementId: deterministicManagementId,
        managementRevision: AggregateRevisionSchema.parse(1),
      });

      session.plan.planMutation({
        path: participantPath(deterministicParticipantId),
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
      session.plan.planMutation({
        path: participantManagementPath(deterministicManagementId),
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
      });

      const decidedAt = timestampFromDate(environment.clock.decidedAt());
      // Seed self Participant.displayName from the account profile so create-time
      // invariant Participant.displayName === UserProfile.displayName holds.
      participantRecord = {
        participantId: deterministicParticipantId,
        dataScope: 'live',
        displayName: readDisplayName(envelope, profileData),
        age: { kind: 'age_years', years: DEFAULT_SELF_PARTICIPANT_AGE_YEARS },
        skillLevel: DEFAULT_SELF_PARTICIPANT_SKILL_LEVEL,
        discipline: DEFAULT_SELF_PARTICIPANT_DISCIPLINE,
        management: {
          kind: 'managed',
          participantManagementId: deterministicManagementId,
        },
        lifecycle: { status: 'active' },
        revision: AggregateRevisionSchema.parse(1),
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: identity.commandKey,
          lastChangedByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      };
      managementRecord = {
        participantManagementId: deterministicManagementId,
        accountId: targetAccountId,
        participantId: deterministicParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: AggregateRevisionSchema.parse(1),
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: identity.commandKey,
          lastChangedByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      };
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant',
          id: participantRecord.participantId,
          subjectKey: `participant:${participantRecord.participantId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', participantRecord.participantId),
          canonicalReference('participant_management', managementRecord.participantManagementId),
          canonicalReference('account', targetAccountId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', participantRecord.participantId),
            revision: participantRecord.revision,
          },
          {
            subject: canonicalReference(
              'participant_management',
              managementRecord.participantManagementId
            ),
            revision: managementRecord.revision,
          },
          ...(accountNeedsInitialization
            ? [
                {
                  subject: canonicalReference('account', targetAccountId),
                  revision: AggregateRevisionSchema.parse(1),
                },
              ]
            : (projectionRepair || accountNeedsScopeRepair) && accountRecord
              ? [
                  {
                    subject: canonicalReference('account', targetAccountId),
                    revision: nextAggregateRevision(accountRecord.revision),
                  },
                ]
              : []),
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const userPath = accountPath(targetAccountId);

      if (accountNeedsInitialization || accountNeedsScopeRepair || projectionRepair) {
        const accountPatch: Record<string, unknown> = {};

        if (accountNeedsInitialization) {
          const canonicalAccount = AccountSchema.parse({
            accountId: targetAccountId,
            dataScope: 'live',
            lifecycle: { status: 'active' },
            revision: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit: {
              createdByCommandId: identity.commandKey,
              lastChangedByCommandId: identity.commandKey,
              correlationId: envelope.context.correlationId,
            },
          });
          Object.assign(accountPatch, canonicalAccount);
        }

        if (accountNeedsScopeRepair) {
          accountPatch.dataScope = 'live';
        }

        if (projectionRepair) {
          if (projectionRepair.displayName !== undefined) {
            accountPatch.displayName = projectionRepair.displayName;
          }
          if (projectionRepair.avatarUrl !== undefined) {
            accountPatch.avatarUrl = projectionRepair.avatarUrl;
          }
        }

        if (!accountNeedsInitialization && accountRecord) {
          accountPatch.revision = nextAggregateRevision(accountRecord.revision);
          accountPatch.updatedAt = decidedAt;
          accountPatch.audit = {
            ...accountRecord.audit,
            lastChangedByCommandId: identity.commandKey,
            correlationId: envelope.context.correlationId,
          };
        }

        session.tx.update({ path: userPath }, accountPatch);
      }

      if (shouldCreateSelfParticipant) {
        session.tx.create(
          { path: participantPath(participantRecord.participantId) },
          participantRecord as Record<string, unknown>
        );
        session.tx.create(
          { path: participantManagementPath(managementRecord.participantManagementId) },
          managementRecord as Record<string, unknown>
        );
        commitAcquireParticipantManagementActiveOwnerGuard(
          session,
          {
            correlationId: envelope.context.correlationId,
            commandId: identity.commandKey,
            decidedAt: context.decidedAt,
            participantId: participantRecord.participantId,
            accountId: targetAccountId,
            participantManagementId: managementRecord.participantManagementId,
            managementRevision: managementRecord.revision,
          },
          plannedOwnerGuard!.guard,
          plannedOwnerGuard!.hadExisting
        );
      }

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  const executeAttempt = () =>
    executeAuthoritativeIdempotentCanonicalCommand({
      envelope,
      environment,
      executor,
      handler,
    });

  return executeAttempt().catch((error: unknown) => {
    if (!isAlreadyExistsCommitConflict(error)) throw error;
    return executeAttempt();
  });
}

export function provisionSelfParticipantHandler(
  envelope: CommandEnvelope<'provision_self_participant'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'provision_self_participant'>> {
  const actor = requireAccountActor(envelope);
  if (
    envelope.context.source !== 'client_callable' ||
    envelope.context.exercisedCapability !== 'account_owner'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  return provisionSelfForTargetAccount(envelope, environment, executor, actor.accountId);
}

export function provisionSelfParticipantForAccountHandler(
  envelope: CommandEnvelope<'provision_self_participant_for_account'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'provision_self_participant_for_account'>> {
  assertAdministrator(envelope);
  if (!envelope.intent.reasonExplanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
  return provisionSelfForTargetAccount(
    envelope,
    environment,
    executor,
    envelope.intent.accountId
  );
}

export function createSelfParticipantProvisioningCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Partial<CommandHandlerMap> {
  return {
    provision_self_participant: (envelope, environment) =>
      provisionSelfParticipantHandler(envelope, environment, executor),
    provision_self_participant_for_account: (envelope, environment) =>
      provisionSelfParticipantForAccountHandler(envelope, environment, executor),
  };
}
