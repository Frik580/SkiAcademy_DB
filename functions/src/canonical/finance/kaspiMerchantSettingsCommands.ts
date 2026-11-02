import { randomUUID } from 'node:crypto';
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
  type KaspiConfiguration,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import { executeAuthoritativeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import {
  assertAccountActive,
  assertAdministrator,
} from '../participantAccess/participantAccessAuthorization';
import type { CanonicalTransactionExecutor } from '../transactions';
import { accountPath, parseAccount } from './financeStore';
import { verifyKaspiQrUpload } from './kaspiQrUpload';

export function createKaspiMerchantSettingsCommandHandlers(
  executor: CanonicalTransactionExecutor,
  verifyUpload: (path: string) => Promise<string> = verifyKaspiQrUpload
): Pick<CommandHandlerMap, 'save_kaspi_configuration'> {
  return {
    save_kaspi_configuration: async (envelope, environment) => {
      const actor = assertAdministrator(envelope);
      const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);
      const actionPath = `${KASPI_CONFIGURATION_PATH}/actions/${identity.commandKey}`;
      const intent = envelope.intent;
      const fail = (code: 'validation' | 'invalid_transition' | 'stale_version' = 'validation') => {
        throw new CanonicalCommandError(code, { correlationId: envelope.context.correlationId });
      };
      // Only an immutable upload belonging to the caller may introduce new QR bytes.
      if (intent.qrStoragePath && !intent.qrStoragePath.startsWith(`kaspi-qr/${actor.accountId}/`))
        fail();
      const uploadedUrl = intent.qrStoragePath
        ? await verifyUpload(intent.qrStoragePath).catch(() => fail())
        : undefined;
      const newKey = randomUUID();
      let exists = false;
      let previous: Record<string, unknown> | undefined;
      let next!: KaspiConfiguration;
      return executeAuthoritativeIdempotentCanonicalCommand({
        envelope,
        environment,
        executor,
        handler: {
          read: async (session) => {
            const account = await session.tx.get({ path: accountPath(actor.accountId) });
            session.plan.planRead({
              path: accountPath(actor.accountId),
              category: 'authorization_check',
            });
            assertAccountActive(envelope, parseAccount(account.data));
            if (account.data?.role !== 'admin' && account.data?.systemRole !== 'owner') {
              throw new CanonicalCommandError('forbidden', {
                correlationId: envelope.context.correlationId,
              });
            }
            const config = await session.tx.get({ path: KASPI_CONFIGURATION_PATH });
            session.plan.planRead({ path: KASPI_CONFIGURATION_PATH, category: 'aggregate' });
            exists = config.exists;
            previous = normalizeFirestoreDocument(config.data);
            const revision = AggregateRevisionSchema.safeParse(previous?.revision ?? 0);
            if (!revision.success) fail();
            if (envelope.context.expectedRevision !== revision.data) fail('stale_version');
            if (intent.replaceMerchant) {
              if (
                !previous?.merchantKey ||
                previous.enabled === true ||
                !uploadedUrl ||
                intent.qrStoragePath === previous.qrStoragePath
              )
                fail('invalid_transition');
              // One equality query per unresolved status, at most one document each.
              // Conservative across merchant history: no identity rotation with outstanding work.
              for (const status of [
                'awaiting_payment',
                'payment_claimed',
                'requires_clarification',
                'refund_required',
              ]) {
                const unresolved = await session.tx.query({
                  collection: 'payment_requests',
                  where: { field: 'status', op: '==', value: status },
                  limit: 1,
                });
                for (const item of unresolved)
                  session.plan.planRead({ path: item.path, category: 'aggregate' });
                if (unresolved.length) fail('invalid_transition');
              }
            }
            const at = timestampFromDate(environment.clock.now());
            const existingKey = KaspiConfigurationSchema.shape.merchantKey.safeParse(
              previous?.merchantKey
            );
            const parsed = KaspiConfigurationSchema.safeParse({
              enabled: previous?.enabled === true,
              provider: 'kaspi_manual',
              merchantKey:
                intent.replaceMerchant || !existingKey.success ? newKey : existingKey.data,
              merchantName: intent.merchantName,
              qrImageUrl: uploadedUrl ?? previous?.qrImageUrl,
              ...(intent.qrStoragePath || previous?.qrStoragePath
                ? { qrStoragePath: intent.qrStoragePath ?? previous?.qrStoragePath }
                : {}),
              walletRequestTtlSeconds: intent.walletRequestTtlSeconds,
              qrVerifiedBy: actor.accountId,
              qrVerifiedAt: at,
              revision: nextAggregateRevision(revision.data!),
              updatedBy: actor.accountId,
              updatedAt: at,
              ...(previous && 'legalApprovalReference' in previous
                ? { legalApprovalReference: previous.legalApprovalReference }
                : {}),
            });
            if (!parsed.success) fail();
            next = parsed.data!;
            for (const path of [KASPI_CONFIGURATION_PATH, actionPath])
              session.plan.planMutation({
                path,
                kind: path === KASPI_CONFIGURATION_PATH && exists ? 'update' : 'create',
                category: 'aggregate',
                estimatedPayloadBytes: 2048,
              });
          },
          planAuditOutbox: async () => ({
            activityLog: {
              reason: {
                registryVersion: AUDIT_REASON_REGISTRY_VERSION,
                reasonCode: 'manual_override',
                explanation: `Kaspi merchant settings saved; replacement=${Boolean(intent.replaceMerchant)}; revision=${next.revision}`,
              },
              primarySubject: {
                kind: 'account',
                id: actor.accountId,
                subjectKey: `account:${actor.accountId}`,
              },
              affectedSubjects: [canonicalReference('account', actor.accountId)],
              effects: [],
              monetaryEventIds: [],
              adminIssueIds: [],
              resultingRevisions: [],
            },
            outboxObligations: [],
          }),
          execute: async (session) => {
            if (exists) session.tx.update({ path: KASPI_CONFIGURATION_PATH }, next);
            else session.tx.create({ path: KASPI_CONFIGURATION_PATH }, next);
            session.tx.create(
              { path: actionPath },
              {
                operation: intent.replaceMerchant ? 'replace_merchant' : 'save_settings',
                previous: previous ?? null,
                configuration: next,
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
