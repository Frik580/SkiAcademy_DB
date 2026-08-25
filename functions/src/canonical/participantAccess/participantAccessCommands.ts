import {
  CanonicalCommandError,
  AggregateRevisionSchema,
  administratorCapabilityExercisedByAccount,
  canonicalReference,
  commandErrorResult,
  commandSuccessResult,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type InstructorRelationship,
  type AccountId,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  commitAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
  releaseParticipantManagementActiveOwnerGuard,
} from '../resourceClaims/uniquenessGuards';
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import { buildParticipantAccessAuditPlan } from './participantAccessAudit';
import {
  cancelledProposalIds,
  commitBlockCancellationOfOpenProposals,
  planBlockCancellationOfOpenProposals,
  type BlockCancelledOpenProposalPlan,
} from '../bookings/bookingProposalBlockCancellation';
import {
  assertAccountActive,
  assertAdministrator,
  assertAuthorizedParticipantManager,
  assertCapabilityMatchesManagementAuthority,
  assertInitialManagementAssignmentEligible,
  assertInstructorCapability,
  assertNotAdministratorForBlockMutation,
  assertParticipantActive,
  blockCreatorMatchesActor,
  requireAccountActor,
} from './participantAccessAuthorization';
import {
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
  accountPath,
  instructorRelationshipPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseInstructorRelationship,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementActiveOwnerPath,
  participantManagementPath,
  participantPath,
} from './participantAccessStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(envelope: CommandEnvelope): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

function revisionAuditLink(envelope: CommandEnvelope, metadata: CommandMetadata) {
  return {
    createdByCommandId: metadata.commandId,
    lastChangedByCommandId: metadata.commandId,
    correlationId: metadata.correlationId,
  };
}

function assignParticipantManagementHandler(
  envelope: CommandEnvelope<'assign_participant_management'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'assign_participant_management'>> {
  const metadata = metadataFromEnvelope(envelope);
  const actor = requireAccountActor(envelope);
  assertCapabilityMatchesManagementAuthority(envelope, envelope.intent.authority);

  const participantDocumentPath = participantPath(envelope.intent.participantId);
  const managementDocumentPath = participantManagementPath(envelope.intent.participantManagementId);
  const guardDocumentPath = participantManagementActiveOwnerPath(envelope.intent.participantId);

  let accountRecord: ReturnType<typeof parseAccount>;
  let participantRecord!: Participant;
  let existingManagement: ReturnType<typeof parseParticipantManagement>;
  let existingGuard: ReturnType<typeof parseActiveOwnerGuard>;
  let plannedManagementRevision = AggregateRevisionSchema.parse(1);
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'assign_participant_management'> = {
    read: async (session) => {
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
      assertAccountActive(envelope, accountRecord);

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      if (participantRecord.management.kind === 'managed') {
        throw new CanonicalCommandError('blocked_relationship', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      assertInitialManagementAssignmentEligible(envelope, participantRecord, actor.accountId);

      const managementRead = await session.tx.get({ path: managementDocumentPath });
      session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
      existingManagement = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (existingManagement?.status === 'ended') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }
      plannedManagementRevision = existingManagement
        ? nextAggregateRevision(existingManagement.revision)
        : AggregateRevisionSchema.parse(1);

      const guardRead = await session.tx.get({ path: guardDocumentPath });
      session.plan.planRead({ path: guardDocumentPath, category: 'authorization_check' });
      existingGuard = parseActiveOwnerGuard(guardRead.exists ? guardRead.data : undefined);
      if (existingGuard) {
        throw new CanonicalCommandError('blocked_relationship', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
        participantId: envelope.intent.participantId,
        accountId: actor.accountId,
        participantManagementId: envelope.intent.participantManagementId,
        managementRevision: plannedManagementRevision,
      });

      session.plan.planMutation({
        path: managementDocumentPath,
        kind: existingManagement ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
      });
      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant_management',
          id: envelope.intent.participantManagementId,
          subjectKey: `participant_management:${envelope.intent.participantManagementId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', envelope.intent.participantId),
          canonicalReference('participant_management', envelope.intent.participantManagementId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', envelope.intent.participantId),
            revision: nextAggregateRevision(participantRecord!.revision),
          },
          {
            subject: canonicalReference(
              'participant_management',
              envelope.intent.participantManagementId
            ),
            revision: plannedManagementRevision,
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const audit = revisionAuditLink(envelope, metadata);
      const management: ParticipantManagement = existingManagement
        ? {
            ...existingManagement,
            accountId: actor.accountId,
            participantId: envelope.intent.participantId,
            role: 'owner',
            authority: envelope.intent.authority,
            status: 'active',
            revision: plannedManagementRevision,
            updatedAt: decidedAt,
            audit: {
              ...existingManagement.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        : {
            participantManagementId: envelope.intent.participantManagementId,
            accountId: actor.accountId,
            participantId: envelope.intent.participantId,
            role: 'owner',
            authority: envelope.intent.authority,
            status: 'active',
            revision: plannedManagementRevision,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit,
          };

      const updatedParticipant: Participant = {
        ...participantRecord!,
        management: {
          kind: 'managed',
          participantManagementId: envelope.intent.participantManagementId,
        },
        initialManagementEligibleAccountId: CANONICAL_FIELD_DELETE as unknown as AccountId,
        revision: nextAggregateRevision(participantRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...participantRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      if (existingManagement) {
        session.tx.update({ path: managementDocumentPath }, management as Record<string, unknown>);
      } else {
        session.tx.create({ path: managementDocumentPath }, management as Record<string, unknown>);
      }
      session.tx.update(
        { path: participantDocumentPath },
        updatedParticipant as Record<string, unknown>
      );

      commitAcquireParticipantManagementActiveOwnerGuard(
        session,
        {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
          participantId: envelope.intent.participantId,
          accountId: actor.accountId,
          participantManagementId: envelope.intent.participantManagementId,
          managementRevision: plannedManagementRevision,
        },
        plannedOwnerGuard.guard,
        plannedOwnerGuard.hadExisting
      );

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function revokeParticipantManagementHandler(
  envelope: CommandEnvelope<'revoke_participant_management'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'revoke_participant_management'>> {
  const metadata = metadataFromEnvelope(envelope);
  const managementDocumentPath = participantManagementPath(envelope.intent.participantManagementId);

  let managementRecord!: ParticipantManagement;
  let participantRecord!: Participant;
  let accountRecord: ReturnType<typeof parseAccount>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'revoke_participant_management'> = {
    read: async (session) => {
      const managementRead = await session.tx.get({ path: managementDocumentPath });
      session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
      const parsedManagement = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!parsedManagement || parsedManagement.status !== 'active') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
        });
      }
      managementRecord = parsedManagement;

      const participantDocumentPath = participantPath(managementRecord.participantId);
      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      const accountRead = await session.tx.get({ path: accountPath(managementRecord.accountId) });
      session.plan.planRead({
        path: accountPath(managementRecord.accountId),
        category: 'authorization_check',
      });
      accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
      assertAccountActive(envelope, accountRecord);

      assertAuthorizedParticipantManager(
        envelope,
        {
          account: accountRecord!,
          participant: participantRecord,
          management: managementRecord,
        },
        managementRecord.participantId
      );

      session.plan.planMutation({
        path: managementDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
      });
      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
      session.plan.planMutation({
        path: participantManagementActiveOwnerPath(managementRecord.participantId),
        kind: 'delete',
        category: 'authorization_check',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant_management',
          id: envelope.intent.participantManagementId,
          subjectKey: `participant_management:${envelope.intent.participantManagementId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', managementRecord!.participantId),
          canonicalReference('participant_management', envelope.intent.participantManagementId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', managementRecord!.participantId),
            revision: nextAggregateRevision(participantRecord!.revision),
          },
          {
            subject: canonicalReference(
              'participant_management',
              envelope.intent.participantManagementId
            ),
            revision: nextAggregateRevision(managementRecord!.revision),
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const endedManagement: ParticipantManagement = {
        ...managementRecord!,
        status: 'ended',
        endedAt: decidedAt,
        revision: nextAggregateRevision(managementRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...managementRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };
      const updatedParticipant: Participant = {
        ...participantRecord!,
        management: { kind: 'unmanaged_guest' },
        revision: nextAggregateRevision(participantRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...participantRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      session.tx.update(
        { path: managementDocumentPath },
        endedManagement as Record<string, unknown>
      );
      session.tx.update(
        { path: participantPath(managementRecord!.participantId) },
        updatedParticipant as Record<string, unknown>
      );
      await releaseParticipantManagementActiveOwnerGuard(session, {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: context.decidedAt,
        participantId: managementRecord!.participantId,
      });

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: managementDocumentPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

function updateParticipantProfileHandler(
  envelope: CommandEnvelope<'update_participant_profile'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_participant_profile'>> {
  const metadata = metadataFromEnvelope(envelope);
  const participantDocumentPath = participantPath(envelope.intent.participantId);

  let participantRecord!: Participant;
  let managementRecord: ReturnType<typeof parseParticipantManagement>;
  let accountRecord: ReturnType<typeof parseAccount>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_participant_profile'> = {
    read: async (session) => {
      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      if (participantRecord.management.kind !== 'managed') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const managementRead = await session.tx.get({
        path: participantManagementPath(participantRecord.management.participantManagementId),
      });
      session.plan.planRead({
        path: participantManagementPath(participantRecord.management.participantManagementId),
        category: 'aggregate',
      });
      managementRecord = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!managementRecord || managementRecord.status !== 'active') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const accountRead = await session.tx.get({ path: accountPath(managementRecord.accountId) });
      session.plan.planRead({
        path: accountPath(managementRecord.accountId),
        category: 'authorization_check',
      });
      accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
      assertAccountActive(envelope, accountRecord);

      assertAuthorizedParticipantManager(
        envelope,
        {
          account: accountRecord!,
          participant: participantRecord,
          management: managementRecord!,
        },
        participantRecord.participantId
      );

      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant',
          id: envelope.intent.participantId,
          subjectKey: `participant:${envelope.intent.participantId}`,
        },
        affectedSubjects: [canonicalReference('participant', envelope.intent.participantId)],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', envelope.intent.participantId),
            revision: nextAggregateRevision(participantRecord!.revision),
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedParticipant: Participant = {
        ...participantRecord!,
        ...(envelope.intent.displayName === undefined
          ? {}
          : { displayName: envelope.intent.displayName }),
        ...(envelope.intent.age === undefined ? {} : { age: envelope.intent.age }),
        ...(envelope.intent.skillLevel === undefined
          ? {}
          : { skillLevel: envelope.intent.skillLevel }),
        ...(envelope.intent.discipline === undefined
          ? {}
          : { discipline: envelope.intent.discipline }),
        ...(envelope.intent.instructorComment === undefined
          ? {}
          : { instructorComment: envelope.intent.instructorComment }),
        revision: nextAggregateRevision(participantRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...participantRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      session.tx.update(
        { path: participantDocumentPath },
        updatedParticipant as Record<string, unknown>
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: participantDocumentPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

function createInstructorRelationshipHandler(
  envelope: CommandEnvelope<'create_instructor_relationship'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_instructor_relationship'>> {
  const metadata = metadataFromEnvelope(envelope);
  const expectedRelationshipId = instructorRelationshipIdFromPair({
    participantId: envelope.intent.participantId,
    instructorId: envelope.intent.instructorId,
  });
  if (envelope.intent.instructorRelationshipId !== expectedRelationshipId) {
    return Promise.resolve(
      commandErrorResult(
        envelope.kind,
        envelope.context.correlationId,
        new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorRelationshipId', reason: 'conflict' },
        }).toTransport()
      )
    );
  }

  const relationshipPath = instructorRelationshipPath(envelope.intent.instructorRelationshipId);
  const participantDocumentPath = participantPath(envelope.intent.participantId);

  let participantRecord!: Participant;
  let managementRecord: ReturnType<typeof parseParticipantManagement>;
  let accountRecord: ReturnType<typeof parseAccount>;
  let existingRelationship: InstructorRelationship | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_instructor_relationship'> =
    {
      read: async (session) => {
        const relationshipRead = await session.tx.get({ path: relationshipPath });
        session.plan.planRead({ path: relationshipPath, category: 'aggregate' });
        existingRelationship = parseInstructorRelationship(
          relationshipRead.exists ? relationshipRead.data : undefined
        );
        if (existingRelationship?.status === 'active') {
          return;
        }

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        participantRecord = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );

        if (envelope.intent.basis.kind === 'guardian_permission') {
          const actor = requireAccountActor(envelope);
          if (
            envelope.context.exercisedCapability !== 'account_owner' &&
            envelope.context.exercisedCapability !== 'parent_guardian'
          ) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }

          if (participantRecord.management.kind !== 'managed') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }

          const managementRead = await session.tx.get({
            path: participantManagementPath(participantRecord.management.participantManagementId),
          });
          session.plan.planRead({
            path: participantManagementPath(participantRecord.management.participantManagementId),
            category: 'aggregate',
          });
          managementRecord = parseParticipantManagement(
            managementRead.exists ? managementRead.data : undefined
          );
          if (!managementRecord || managementRecord.accountId !== actor.accountId) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }

          const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
          session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
          accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
          assertAccountActive(envelope, accountRecord);
          assertAuthorizedParticipantManager(
            envelope,
            {
              account: accountRecord!,
              participant: participantRecord,
              management: managementRecord!,
            },
            participantRecord.participantId
          );
        } else {
          const admin = assertAdministrator(envelope);
          const accountRead = await session.tx.get({ path: accountPath(admin.accountId) });
          session.plan.planRead({ path: accountPath(admin.accountId), category: 'authorization_check' });
          accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
          assertAccountActive(envelope, accountRecord);
        }

        session.plan.planMutation({
          path: relationshipPath,
          kind: existingRelationship ? 'update' : 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.relationshipBytes,
        });
      },
      planAuditOutbox: async () =>
        buildParticipantAccessAuditPlan({
          envelope,
          primarySubject: {
            kind: 'instructor_relationship',
            id: envelope.intent.instructorRelationshipId,
            subjectKey: `instructor_relationship:${envelope.intent.instructorRelationshipId}`,
          },
          affectedSubjects: [
            canonicalReference('participant', envelope.intent.participantId),
            canonicalReference('instructor_relationship', envelope.intent.instructorRelationshipId),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference(
                'instructor_relationship',
                envelope.intent.instructorRelationshipId
              ),
              revision: existingRelationship
                ? nextAggregateRevision(existingRelationship.revision)
                : AggregateRevisionSchema.parse(1),
            },
          ],
        }),
      execute: async (session, context) => {
        if (existingRelationship?.status === 'active') {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        const decidedAt = timestampFromDate(context.decidedAt);
        const validFrom = decidedAt;
        const expiresAt = instructorRelationshipExpiresAt(validFrom);
        const actor = requireAccountActor(envelope);
        const basis =
          envelope.intent.basis.kind === 'guardian_permission'
            ? {
                kind: 'guardian_permission' as const,
                participantManagementId: managementRecord!.participantManagementId,
                grantedByAccountId: actor.accountId,
              }
            : {
                kind: 'administration_assignment' as const,
                assignedByAccountId: actor.accountId,
              };

        const relationship = existingRelationship
          ? {
              ...existingRelationship,
              participantId: envelope.intent.participantId,
              instructorId: envelope.intent.instructorId,
              basis,
              validFrom,
              expiresAt,
              status: 'active' as const,
              revision: nextAggregateRevision(existingRelationship.revision),
              updatedAt: decidedAt,
              audit: {
                ...existingRelationship.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              },
            }
          : {
              instructorRelationshipId: envelope.intent.instructorRelationshipId,
              participantId: envelope.intent.participantId,
              instructorId: envelope.intent.instructorId,
              basis,
              validFrom,
              expiresAt,
              status: 'active' as const,
              revision: AggregateRevisionSchema.parse(1),
              createdAt: decidedAt,
              updatedAt: decidedAt,
              audit: revisionAuditLink(envelope, metadata),
            };

        if (existingRelationship) {
          session.tx.update({ path: relationshipPath }, relationship as Record<string, unknown>);
        } else {
          session.tx.create({ path: relationshipPath }, relationship as Record<string, unknown>);
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function revokeInstructorRelationshipHandler(
  envelope: CommandEnvelope<'revoke_instructor_relationship'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'revoke_instructor_relationship'>> {
  const metadata = metadataFromEnvelope(envelope);
  const relationshipPath = instructorRelationshipPath(envelope.intent.instructorRelationshipId);

  let relationshipRecord!: InstructorRelationship;
  let participantRecord!: Participant;
  let managementRecord: ReturnType<typeof parseParticipantManagement>;
  let accountRecord: ReturnType<typeof parseAccount>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'revoke_instructor_relationship'> = {
    read: async (session) => {
      const relationshipRead = await session.tx.get({ path: relationshipPath });
      session.plan.planRead({ path: relationshipPath, category: 'aggregate' });
      const parsedRelationship = parseInstructorRelationship(
        relationshipRead.exists ? relationshipRead.data : undefined
      );
      if (!parsedRelationship || parsedRelationship.status !== 'active') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
        });
      }
      relationshipRecord = parsedRelationship;

      const participantRead = await session.tx.get({
        path: participantPath(relationshipRecord.participantId),
      });
      session.plan.planRead({
        path: participantPath(relationshipRecord.participantId),
        category: 'aggregate',
      });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      if (administratorCapabilityExercisedByAccount(envelope.context)) {
        const admin = assertAdministrator(envelope);
        const accountRead = await session.tx.get({ path: accountPath(admin.accountId) });
        session.plan.planRead({ path: accountPath(admin.accountId), category: 'authorization_check' });
        accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
        assertAccountActive(envelope, accountRecord);
      } else {
        if (participantRecord.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participantRecord.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participantRecord.management.participantManagementId),
          category: 'aggregate',
        });
        managementRecord = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        const accountRead = await session.tx.get({
          path: accountPath(managementRecord!.accountId),
        });
        session.plan.planRead({
          path: accountPath(managementRecord!.accountId),
          category: 'authorization_check',
        });
        accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
        assertAccountActive(envelope, accountRecord);
        assertAuthorizedParticipantManager(
          envelope,
          {
            account: accountRecord!,
            participant: participantRecord,
            management: managementRecord!,
          },
          participantRecord.participantId
        );
      }

      session.plan.planMutation({
        path: relationshipPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.relationshipBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'instructor_relationship',
          id: envelope.intent.instructorRelationshipId,
          subjectKey: `instructor_relationship:${envelope.intent.instructorRelationshipId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', relationshipRecord!.participantId),
          canonicalReference('instructor_relationship', envelope.intent.instructorRelationshipId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference(
              'instructor_relationship',
              envelope.intent.instructorRelationshipId
            ),
            revision: nextAggregateRevision(relationshipRecord!.revision),
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const actor = requireAccountActor(envelope);
      const revokedBy =
        envelope.context.exercisedCapability === 'administrator'
          ? ({ kind: 'administrator' as const, accountId: actor.accountId })
          : ({
              kind: 'participant_manager' as const,
              accountId: actor.accountId,
              participantManagementId: managementRecord!.participantManagementId,
            });

      const revokedRelationship = {
        ...relationshipRecord!,
        status: 'revoked' as const,
        revokedAt: decidedAt,
        revokedBy,
        revision: nextAggregateRevision(relationshipRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...relationshipRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      session.tx.update({ path: relationshipPath }, revokedRelationship as Record<string, unknown>);
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: relationshipPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

function blockParticipantHandler(
  envelope: CommandEnvelope<'block_participant'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'block_participant'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertNotAdministratorForBlockMutation(envelope);

  const createdByKind =
    envelope.context.exercisedCapability === 'instructor'
      ? ('instructor' as const)
      : ('participant_manager' as const);

  const expectedBlockId = participantBlockIdFromDirection({
    participantId: envelope.intent.participantId,
    instructorId: envelope.intent.instructorId,
    createdByKind,
  });
  if (envelope.intent.participantBlockId !== expectedBlockId) {
    return Promise.resolve(
      commandErrorResult(
        envelope.kind,
        envelope.context.correlationId,
        new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'participantBlockId', reason: 'conflict' },
        }).toTransport()
      )
    );
  }

  const blockDocumentPath = participantBlockPath(envelope.intent.participantBlockId);
  let participantRecord!: Participant;
  let managementRecord: ReturnType<typeof parseParticipantManagement>;
  let accountRecord: ReturnType<typeof parseAccount>;
  let existingBlock: ParticipantBlock | undefined;
  let cancelledOpenProposalPlans: readonly BlockCancelledOpenProposalPlan[] = [];
  let openProposalIndexForBlock: Awaited<
    ReturnType<typeof planBlockCancellationOfOpenProposals>
  >['existingIndex'];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'block_participant'> = {
    read: async (session) => {
      cancelledOpenProposalPlans = [];
      openProposalIndexForBlock = undefined;

      const blockRead = await session.tx.get({ path: blockDocumentPath });
      session.plan.planRead({ path: blockDocumentPath, category: 'aggregate' });
      existingBlock = parseParticipantBlock(blockRead.exists ? blockRead.data : undefined);
      if (existingBlock?.status === 'active') {
        return;
      }

      const participantRead = await session.tx.get({
        path: participantPath(envelope.intent.participantId),
      });
      session.plan.planRead({
        path: participantPath(envelope.intent.participantId),
        category: 'aggregate',
      });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

      if (createdByKind === 'instructor') {
        assertInstructorCapability(envelope, envelope.intent.instructorId);
      } else {
        if (participantRecord.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participantRecord.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participantRecord.management.participantManagementId),
          category: 'aggregate',
        });
        managementRecord = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        const accountRead = await session.tx.get({
          path: accountPath(managementRecord!.accountId),
        });
        session.plan.planRead({
          path: accountPath(managementRecord!.accountId),
          category: 'authorization_check',
        });
        accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
        assertAccountActive(envelope, accountRecord);
        assertAuthorizedParticipantManager(
          envelope,
          {
            account: accountRecord!,
            participant: participantRecord,
            management: managementRecord!,
          },
          participantRecord.participantId
        );

        const cancellationPlan = await planBlockCancellationOfOpenProposals(session, {
          participantId: envelope.intent.participantId,
          instructorId: envelope.intent.instructorId,
        });
        openProposalIndexForBlock = cancellationPlan.existingIndex;
        cancelledOpenProposalPlans = cancellationPlan.plans;
      }

      session.plan.planMutation({
        path: blockDocumentPath,
        kind: existingBlock ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.blockBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant_block',
          id: envelope.intent.participantBlockId,
          subjectKey: `participant_block:${envelope.intent.participantBlockId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', envelope.intent.participantId),
          canonicalReference('participant_block', envelope.intent.participantBlockId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference('participant_block', envelope.intent.participantBlockId),
            revision: existingBlock
              ? nextAggregateRevision(existingBlock.revision)
              : AggregateRevisionSchema.parse(1),
          },
        ],
        ...(createdByKind === 'participant_manager' && cancelledOpenProposalPlans.length > 0
          ? {
              cancelledOpenProposalIds: cancelledProposalIds(cancelledOpenProposalPlans),
              cancelledOpenProposalRevisions: Object.fromEntries(
                cancelledOpenProposalPlans.map((plan) => [
                  plan.proposal.proposalId,
                  plan.nextRevision,
                ])
              ),
              cancelledProposalNotificationAccountId: managementRecord!.accountId,
            }
          : {}),
      }),
    execute: async (session, context) => {
      if (existingBlock?.status === 'active') {
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      }

      const decidedAt = timestampFromDate(context.decidedAt);
      const actor = requireAccountActor(envelope);
      const createdBy =
        createdByKind === 'instructor'
          ? { kind: 'instructor' as const, instructorId: envelope.intent.instructorId }
          : {
              kind: 'participant_manager' as const,
              accountId: actor.accountId,
              participantManagementId: managementRecord!.participantManagementId,
            };

      const block: ParticipantBlock = existingBlock
        ? {
            ...existingBlock,
            participantId: envelope.intent.participantId,
            instructorId: envelope.intent.instructorId,
            createdBy,
            reason: envelope.intent.reason,
            status: 'active',
            revision: nextAggregateRevision(existingBlock.revision),
            updatedAt: decidedAt,
            audit: {
              ...existingBlock.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        : {
            participantBlockId: envelope.intent.participantBlockId,
            participantId: envelope.intent.participantId,
            instructorId: envelope.intent.instructorId,
            createdBy,
            reason: envelope.intent.reason,
            status: 'active',
            revision: AggregateRevisionSchema.parse(1),
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit: revisionAuditLink(envelope, metadata),
          };

      if (existingBlock) {
        session.tx.update({ path: blockDocumentPath }, block as Record<string, unknown>);
      } else {
        session.tx.create({ path: blockDocumentPath }, block as Record<string, unknown>);
      }

      if (createdByKind === 'participant_manager' && cancelledOpenProposalPlans.length > 0) {
        commitBlockCancellationOfOpenProposals(session, {
          participantId: envelope.intent.participantId,
          instructorId: envelope.intent.instructorId,
          plans: cancelledOpenProposalPlans,
          existingIndex: openProposalIndexForBlock,
          decidedAt,
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
        });
      }

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function unblockParticipantHandler(
  envelope: CommandEnvelope<'unblock_participant'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'unblock_participant'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertNotAdministratorForBlockMutation(envelope);

  const blockDocumentPath = participantBlockPath(envelope.intent.participantBlockId);
  let blockRecord!: ParticipantBlock;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'unblock_participant'> = {
    read: async (session) => {
      const blockRead = await session.tx.get({ path: blockDocumentPath });
      session.plan.planRead({ path: blockDocumentPath, category: 'aggregate' });
      const parsedBlock = parseParticipantBlock(blockRead.exists ? blockRead.data : undefined);
      if (!parsedBlock || parsedBlock.status !== 'active') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
        });
      }
      blockRecord = parsedBlock;

      if (blockRecord.createdBy.kind === 'participant_manager') {
        const participantRead = await session.tx.get({
          path: participantPath(blockRecord.participantId),
        });
        session.plan.planRead({
          path: participantPath(blockRecord.participantId),
          category: 'aggregate',
        });
        const participantRecord = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );
        if (participantRecord.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participantRecord.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participantRecord.management.participantManagementId),
          category: 'aggregate',
        });
        const managementRecord = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        const accountRead = await session.tx.get({
          path: accountPath(managementRecord!.accountId),
        });
        session.plan.planRead({
          path: accountPath(managementRecord!.accountId),
          category: 'authorization_check',
        });
        const accountRecord = parseAccount(accountRead.exists ? accountRead.data : undefined);
        assertAccountActive(envelope, accountRecord);
        assertAuthorizedParticipantManager(
          envelope,
          {
            account: accountRecord!,
            participant: participantRecord,
            management: managementRecord!,
          },
          participantRecord.participantId
        );
        if (
          !blockCreatorMatchesActor(envelope.context, blockRecord, {
            participantManagementId: managementRecord!.participantManagementId,
          })
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
      } else {
        assertInstructorCapability(envelope, blockRecord.instructorId);
        if (
          !blockCreatorMatchesActor(envelope.context, blockRecord, {
            instructorId: blockRecord.instructorId,
          })
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
      }

      session.plan.planMutation({
        path: blockDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.blockBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant_block',
          id: envelope.intent.participantBlockId,
          subjectKey: `participant_block:${envelope.intent.participantBlockId}`,
        },
        affectedSubjects: [
          canonicalReference('participant', blockRecord!.participantId),
          canonicalReference('participant_block', envelope.intent.participantBlockId),
        ],
        resultingRevisions: [
          {
            subject: canonicalReference('participant_block', envelope.intent.participantBlockId),
            revision: nextAggregateRevision(blockRecord!.revision),
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const removedBlock: ParticipantBlock = {
        ...blockRecord!,
        status: 'removed',
        removedAt: decidedAt,
        removedBy: blockRecord!.createdBy,
        revision: nextAggregateRevision(blockRecord!.revision),
        updatedAt: decidedAt,
        audit: {
          ...blockRecord!.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      session.tx.update({ path: blockDocumentPath }, removedBlock as Record<string, unknown>);
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: blockDocumentPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

export function createParticipantAccessCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Partial<CommandHandlerMap> {
  return {
    create_participant: (envelope, environment) =>
      createParticipantHandler(envelope, environment, executor),
    assign_participant_management: (envelope, environment) =>
      assignParticipantManagementHandler(envelope, environment, executor),
    revoke_participant_management: (envelope, environment) =>
      revokeParticipantManagementHandler(envelope, environment, executor),
    update_participant_profile: (envelope, environment) =>
      updateParticipantProfileHandler(envelope, environment, executor),
    create_instructor_relationship: (envelope, environment) =>
      createInstructorRelationshipHandler(envelope, environment, executor),
    revoke_instructor_relationship: (envelope, environment) =>
      revokeInstructorRelationshipHandler(envelope, environment, executor),
    block_participant: (envelope, environment) =>
      blockParticipantHandler(envelope, environment, executor),
    unblock_participant: (envelope, environment) =>
      unblockParticipantHandler(envelope, environment, executor),
  };
}

function createParticipantHandler(
  envelope: CommandEnvelope<'create_participant'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_participant'>> {
  const metadata = metadataFromEnvelope(envelope);
  const actor = requireAccountActor(envelope);
  if (
    envelope.context.exercisedCapability !== 'account_owner' &&
    envelope.context.exercisedCapability !== 'parent_guardian'
  ) {
    return Promise.resolve(
      commandErrorResult(
        envelope.kind,
        envelope.context.correlationId,
        new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        }).toTransport()
      )
    );
  }

  const participantDocumentPath = participantPath(envelope.intent.participantId);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_participant'> = {
    read: async (session) => {
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      assertAccountActive(envelope, parseAccount(accountRead.exists ? accountRead.data : undefined));

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      if (participantRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
    },
    planAuditOutbox: async () =>
      buildParticipantAccessAuditPlan({
        envelope,
        primarySubject: {
          kind: 'participant',
          id: envelope.intent.participantId,
          subjectKey: `participant:${envelope.intent.participantId}`,
        },
        affectedSubjects: [canonicalReference('participant', envelope.intent.participantId)],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', envelope.intent.participantId),
            revision: AggregateRevisionSchema.parse(1),
          },
        ],
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const participant: Participant = {
        participantId: envelope.intent.participantId,
        displayName: envelope.intent.displayName,
        age: envelope.intent.age,
        skillLevel: envelope.intent.skillLevel,
        discipline: envelope.intent.discipline,
        ...(envelope.intent.instructorComment === undefined
          ? {}
          : { instructorComment: envelope.intent.instructorComment }),
        management: { kind: 'unmanaged_guest' },
        initialManagementEligibleAccountId: actor.accountId,
        lifecycle: { status: 'active' },
        revision: AggregateRevisionSchema.parse(1),
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: revisionAuditLink(envelope, metadata),
      };

      session.tx.create({ path: participantDocumentPath }, participant as Record<string, unknown>);
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}
