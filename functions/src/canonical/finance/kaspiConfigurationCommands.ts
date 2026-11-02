import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  KASPI_CONFIGURATION_PATH,
  KaspiConfigurationSchema,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  normalizeFirestoreDocument,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import { executeAuthoritativeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import type { CanonicalTransactionExecutor } from '../transactions';
import {
  assertAccountActive,
  assertAdministrator,
} from '../participantAccess/participantAccessAuthorization';
import { accountPath, parseAccount } from './financeStore';

export function createKaspiConfigurationCommandHandlers(
  executor: CanonicalTransactionExecutor
): Pick<CommandHandlerMap, 'set_kaspi_payment_enabled'> {
  return {
    set_kaspi_payment_enabled: (envelope, environment) => {
      const actor = assertAdministrator(envelope);
      const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);
      const actionPath = `${KASPI_CONFIGURATION_PATH}/actions/${identity.commandKey}`;
      let exists = false;
      let previousEnabled = false;
      let revision = AggregateRevisionSchema.parse(0);
      const subject = canonicalReference('account', actor.accountId);
      return executeAuthoritativeIdempotentCanonicalCommand({
        envelope,
        environment,
        executor,
        handler: {
          read: async (session) => {
            const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
            session.plan.planRead({
              path: accountPath(actor.accountId),
              category: 'authorization_check',
            });
            assertAccountActive(envelope, parseAccount(actorRead.data));
            const config = await session.tx.get({ path: KASPI_CONFIGURATION_PATH });
            session.plan.planRead({ path: KASPI_CONFIGURATION_PATH, category: 'aggregate' });
            exists = config.exists;
            const data = normalizeFirestoreDocument(config.data);
            previousEnabled = data?.enabled === true;
            const parsedRevision = AggregateRevisionSchema.safeParse(data?.revision ?? 0);
            if (!parsedRevision.success)
              throw new CanonicalCommandError('validation', {
                correlationId: envelope.context.correlationId,
              });
            if (envelope.context.expectedRevision !== parsedRevision.data)
              throw new CanonicalCommandError('stale_version', {
                correlationId: envelope.context.correlationId,
                currentRevision: parsedRevision.data,
              });
            if (
              envelope.intent.enabled &&
              !KaspiConfigurationSchema.safeParse({ ...data, enabled: true }).success
            )
              throw new CanonicalCommandError('validation', {
                correlationId: envelope.context.correlationId,
                details: { field: 'enabled', reason: 'unsupported' },
              });
            revision = nextAggregateRevision(parsedRevision.data);
            session.plan.planMutation({
              path: KASPI_CONFIGURATION_PATH,
              kind: exists ? 'update' : 'create',
              category: 'aggregate',
              estimatedPayloadBytes: 256,
            });
            session.plan.planMutation({
              path: actionPath,
              kind: 'create',
              category: 'aggregate',
              estimatedPayloadBytes: 512,
            });
          },
          planAuditOutbox: async () => ({
            activityLog: {
              reason: {
                registryVersion: AUDIT_REASON_REGISTRY_VERSION,
                reasonCode: 'manual_override',
                explanation: `Kaspi QR enabled=${envelope.intent.enabled}; configuration revision=${revision}`,
              },
              primarySubject: {
                kind: 'account',
                id: actor.accountId,
                subjectKey: `account:${actor.accountId}`,
              },
              affectedSubjects: [subject],
              effects: [],
              monetaryEventIds: [],
              adminIssueIds: [],
              resultingRevisions: [],
            },
            outboxObligations: [],
          }),
          execute: async (session, context) => {
            const at = timestampFromDate(context.decidedAt);
            const update = {
              enabled: envelope.intent.enabled,
              revision,
              updatedBy: actor.accountId,
              updatedAt: at,
            };
            if (exists) session.tx.update({ path: KASPI_CONFIGURATION_PATH }, update);
            else session.tx.create({ path: KASPI_CONFIGURATION_PATH }, update);
            session.tx.create(
              { path: actionPath },
              {
                previousEnabled,
                ...update,
                commandId: identity.commandKey,
                correlationId: envelope.context.correlationId,
              }
            );
            return commandSuccessResult(envelope.kind, envelope.context.correlationId);
          },
        },
      });
    },
  };
}
