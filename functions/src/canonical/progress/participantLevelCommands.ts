import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  InstructorIdSchema,
  ParticipantProgressSchema,
  calculateParticipantStage,
  canonicalReference,
  commandSuccessResult,
  nextParticipantDailyProgress,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type ParticipantLevelState,
  type ParticipantProgress,
  type ProgressionConfig,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import { executeAuthoritativeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import {
  assertAdministrator,
  assertInstructorCapability,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseParticipant,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { assertTestMutableSubjectScope } from '../testSessions/assertTestMutableResourceScope';
import { instructorCatalogPath } from '../bookings/bookingStore';
import { assertInstructorMayUpdateParticipantProgress } from './participantProgressCommands';
import {
  parseParticipantProgress,
  participantProgressPath,
  toFirestoreWritePayload,
} from './participantProgressStore';
import {
  readProgressionConfig,
  stageProgressEvent,
  prepareLevelActivity,
} from './participantLevelSupport';

export function createParticipantLevelCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'manage_participant_level'> {
  return {
    manage_participant_level: async (envelope, environment) => {
      const actor = requireAccountActor(envelope);
      const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);
      const { participantId, operation } = envelope.intent;
      const path = participantProgressPath(participantId);
      const admin = ['assign', 'approve', 'reject'].includes(operation.action);
      const fail = (code: 'forbidden' | 'invalid_transition' | 'validation') => {
        throw new CanonicalCommandError(code, { correlationId: envelope.context.correlationId });
      };
      let previous: ParticipantProgress | undefined;
      let next!: ParticipantProgress;
      let config!: ProgressionConfig;
      let writeEvent!: () => void;
      let writeActivity!: () => void;
      return executeAuthoritativeIdempotentCanonicalCommand({
        envelope,
        environment,
        executor,
        handler: {
          read: async (session) => {
            const actorDoc = await session.tx.get({ path: accountPath(actor.accountId) });
            session.plan.planRead({
              path: accountPath(actor.accountId),
              category: 'authorization_check',
            });
            const account = parseAccount(actorDoc.data);
            if (!account || account.lifecycle.status !== 'active') fail('forbidden');
            if (admin) assertAdministrator(envelope);
            const personPath = participantPath(participantId);
            const personDoc = await session.tx.get({ path: personPath });
            session.plan.planRead({ path: personPath, category: 'authorization_check' });
            const participant = assertParticipantActive(envelope, parseParticipant(personDoc.data));
            assertTestMutableSubjectScope({
              correlationId: envelope.context.correlationId,
              scope: session.scope,
              persisted: participant,
            });
            const at = timestampFromDate(environment.clock.decidedAt());
            let instructorId;
            if (!admin) {
              const parsed = InstructorIdSchema.safeParse(actorDoc.data?.instructorId);
              if (!parsed.success) return fail('forbidden');
              instructorId = parsed.data;
              assertInstructorCapability(envelope, instructorId);
              const catalogPath = instructorCatalogPath(instructorId);
              const catalog = await session.tx.get({ path: catalogPath });
              session.plan.planRead({ path: catalogPath, category: 'authorization_check' });
              if (
                !catalog.exists ||
                (catalog.data?.linkedAccountId && catalog.data.linkedAccountId !== actor.accountId)
              )
                fail('forbidden');
              await assertInstructorMayUpdateParticipantProgress(session, envelope, {
                instructorId,
                participant,
                at,
              });
            }
            const doc = await session.tx.get({ path });
            session.plan.planRead({ path, category: 'aggregate' });
            previous = parseParticipantProgress(doc.data);
            if (doc.exists && !previous) fail('validation');
            if (envelope.context.expectedRevision === undefined) fail('validation');
            if (envelope.context.expectedRevision !== (previous?.revision ?? 0)) {
              throw new CanonicalCommandError('stale_version', {
                correlationId: envelope.context.correlationId,
                currentRevision: AggregateRevisionSchema.parse(previous?.revision ?? 0),
              });
            }
            config = await readProgressionConfig(session, envelope);
            const revision = AggregateRevisionSchema.parse((previous?.revision ?? 0) + 1);
            let level = previous?.level ?? 1;
            const state: ParticipantLevelState = structuredClone(
              previous?.levelState ?? {
                levelRevision: AggregateRevisionSchema.parse(0),
                method: 'historical' as const,
                qualifications: [],
              }
            );
            const changeLevel = (target: number, method: typeof state.method) => {
              if (target === level) fail('invalid_transition');
              level = target;
              state.levelRevision = revision;
              state.method = method;
              if (method !== 'xp_confirmation') state.assignedThroughLevel = target - 1;
              if (state.request?.status === 'pending')
                state.request = {
                  ...state.request,
                  status: 'stale',
                  resolvedAt: at,
                  resolvedBy: actor.accountId,
                };
            };
            if (operation.action === 'confirm') {
              if (state.qualifications.some((q) => q.status === 'review'))
                fail('invalid_transition');
              const stage = calculateParticipantStage(level, previous?.skillScores ?? {}, config);
              if (!stage.ready || !stage.nextLevel) return fail('invalid_transition');
              state.qualifications = state.qualifications.filter((q) => q.stage !== level);
              state.qualifications.push({
                stage: level,
                status: 'confirmed',
                commandId: identity.commandKey,
              });
              changeLevel(stage.nextLevel, 'xp_confirmation');
            } else if (operation.action === 'retain') {
              if (!state.qualifications.some((q) => q.status === 'review'))
                fail('invalid_transition');
              state.qualifications = state.qualifications.map((q) =>
                q.status === 'review'
                  ? {
                      ...q,
                      status: 'retained',
                      retainedEarned: calculateParticipantStage(
                        q.stage,
                        previous?.skillScores ?? {},
                        config
                      ).earned,
                    }
                  : q
              );
            } else if (operation.action === 'assign') {
              changeLevel(operation.level, 'admin_assignment');
              state.qualifications = [];
            } else if (operation.action === 'request') {
              if (state.request?.status === 'pending' || operation.level === level || !instructorId)
                return fail('invalid_transition');
              state.request = {
                requestId: identity.commandKey,
                status: 'pending',
                fromLevel: level,
                proposedLevel: operation.level,
                baseLevelRevision: state.levelRevision,
                instructorId,
                accountId: actor.accountId,
                reason: operation.reason,
                ...(operation.comment ? { comment: operation.comment } : {}),
                createdAt: at,
              };
            } else {
              const request = state.request;
              if (
                !request ||
                request.status !== 'pending' ||
                request.requestId !== operation.requestId
              )
                return fail('invalid_transition');
              if (operation.action === 'cancel' && request.accountId !== actor.accountId)
                fail('forbidden');
              if (operation.action === 'reject' && !operation.reason) fail('validation');
              if (
                request.fromLevel !== level ||
                request.baseLevelRevision !== state.levelRevision
              ) {
                state.request = {
                  ...request,
                  status: 'stale',
                  resolvedAt: at,
                  resolvedBy: actor.accountId,
                };
              } else {
                if (operation.action === 'approve') {
                  changeLevel(request.proposedLevel, 'admin_request');
                  state.qualifications = [];
                }
                state.request = {
                  ...request,
                  status:
                    operation.action === 'approve'
                      ? 'approved'
                      : operation.action === 'reject'
                        ? 'rejected'
                        : 'cancelled',
                  resolvedAt: at,
                  resolvedBy: actor.accountId,
                  ...('reason' in operation && operation.reason
                    ? { resolutionReason: operation.reason }
                    : {}),
                };
              }
            }
            next = ParticipantProgressSchema.parse({
              ...previous,
              participantId,
              level,
              levelState: state,
              skillScores: previous?.skillScores ?? {},
              skillComments: previous?.skillComments ?? {},
              dailyProgress: nextParticipantDailyProgress(previous, environment.clock.decidedAt()),
              revision,
              createdAt: previous?.createdAt ?? at,
              updatedAt: at,
              audit: {
                createdByCommandId: previous?.audit.createdByCommandId ?? identity.commandKey,
                lastChangedByCommandId: identity.commandKey,
                correlationId: envelope.context.correlationId,
              },
            });
            writeActivity = await prepareLevelActivity(
              session,
              envelope,
              participant,
              previous,
              next
            );
            writeEvent = stageProgressEvent(session, envelope, previous, next, config, operation);
            session.plan.planMutation({
              path,
              kind: previous ? 'update' : 'create',
              category: 'aggregate',
              estimatedPayloadBytes: 32768,
            });
          },
          planAuditOutbox: async (): Promise<AuditOutboxStagingPlan> => ({
            activityLog: {
              reason: {
                registryVersion: AUDIT_REASON_REGISTRY_VERSION,
                reasonCode: admin ? 'manual_override' : 'instructor_evaluation',
                explanation:
                  ('reason' in operation ? operation.reason?.text : undefined) ??
                  next.levelState?.request?.reason.text ??
                  operation.action,
              },
              primarySubject: {
                kind: 'participant',
                id: participantId,
                subjectKey: `participant_progress:${participantId}`,
              },
              affectedSubjects: [canonicalReference('participant', participantId)],
              effects: [
                {
                  kind: 'participant_progress_changed',
                  subjectRef: canonicalReference('participant', participantId),
                  summary: `Participant level operation: ${operation.action}`,
                },
              ],
              monetaryEventIds: [],
              adminIssueIds: [],
              resultingRevisions: [
                {
                  subject: canonicalReference('participant', participantId),
                  revision: next.revision,
                },
              ],
            },
            outboxObligations: [],
          }),
          execute: async (session) => {
            writeEvent();
            writeActivity();
            if (previous) session.tx.update({ path }, toFirestoreWritePayload(next));
            else session.tx.create({ path }, toFirestoreWritePayload(next));
            return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
              participantId,
              revision: next.revision,
            });
          },
        },
      });
    },
  };
}
