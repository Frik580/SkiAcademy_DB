import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  EmailDeliverySettingsSchema,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type EmailDeliverySettings,
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
import {
  EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
  parseEmailDeliverySettings,
} from './emailDeliverySettingsStore';

function buildAuditPlan(
  envelope: CommandEnvelope<'set_email_delivery_enabled'>,
  revision: number
): AuditOutboxStagingPlan {
  const settingsRef = canonicalReference('email_delivery_settings', 'email');
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: 'email_delivery_settings',
        id: 'email',
        subjectKey: 'email_delivery_settings:email',
      },
      affectedSubjects: [settingsRef],
      effects: [
        {
          kind: 'email_delivery_settings_changed',
          subjectRef: settingsRef,
          summary: 'External email delivery setting changed',
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

function setEmailDeliveryEnabledHandler(
  envelope: CommandEnvelope<'set_email_delivery_enabled'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  isProviderConfigured: () => boolean
): Promise<CommandResult<'set_email_delivery_enabled'>> {
  const actor = assertAdministrator(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  let current: EmailDeliverySettings | undefined;
  let nextRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'set_email_delivery_enabled'> = {
    read: async (session) => {
      if (envelope.intent.enabled && !isProviderConfigured()) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'enabled', reason: 'unsupported' },
        });
      }

      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({
        path: accountPath(actor.accountId),
        category: 'authorization_check',
      });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

      const settingsRead = await session.tx.get({
        path: EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
      });
      session.plan.planRead({
        path: EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
        category: 'aggregate',
      });
      current = parseEmailDeliverySettings(settingsRead.exists ? settingsRead.data : undefined);
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
        path: EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
        kind: current ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: 512,
      });
    },
    planAuditOutbox: async () => buildAuditPlan(envelope, nextRevision),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const settings = EmailDeliverySettingsSchema.parse({
        settingsId: 'email',
        emailDeliveryEnabled: envelope.intent.enabled,
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
        session.tx.update({ path: EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH }, settings);
      } else {
        session.tx.create({ path: EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH }, settings);
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

export function createEmailDeliverySettingsCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  isProviderConfigured: () => boolean
): Pick<CommandHandlerMap, 'set_email_delivery_enabled'> {
  return {
    set_email_delivery_enabled: (envelope, environment) =>
      setEmailDeliveryEnabledHandler(envelope, environment, executor, isProviderConfigured),
  };
}
