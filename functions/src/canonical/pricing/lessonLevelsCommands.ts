import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  LessonLevelsCatalogSchema,
  DEFAULT_LESSON_LEVELS,
  assertLessonLevelsRetained,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type LessonLevelsCatalog,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { accountPath, parseAccount } from '../finance/financeStore';
import {
  assertAccountActive,
  assertAdministrator,
} from '../participantAccess/participantAccessAuthorization';
import { LESSON_LEVELS_DOCUMENT_PATH, parseLessonLevels } from './lessonLevelsStore';

function buildAuditPlan(
  envelope: CommandEnvelope<'update_lesson_levels'>,
  revision: number
): AuditOutboxStagingPlan {
  const settingsRef = canonicalReference('lesson_levels', 'lesson_levels');
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'lesson_levels',
        id: 'lesson_levels',
        subjectKey: 'lesson_levels:lesson_levels',
      },
      affectedSubjects: [settingsRef],
      effects: [
        {
          kind: 'lesson_levels_changed',
          subjectRef: settingsRef,
          summary: 'Lesson level catalog changed',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        { subject: settingsRef, revision: AggregateRevisionSchema.parse(revision) },
      ],
    },
    outboxObligations: [],
  };
}

function updateLessonLevelsHandler(
  envelope: CommandEnvelope<'update_lesson_levels'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_lesson_levels'>> {
  const actor = assertAdministrator(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  let current: LessonLevelsCatalog | undefined;
  let nextRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_lesson_levels'> = {
    read: async (session) => {
      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({
        path: accountPath(actor.accountId),
        category: 'authorization_check',
      });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

      const settingsRead = await session.tx.get({
        path: LESSON_LEVELS_DOCUMENT_PATH,
      });
      session.plan.planRead({
        path: LESSON_LEVELS_DOCUMENT_PATH,
        category: 'aggregate',
      });
      current = parseLessonLevels(settingsRead.exists ? settingsRead.data : undefined);
      if (settingsRead.exists && !current) {
        throw new CanonicalCommandError('internal', {
          correlationId: envelope.context.correlationId,
        });
      }

      const expectedRevision = envelope.context.expectedRevision;
      if (current) {
        if (expectedRevision === undefined) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'expectedRevision', reason: 'required' },
          });
        }
        if (expectedRevision !== current.revision) {
          throw new CanonicalCommandError('stale_version', {
            correlationId: envelope.context.correlationId,
            currentRevision: current.revision,
          });
        }
        nextRevision = nextAggregateRevision(current.revision);
      } else if (expectedRevision !== undefined && expectedRevision !== 0) {
        throw new CanonicalCommandError('stale_version', {
          correlationId: envelope.context.correlationId,
          currentRevision: AggregateRevisionSchema.parse(0),
        });
      }

      try {
        assertLessonLevelsRetained(
          current?.levels ?? DEFAULT_LESSON_LEVELS,
          envelope.intent.levels
        );
      } catch {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'levels', reason: 'conflict' },
        });
      }
      session.plan.planMutation({
        path: LESSON_LEVELS_DOCUMENT_PATH,
        kind: current ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: Buffer.byteLength(JSON.stringify(envelope.intent), 'utf8') + 512,
      });
    },
    planAuditOutbox: async () => buildAuditPlan(envelope, nextRevision),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const settings = LessonLevelsCatalogSchema.parse({
        levels: envelope.intent.levels,
        revision: nextRevision,
        createdAt: current?.createdAt ?? decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: current?.audit.createdByCommandId ?? identity.commandKey,
          lastChangedByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      });
      if (current) {
        session.tx.update({ path: LESSON_LEVELS_DOCUMENT_PATH }, settings);
      } else {
        session.tx.create({ path: LESSON_LEVELS_DOCUMENT_PATH }, settings);
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

export function createLessonLevelsCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'update_lesson_levels'> {
  return {
    update_lesson_levels: (envelope, environment) =>
      updateLessonLevelsHandler(envelope, environment, executor),
  };
}
