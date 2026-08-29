import {
  AccountSchema,
  AggregateRevisionSchema,
  CanonicalCommandError,
  canonicalReference,
  commandSuccessResult,
  participantManagementIdFromSelfProvisioning,
  resolveCommandIdempotencyIdentity,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type Account,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
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
import { requireAccountActor } from './participantAccessAuthorization';
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

function provisioningConflict(envelope: CommandEnvelope<'provision_self_participant'>): never {
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
  envelope: CommandEnvelope<'provision_self_participant'>,
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

function assertProfileCanProvision(
  envelope: CommandEnvelope<'provision_self_participant'>,
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
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const deterministicParticipantId = selfParticipantIdFromAccountId(actor.accountId);
  const deterministicManagementId = participantManagementIdFromSelfProvisioning(actor.accountId);

  let accountRecord: Account | undefined;
  let accountNeedsInitialization = false;
  let profileData: Record<string, unknown> = {};
  let participantRecord!: Participant;
  let managementRecord!: ParticipantManagement;
  let shouldCreateSelfParticipant = false;
  let plannedOwnerGuard:
    Awaited<ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'provision_self_participant'> = {
    read: async (session) => {
      accountNeedsInitialization = false;
      shouldCreateSelfParticipant = false;
      plannedOwnerGuard = undefined;
      const userPath = accountPath(actor.accountId);
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
      accountNeedsInitialization = accountRecord === undefined;
      if (accountNeedsInitialization) {
        session.plan.planMutation({
          path: userPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
        });
      }

      const managementDocuments = await session.tx.query({
        collection: 'participant_management',
        where: { field: 'accountId', op: '==', value: actor.accountId },
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
        if (!existingManagement || existingManagement.accountId !== actor.accountId) {
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
          ownerGuard.accountId !== actor.accountId ||
          ownerGuard.participantManagementId !== existingManagement.participantManagementId
        ) {
          provisioningConflict(envelope);
        }

        participantRecord = existingParticipant;
        managementRecord = existingManagement;
        return;
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
        accountId: actor.accountId,
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
      participantRecord = {
        participantId: deterministicParticipantId,
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
        accountId: actor.accountId,
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
          canonicalReference('account', actor.accountId),
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
                  subject: canonicalReference('account', actor.accountId),
                  revision: AggregateRevisionSchema.parse(1),
                },
              ]
            : []),
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      if (accountNeedsInitialization) {
        const canonicalAccount = AccountSchema.parse({
          accountId: actor.accountId,
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
        session.tx.update(
          { path: accountPath(actor.accountId) },
          canonicalAccount as Record<string, unknown>
        );
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
            accountId: actor.accountId,
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

export function createSelfParticipantProvisioningCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Partial<CommandHandlerMap> {
  return {
    provision_self_participant: (envelope, environment) =>
      provisionSelfParticipantHandler(envelope, environment, executor),
  };
}
