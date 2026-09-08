import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  LessonPricingSettingsSchema,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type LessonPricingSettings,
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
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import {
  LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
  parseLessonPricingSettings,
} from './lessonPricingSettingsStore';

function buildAuditPlan(
  envelope: CommandEnvelope<'update_lesson_pricing_settings'>,
  revision: number
): AuditOutboxStagingPlan {
  const settingsRef = canonicalReference('lesson_pricing_settings', 'lesson_booking');
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'lesson_pricing_settings',
        id: 'lesson_booking',
        subjectKey: 'lesson_pricing_settings:lesson_booking',
      },
      affectedSubjects: [settingsRef],
      effects: [
        {
          kind: 'pricing_settings_changed',
          subjectRef: settingsRef,
          summary: 'Lesson pricing and participant limit settings changed',
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

function updateLessonPricingSettingsHandler(
  envelope: CommandEnvelope<'update_lesson_pricing_settings'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_lesson_pricing_settings'>> {
  const actor = assertAdministrator(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  let current: LessonPricingSettings | undefined;
  let nextRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_lesson_pricing_settings'> =
    {
      read: async (session) => {
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

        const settingsRead = await session.tx.get({
          path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
        });
        session.plan.planRead({
          path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
          category: 'aggregate',
        });
        current = parseLessonPricingSettings(settingsRead.exists ? settingsRead.data : undefined);
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

        session.plan.planMutation({
          path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
          kind: current ? 'update' : 'create',
          category: 'aggregate',
          estimatedPayloadBytes: 512,
        });
      },
      planAuditOutbox: async () => buildAuditPlan(envelope, nextRevision),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const settings = LessonPricingSettingsSchema.parse({
          settingsId: 'lesson_booking',
          additionalParticipantSurchargePerHourKzt:
            envelope.intent.additionalParticipantSurchargePerHourKzt,
          maxParticipantsPerLesson: envelope.intent.maxParticipantsPerLesson,
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
          session.tx.update(
            { path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH },
            {
              ...settings,
              additionalParticipantSurchargeKzt: CANONICAL_FIELD_DELETE,
            }
          );
        } else {
          session.tx.create({ path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH }, settings);
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

export function createLessonPricingSettingsCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'update_lesson_pricing_settings'> {
  return {
    update_lesson_pricing_settings: (envelope, environment) =>
      updateLessonPricingSettingsHandler(envelope, environment, executor),
  };
}
