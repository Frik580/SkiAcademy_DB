import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  InstructorIdSchema,
  ParticipantProgressSchema,
  canonicalReference,
  commandSuccessResult,
  evaluateInstructorParticipantAccess,
  instructorRelationshipIdFromPair,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AccountId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorId,
  type Participant,
  type ParticipantBlock,
  type ParticipantProgress,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  assertInstructorCapability,
  assertParticipantActive,
  buildParticipantAccessTopology,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  instructorRelationshipPath,
  parseAccount,
  parseInstructorRelationship,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
  accountPath,
} from '../participantAccess/participantAccessStore';
import { instructorCatalogPath } from '../bookings/bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import { readInstructorProgressBookingScopedEvidence } from './participantProgressAuthorization';
import {
  PARTICIPANT_PROGRESS_PLANNING_ESTIMATES,
  parseParticipantProgress,
  participantProgressPath,
  toFirestoreWritePayload,
} from './participantProgressStore';

function resolveInstructorIdFromActorAccount(
  data: Record<string, unknown> | undefined
): InstructorId | undefined {
  if (typeof data?.instructorId !== 'string') return undefined;
  const parsed = InstructorIdSchema.safeParse(data.instructorId);
  return parsed.success ? parsed.data : undefined;
}

function resolveCatalogLinkedAccountId(
  data: Record<string, unknown> | undefined
): AccountId | undefined {
  if (typeof data?.linkedAccountId !== 'string') return undefined;
  const parsed = data.linkedAccountId;
  return parsed as AccountId;
}

function buildAuditPlan(input: {
  readonly envelope: CommandEnvelope<'update_participant_progress'>;
  readonly progress: ParticipantProgress;
}): AuditOutboxStagingPlan {
  const progressRef = canonicalReference('participant', input.progress.participantId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'instructor_evaluation',
      },
      primarySubject: {
        kind: 'participant',
        id: input.progress.participantId,
        subjectKey: `participant_progress:${input.progress.participantId}`,
      },
      affectedSubjects: [progressRef],
      effects: [
        {
          kind: 'participant_progress_changed',
          subjectRef: progressRef,
          summary: 'Instructor updated participant skill progress',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        { subject: progressRef, revision: input.progress.revision },
      ],
    },
    outboxObligations: [],
  };
}

async function assertInstructorMayUpdateParticipantProgress(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope<'update_participant_progress'>,
  input: Readonly<{
    instructorId: InstructorId;
    participant: Participant;
    at: ReturnType<typeof timestampFromDate>;
  }>
): Promise<void> {
  const relationshipDocumentPath = instructorRelationshipPath(
    instructorRelationshipIdFromPair({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
    })
  );
  const managerBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
      createdByKind: 'participant_manager',
    })
  );
  const instructorBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
      createdByKind: 'instructor',
    })
  );

  const relationshipRead = await session.tx.get({ path: relationshipDocumentPath });
  session.plan.planRead({ path: relationshipDocumentPath, category: 'authorization_check' });
  const instructorRelationship = parseInstructorRelationship(
    relationshipRead.exists ? relationshipRead.data : undefined
  );
  const managerBlockRead = await session.tx.get({ path: managerBlockPath });
  session.plan.planRead({ path: managerBlockPath, category: 'authorization_check' });
  const instructorBlockRead = await session.tx.get({ path: instructorBlockPath });
  session.plan.planRead({ path: instructorBlockPath, category: 'authorization_check' });
  const participantBlocks = [
    parseParticipantBlock(managerBlockRead.exists ? managerBlockRead.data : undefined),
    parseParticipantBlock(instructorBlockRead.exists ? instructorBlockRead.data : undefined),
  ].filter((block): block is ParticipantBlock => block !== undefined);

  let management;
  if (input.participant.management.kind === 'managed') {
    const managementDocumentPath = participantManagementPath(
      input.participant.management.participantManagementId
    );
    const managementRead = await session.tx.get({ path: managementDocumentPath });
    session.plan.planRead({ path: managementDocumentPath, category: 'authorization_check' });
    management = parseParticipantManagement(
      managementRead.exists ? managementRead.data : undefined
    );
  }

  const topology = buildParticipantAccessTopology({
    participant: input.participant,
    management,
    instructorRelationship,
    additionalBlocks: participantBlocks,
  });
  const relationshipAccess = evaluateInstructorParticipantAccess(topology, {
    instructorId: input.instructorId,
    participantId: input.participant.participantId,
    at: input.at,
    bookingScopedEvidence: [],
  });
  const bookingScopedEvidence =
    relationshipAccess.allowed && relationshipAccess.scope === 'relationship'
      ? []
      : await readInstructorProgressBookingScopedEvidence(session, {
          instructorId: input.instructorId,
          participantId: input.participant.participantId,
          at: input.at,
        });
  const access = evaluateInstructorParticipantAccess(topology, {
    instructorId: input.instructorId,
    participantId: input.participant.participantId,
    at: input.at,
    bookingScopedEvidence,
  });
  if (!access.allowed) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
}

function updateParticipantProgressHandler(
  envelope: CommandEnvelope<'update_participant_progress'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_participant_progress'>> {
  const actor = requireAccountActor(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const participantId = envelope.intent.participantId;
  const progressDocumentPath = participantProgressPath(participantId);
  const participantDocumentPath = participantPath(participantId);

  let current: ParticipantProgress | undefined;
  let planned!: ParticipantProgress;
  let instructorId!: InstructorId;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_participant_progress'> = {
    read: async (session) => {
      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const actorAccount = parseAccount(actorRead.exists ? actorRead.data : undefined);
      if (!actorAccount || actorAccount.lifecycle.status !== 'active') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const resolvedInstructorId = resolveInstructorIdFromActorAccount(
        actorRead.exists ? actorRead.data : undefined
      );
      if (!resolvedInstructorId) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'required' },
        });
      }
      assertInstructorCapability(envelope, resolvedInstructorId);
      instructorId = resolvedInstructorId;

      const catalogPath = instructorCatalogPath(instructorId);
      const catalogRead = await session.tx.get({ path: catalogPath });
      session.plan.planRead({ path: catalogPath, category: 'authorization_check' });
      if (!catalogRead.exists) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'instructor', reason: 'conflict' },
        });
      }
      const linkedAccountId = resolveCatalogLinkedAccountId(catalogRead.data);
      if (linkedAccountId && linkedAccountId !== actor.accountId) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'authorization_check' });
      const participant = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      const decidedAt = timestampFromDate(environment.clock.now());
      await assertInstructorMayUpdateParticipantProgress(session, envelope, {
        instructorId,
        participant,
        at: decidedAt,
      });

      const progressRead = await session.tx.get({ path: progressDocumentPath });
      session.plan.planRead({ path: progressDocumentPath, category: 'aggregate' });
      current = parseParticipantProgress(progressRead.exists ? progressRead.data : undefined);
      if (progressRead.exists && !current) {
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

      const nextRevision = current
        ? nextAggregateRevision(current.revision)
        : AggregateRevisionSchema.parse(1);
      planned = ParticipantProgressSchema.parse({
        participantId,
        level: envelope.intent.level,
        skillScores: envelope.intent.skillScores,
        skillComments: envelope.intent.skillComments,
        updatedBy: {
          kind: 'instructor',
          instructorId,
          accountId: actor.accountId,
        },
        revision: nextRevision,
        createdAt: current?.createdAt ?? decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: current?.audit.createdByCommandId ?? identity.commandKey,
          lastChangedByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      });

      session.plan.planMutation({
        path: progressDocumentPath,
        kind: current ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_PROGRESS_PLANNING_ESTIMATES.progressBytes,
      });
    },
    planAuditOutbox: async () => buildAuditPlan({ envelope, progress: planned }),
    execute: async (session) => {
      const payload = toFirestoreWritePayload(planned);
      if (current) {
        session.tx.update({ path: progressDocumentPath }, payload);
      } else {
        session.tx.create({ path: progressDocumentPath }, payload);
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
        participantId: planned.participantId,
        revision: planned.revision,
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

export function createParticipantProgressCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'update_participant_progress'> {
  return {
    update_participant_progress: (envelope, environment) =>
      updateParticipantProgressHandler(envelope, environment, executor),
  };
}
