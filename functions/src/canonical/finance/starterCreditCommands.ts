import {
  AccountIdSchema,
  AggregateRevisionSchema,
  CanonicalCommandError,
  commandSuccessResult,
  creditWalletBalance,
  KztMinorUnitsSchema,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  resolveStarterCreditAmountKzt,
  timestampFromDate,
  type AccountId,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type KztMinorUnits,
  type MonetaryEvent,
  type Wallet,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { assertStarterCreditGrantAuthorization } from './financeAuthorization';
import { buildStarterCreditGrantAuditPlan } from './financeAudit';
import {
  FINANCE_PLANNING_ESTIMATES,
  accountPath,
  initialWallet,
  mergeWalletBalance,
  monetaryEventPath,
  parseAccount,
  parseWallet,
  toFirestoreWritePayload,
  walletPath,
} from './financeStore';

const STARTER_CREDIT_SETTING_PATH = 'settings/starter_credit';
const STARTER_CREDIT_GRANT_MARKER_BYTES = 192;

function starterCreditGrantPath(accountId: AccountId): string {
  return `users/${accountId}/wallet/starter_credit_grant`;
}

function isGrantMarkerPresent(data: Record<string, unknown> | undefined): boolean {
  return data?.granted === true;
}

export function grantStarterCreditHandler(
  envelope: CommandEnvelope<'grant_starter_credit'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'grant_starter_credit'>> {
  assertStarterCreditGrantAuthorization(envelope);
  const actor = envelope.context.actor;
  if (actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  const accountId = AccountIdSchema.parse(actor.accountId);
  const metadata = resolveCommandIdempotencyIdentity(envelope);
  const walletDocumentPath = walletPath(accountId);
  const accountDocumentPath = accountPath(accountId);
  const grantDocumentPath = starterCreditGrantPath(accountId);
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandKey, 0);

  let existingWallet: Wallet | undefined;
  let walletExists = false;
  let alreadyGranted = false;
  let grantAmountKzt: KztMinorUnits = KztMinorUnitsSchema.parse(0);
  let plannedWalletRevision = AggregateRevisionSchema.parse(1);
  let plannedEventRevision = AggregateRevisionSchema.parse(0);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'grant_starter_credit'> = {
    read: async (session) => {
      const accountRead = await session.tx.get({ path: accountDocumentPath });
      session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account || account.lifecycle.status !== 'active') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const grantRead = await session.tx.get({ path: grantDocumentPath });
      session.plan.planRead({ path: grantDocumentPath, category: 'payment_wallet' });
      alreadyGranted = grantRead.exists && isGrantMarkerPresent(grantRead.data);
      if (alreadyGranted) {
        return;
      }

      const settingRead = await session.tx.get({ path: STARTER_CREDIT_SETTING_PATH });
      session.plan.planRead({ path: STARTER_CREDIT_SETTING_PATH, category: 'authorization_check' });
      grantAmountKzt = KztMinorUnitsSchema.parse(
        resolveStarterCreditAmountKzt(settingRead.exists ? settingRead.data : undefined)
      );

      session.plan.planMutation({
        path: grantDocumentPath,
        kind: 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: STARTER_CREDIT_GRANT_MARKER_BYTES,
      });

      if (grantAmountKzt <= 0) {
        return;
      }

      const walletRead = await session.tx.get({ path: walletDocumentPath });
      session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
      existingWallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
      walletExists = walletRead.exists;
      plannedWalletRevision = walletExists
        ? nextAggregateRevision(existingWallet!.revision)
        : AggregateRevisionSchema.parse(1);
      plannedEventRevision = walletExists
        ? nextAggregateRevision(existingWallet!.eventRevision)
        : AggregateRevisionSchema.parse(1);

      session.plan.planMutation({
        path: walletDocumentPath,
        kind: walletExists ? 'update' : 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
      });
      session.plan.planMutation({
        path: monetaryEventPath(stagedEventId),
        kind: 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
      });
    },
    planAuditOutbox: async () =>
      buildStarterCreditGrantAuditPlan({
        envelope,
        accountId,
        alreadyGranted,
        amountKzt: grantAmountKzt,
        monetaryEventIds: alreadyGranted || grantAmountKzt <= 0 ? [] : [stagedEventId],
        walletRevision: plannedWalletRevision,
      }),
    execute: async (session, context) => {
      if (alreadyGranted) {
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      }

      const decidedAt = timestampFromDate(context.decidedAt);
      session.tx.create(
        { path: grantDocumentPath },
        {
          granted: true,
          amountKzt: grantAmountKzt,
          grantedAt: decidedAt,
        }
      );

      if (grantAmountKzt <= 0) {
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      }

      const wallet = existingWallet ?? initialWallet(accountId, decidedAt);
      const newBalance = creditWalletBalance(wallet.balance, grantAmountKzt);
      const updatedWallet = mergeWalletBalance(wallet, newBalance, {
        revision: plannedWalletRevision,
        eventRevision: plannedEventRevision,
        updatedAt: decidedAt,
      });

      const monetaryEvent: MonetaryEvent = {
        eventId: stagedEventId,
        eventKind: 'wallet_credit',
        currency: 'KZT',
        walletAccountId: accountId,
        walletBalanceDelta: grantAmountKzt,
        sourceKind: 'system',
        actor: { kind: 'account', accountId },
        commandId: metadata.commandKey,
        correlationId: envelope.context.correlationId,
        walletEventRevision: plannedEventRevision,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      };

      if (walletExists) {
        session.tx.update(
          { path: walletDocumentPath },
          toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
        );
      } else {
        session.tx.create(
          { path: walletDocumentPath },
          toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
        );
      }
      session.tx.create(
        { path: monetaryEventPath(monetaryEvent.eventId) },
        toFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
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

export function createStarterCreditCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Partial<CommandHandlerMap> {
  return {
    grant_starter_credit: (envelope, environment) =>
      grantStarterCreditHandler(envelope, environment, executor),
  };
}
