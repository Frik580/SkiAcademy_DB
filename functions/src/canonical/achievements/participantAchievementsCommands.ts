import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  PARTICIPANT_ACHIEVEMENTS_MAX,
  ParticipantAchievementsSchema,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type ParticipantAchievements,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  assertAccountActive,
  assertAuthorizedParticipantManager,
  assertCapabilityMatchesManagementAuthority,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import {
  PARTICIPANT_ACHIEVEMENTS_PLANNING_ESTIMATES,
  parseParticipantAchievements,
  participantAchievementsPath,
  toFirestoreWritePayload,
} from './participantAchievementsStore';

function buildAuditPlan(input: {
  readonly envelope: CommandEnvelope<'record_participant_achievements'>;
  readonly achievements: ParticipantAchievements;
  readonly reasonCode: 'participant_management' | 'self_service_completion';
  readonly newlyEarnedCount: number;
}): AuditOutboxStagingPlan {
  const participantRef = canonicalReference('participant', input.achievements.participantId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: input.reasonCode,
      },
      primarySubject: {
        kind: 'participant',
        id: input.achievements.participantId,
        subjectKey: `participant_achievements:${input.achievements.participantId}`,
      },
      affectedSubjects: [participantRef],
      effects: [
        {
          kind: 'participant_achievements_changed',
          subjectRef: participantRef,
          summary:
            input.newlyEarnedCount === 0
              ? 'Managing account confirmed participant achievements'
              : 'Managing account recorded participant achievements',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        { subject: participantRef, revision: input.achievements.revision },
      ],
    },
    outboxObligations: [],
  };
}

function recordParticipantAchievementsHandler(
  envelope: CommandEnvelope<'record_participant_achievements'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_participant_achievements'>> {
  const actor = requireAccountActor(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const participantId = envelope.intent.participantId;
  const achievementsDocumentPath = participantAchievementsPath(participantId);
  const participantDocumentPath = participantPath(participantId);

  let current: ParticipantAchievements | undefined;
  let planned!: ParticipantAchievements;
  let newlyEarnedAchievementIds: string[] = [];
  let reasonCode: 'participant_management' | 'self_service_completion' = 'self_service_completion';
  let shouldWrite = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_participant_achievements'> =
    {
      read: async (session) => {
        const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        const account = assertAccountActive(
          envelope,
          parseAccount(accountRead.exists ? accountRead.data : undefined)
        );

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({
          path: participantDocumentPath,
          category: 'authorization_check',
        });
        const participant = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );
        if (participant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        const managementDocumentPath = participantManagementPath(
          participant.management.participantManagementId
        );
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({
          path: managementDocumentPath,
          category: 'authorization_check',
        });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!management) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const access = assertAuthorizedParticipantManager(
          envelope,
          { account, participant, management },
          participantId
        );
        if (!access.allowed) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        assertCapabilityMatchesManagementAuthority(envelope, access.authority);
        reasonCode =
          access.authority === 'parent_guardian'
            ? 'participant_management'
            : 'self_service_completion';

        const achievementsRead = await session.tx.get({ path: achievementsDocumentPath });
        session.plan.planRead({ path: achievementsDocumentPath, category: 'aggregate' });
        current = parseParticipantAchievements(
          achievementsRead.exists ? achievementsRead.data : undefined
        );
        if (achievementsRead.exists && !current) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }

        const expectedRevision = envelope.context.expectedRevision;
        if (expectedRevision === undefined) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'expectedRevision', reason: 'required' },
          });
        }
        if (current) {
          if (expectedRevision !== current.revision) {
            throw new CanonicalCommandError('stale_version', {
              correlationId: envelope.context.correlationId,
              currentRevision: current.revision,
            });
          }
        } else if (expectedRevision !== 0) {
          throw new CanonicalCommandError('stale_version', {
            correlationId: envelope.context.correlationId,
            currentRevision: AggregateRevisionSchema.parse(0),
          });
        }

        const earned = { ...(current?.earned ?? {}) };
        newlyEarnedAchievementIds = [];
        for (const item of envelope.intent.earned) {
          if (earned[item.achievementId]) continue;
          earned[item.achievementId] = {
            earnedAt: item.earnedAt,
            source: item.source,
          };
          newlyEarnedAchievementIds.push(item.achievementId);
        }

        if (Object.keys(earned).length > PARTICIPANT_ACHIEVEMENTS_MAX) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'earned', reason: 'conflict' },
          });
        }

        const decidedAt = timestampFromDate(environment.clock.now());
        shouldWrite = newlyEarnedAchievementIds.length > 0;
        const nextRevision = shouldWrite
          ? current
            ? nextAggregateRevision(current.revision)
            : AggregateRevisionSchema.parse(1)
          : (current?.revision ?? AggregateRevisionSchema.parse(1));

        planned = ParticipantAchievementsSchema.parse({
          participantId,
          earned,
          updatedBy: {
            kind: 'account',
            accountId: actor.accountId,
          },
          revision: shouldWrite || current ? nextRevision : AggregateRevisionSchema.parse(1),
          createdAt: current?.createdAt ?? decidedAt,
          updatedAt: shouldWrite ? decidedAt : (current?.updatedAt ?? decidedAt),
          audit: {
            createdByCommandId: current?.audit.createdByCommandId ?? identity.commandKey,
            lastChangedByCommandId: shouldWrite
              ? identity.commandKey
              : (current?.audit.lastChangedByCommandId ?? identity.commandKey),
            correlationId: envelope.context.correlationId,
          },
        });

        if (shouldWrite) {
          session.plan.planMutation({
            path: achievementsDocumentPath,
            kind: current ? 'update' : 'create',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACHIEVEMENTS_PLANNING_ESTIMATES.achievementsBytes,
          });
        }
      },
      planAuditOutbox: async () =>
        buildAuditPlan({
          envelope,
          achievements: planned,
          reasonCode,
          newlyEarnedCount: newlyEarnedAchievementIds.length,
        }),
      execute: async (session) => {
        if (shouldWrite) {
          const payload = toFirestoreWritePayload(planned);
          if (current) {
            session.tx.update({ path: achievementsDocumentPath }, payload);
          } else {
            session.tx.create({ path: achievementsDocumentPath }, payload);
          }
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
          participantId,
          revision: planned.revision,
          newlyEarnedAchievementIds,
        });
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createParticipantAchievementsCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'record_participant_achievements'> {
  return {
    record_participant_achievements: (envelope, environment) =>
      recordParticipantAchievementsHandler(envelope, environment, executor),
  };
}
