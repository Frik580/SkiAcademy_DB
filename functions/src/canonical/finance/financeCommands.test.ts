import { describe, expect, it } from 'vitest';
import {
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  PaymentSchema,
  WalletSchema,
  accountCommandActor,
  activityLogIdFromCommandId,
  monetaryEventIdFromCommandEffect,
  providerEventReceiptIdFromProviderEvent,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
  type Payment,
  type Wallet,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_finance_cmd_01');
const accountId = 'account_finance_cmd_01';
const paymentId = 'payment_finance_cmd_01';
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function adminContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(accountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
  };
}

function seedAccount() {
  return AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

function seedWallet(balance = 50_000): Wallet {
  return WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function seedPayment(overrides: Partial<Payment> = {}): Payment {
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'booking',
    subjectId: 'booking_finance_cmd_01',
    currency: 'KZT',
    originalPrice: 100_000,
    price: 100_000,
    paidAmount: 30_000,
    refundedAmount: 0,
    retainedAmount: 30_000,
    settledAmount: 30_000,
    writtenOffAmount: 0,
    outstandingAmount: 70_000,
    paymentStatus: 'partially_paid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    ...overrides,
  });
}

async function runCommand<Kind extends CommandEnvelope['kind']>(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<Kind>
) {
  return createProductionCanonicalCommands(environment(), executor).execute(envelope);
}

describe('finance commands', () => {
  it('credits wallet balance with monetary event and audit references only', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(10_000),
    });

    const envelope: CommandEnvelope<'record_manual_wallet_funding'> = {
      kind: 'record_manual_wallet_funding',
      context: {
        ...adminContext('wallet-credit-1'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        accountId,
        amount: 5_000,
        reasonExplanation: 'Manual top-up for testing',
      },
    };

    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(15_000);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    const eventId = monetaryEventIdFromCommandEffect(identity.commandKey, 0);
    expect(snapshot.docs.get(`monetary_events/${eventId}`)?.data.eventKind).toBe('wallet_credit');

    const audit = snapshot.docs.get(
      `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`
    )?.data;
    expect(audit?.monetaryEventIds).toEqual([eventId]);
    expect(JSON.stringify(audit?.effects ?? [])).not.toMatch(
      /\d{3,}|paidAmount|outstanding|walletBalanceDelta/i
    );
  });

  it('replays wallet funding without double credit', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(10_000),
    });

    const envelope: CommandEnvelope<'record_manual_wallet_funding'> = {
      kind: 'record_manual_wallet_funding',
      context: {
        ...adminContext('wallet-credit-replay'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        accountId,
        amount: 5_000,
        reasonExplanation: 'Manual top-up for testing',
      },
    };

    await runCommand(executor, envelope);
    await runCommand(executor, envelope);

    const wallet = executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data;
    expect(wallet?.balance).toBe(15_000);
  });

  it('applies two distinct wallet funding actions exactly once each', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(10_000),
    });

    const first: CommandEnvelope<'record_manual_wallet_funding'> = {
      kind: 'record_manual_wallet_funding',
      context: {
        ...adminContext('wallet-credit-distinct-a'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { accountId, amount: 5_000, reasonExplanation: 'First distinct funding' },
    };
    const second: CommandEnvelope<'record_manual_wallet_funding'> = {
      kind: 'record_manual_wallet_funding',
      context: {
        ...adminContext('wallet-credit-distinct-b'),
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
      intent: { accountId, amount: 7_000, reasonExplanation: 'Second distinct funding' },
    };

    await runCommand(executor, first);
    await runCommand(executor, second);
    await runCommand(executor, second);

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data).toMatchObject({
      balance: 22_000,
      revision: 3,
    });
  });

  it('records external payment funding on payment projection', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`payments/${paymentId}`]: seedPayment(),
    });

    const envelope: CommandEnvelope<'record_provider_payment_event'> = {
      kind: 'record_provider_payment_event',
      context: {
        ...adminContext('external-payment-1'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        amount: 20_000,
        sourceKind: 'manual_external',
        manualReference: 'bank-transfer-ref-001',
      },
    };

    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');

    const payment = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
    expect(payment?.paidAmount).toBe(50_000);
    expect(payment?.outstandingAmount).toBe(50_000);
  });

  it('deduplicates provider payment events by receipt identity', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`payments/${paymentId}`]: seedPayment(),
    });

    const envelope: CommandEnvelope<'record_provider_payment_event'> = {
      kind: 'record_provider_payment_event',
      context: {
        ...adminContext('provider-payment-1'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        amount: 20_000,
        sourceKind: 'provider',
        providerKind: 'stripe',
        providerEventId: 'evt_provider_001',
        providerTransactionRef: 'pi_123',
      },
    };

    const first = await runCommand(executor, envelope);
    expect(first.status).toBe('success');

    const replay = await runCommand(executor, {
      ...envelope,
      context: {
        ...envelope.context,
        idempotencyKey: 'provider-payment-2',
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
    });
    expect(replay.status).toBe('error');
    expect(replay.status === 'error' ? replay.error.code : '').toBe('idempotency_conflict');

    const receiptId = providerEventReceiptIdFromProviderEvent({
      providerKind: 'stripe',
      providerEventId: 'evt_provider_001',
    });
    expect(
      executor.snapshot().docs.get(`provider_event_receipts/${receiptId}`)?.data
    ).toBeDefined();
  });

  it('adjusts service price down and refunds excess to wallet', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(0),
      [`payments/${paymentId}`]: seedPayment({
        paidAmount: 100_000,
        retainedAmount: 100_000,
        settledAmount: 100_000,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      }),
    });

    const envelope: CommandEnvelope<'adjust_service_price'> = {
      kind: 'adjust_service_price',
      context: {
        ...adminContext('price-decrease-1'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        newPrice: 80_000,
        walletAccountId: accountId,
        reasonExplanation: 'Duration reduced',
      },
    };

    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const payment = snapshot.docs.get(`payments/${paymentId}`)?.data;
    expect(payment?.price).toBe(80_000);
    expect(payment?.settledAmount).toBe(80_000);
    expect(payment?.refundedAmount).toBe(20_000);

    const wallet = snapshot.docs.get(`users/${accountId}/wallet/state`)?.data;
    expect(wallet?.balance).toBe(20_000);
  });

  it('funds price increase from wallet on fully paid payment without payerAccountId', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(5_000),
      [`payments/${paymentId}`]: seedPayment({
        paidAmount: 100_000,
        retainedAmount: 100_000,
        settledAmount: 100_000,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      }),
    });

    const result = await runCommand(executor, {
      kind: 'adjust_service_price',
      context: {
        ...adminContext('price-increase-fully-paid'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        newPrice: 110_000,
        fundingAmount: 4_000,
        walletAccountId: accountId,
        reasonExplanation: 'Price increase',
      },
    });

    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      1_000
    );
  });

  it('rejects wallet debit when funds are insufficient for funded price increase', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: seedAccount(),
      [`users/${accountId}/wallet/state`]: seedWallet(1_000),
      [`payments/${paymentId}`]: seedPayment(),
    });

    const envelope: CommandEnvelope<'adjust_service_price'> = {
      kind: 'adjust_service_price',
      context: {
        ...adminContext('price-increase-insufficient'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        newPrice: 110_000,
        fundingAmount: 10_000,
        walletAccountId: accountId,
        reasonExplanation: 'Price increase',
      },
    };

    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('error');
    expect(result.status === 'error' ? result.error.code : '').toBe('insufficient_funds');
  });
});
