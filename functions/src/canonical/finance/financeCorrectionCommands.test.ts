import { describe, expect, it } from 'vitest';
import {
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  PaymentSchema,
  WalletSchema,
  accountCommandActor,
  monetaryEventIdFromCommandEffect,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
  type Payment,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor, type CanonicalTransactionExecutor } from '../transactions';
import { createSnapshotMonetaryEventLoader } from './financeCorrectionCommands';

const correlationId = CorrelationIdSchema.parse('correlation_fin_correction_01');
const accountId = 'account_fin_correction_01';
const paymentId = 'payment_fin_correction_01';
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
    expectedRevision: AggregateRevisionSchema.parse(1),
  };
}

function systemReconciliationContext(idempotencyKey: string) {
  return {
    actor: { kind: 'system' as const, systemActorId: 'system_reconcile' },
    exercisedCapability: 'system' as const,
    idempotencyKey,
    correlationId,
    source: 'system_reconciliation' as const,
  };
}

function seedPayment(overrides: Partial<Payment> = {}): Payment {
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'booking',
    subjectId: 'booking_fin_correction_01',
    currency: 'KZT',
    originalPrice: 100_000,
    price: 100_000,
    paidAmount: 100_000,
    refundedAmount: 0,
    retainedAmount: 100_000,
    settledAmount: 100_000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    payerAccountId: accountId,
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
  envelope: CommandEnvelope<Kind>,
  eventLoader?: ReturnType<typeof createSnapshotMonetaryEventLoader>
) {
  return createProductionCanonicalCommands(environment(), executor, { monetaryEventLoader: eventLoader }).execute(
    envelope
  );
}

describe('finance correction commands', () => {
  it('rejects non-admin financial correction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`payments/${paymentId}`]: seedPayment(),
    });
    const result = await runCommand(executor, {
      kind: 'record_financial_correction',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'corr_forbidden',
        correlationId,
        source: 'client_callable',
      },
      intent: {
        correctionKind: 'admin_refund',
        paymentId,
        amount: 1_000,
        expectedPaymentRevision: 1,
        reasonExplanation: 'Should fail',
      },
    });
    expect(result.status).toBe('error');
  });

  it('records admin refund with compensating monetary event', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId,
        },
      }),
      [`users/${accountId}/wallet/state`]: WalletSchema.parse({
        accountId,
        currency: 'KZT',
        balance: 0,
        revision: 1,
        eventRevision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      }),
      [`payments/${paymentId}`]: seedPayment(),
    });

    const envelope: CommandEnvelope<'record_financial_correction'> = {
      kind: 'record_financial_correction',
      context: adminContext('corr_refund_01'),
      intent: {
        correctionKind: 'admin_refund',
        paymentId,
        amount: 20_000,
        expectedPaymentRevision: 1,
        walletAccountId: accountId,
        expectedWalletRevision: 1,
        reasonExplanation: 'Goodwill refund',
      },
    };

    const identity = resolveCommandIdempotencyIdentity(envelope);
    const eventId = monetaryEventIdFromCommandEffect(identity.commandKey, 0);
    const first = await runCommand(executor, envelope);
    const second = await runCommand(executor, envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');

    const snapshot = executor.snapshot();
    const payment = snapshot.docs.get(`payments/${paymentId}`)?.data;
    expect(payment?.refundedAmount).toBe(20_000);
    expect(payment?.retainedAmount).toBe(80_000);
    expect(snapshot.docs.get(`monetary_events/${eventId}`)?.data.eventKind).toBe('refund_to_wallet');
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(20_000);
  });

  it('reconciles payment mismatch without mutating financial state', async () => {
    const payment = seedPayment({
      paidAmount: 30_000,
      retainedAmount: 30_000,
      settledAmount: 30_000,
      outstandingAmount: 70_000,
      paymentStatus: 'partially_paid',
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`payments/${paymentId}`]: payment,
    });
    const eventLoader = createSnapshotMonetaryEventLoader(
      [...executor.snapshot().docs.entries()].map(([path, doc]) => [path, doc.data])
    );

    const envelope: CommandEnvelope<'record_audit_correction'> = {
      kind: 'record_audit_correction',
      context: systemReconciliationContext('reconcile_payment_01'),
      intent: {
        operation: 'reconcile_payment',
        paymentId,
      },
    };

    const before = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
    const result = await runCommand(executor, envelope, eventLoader);
    expect(result.status).toBe('success');
    const after = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
    expect(after).toEqual(before);
    const issues = [...executor.snapshot().docs.entries()].filter(([path]) =>
      path.startsWith('admin_issues/')
    );
    expect(issues.length).toBe(1);
  });

  it('rejects stale payment revision on correction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`payments/${paymentId}`]: seedPayment(),
    });
    const result = await runCommand(executor, {
      kind: 'record_financial_correction',
      context: adminContext('corr_stale'),
      intent: {
        correctionKind: 'write_off',
        paymentId,
        amount: 10_000,
        expectedPaymentRevision: 99,
        reasonExplanation: 'Stale',
      },
    });
    expect(result.status).toBe('error');
  });

  it('rejects refund beyond retained amount', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId,
        },
      }),
      [`users/${accountId}/wallet/state`]: WalletSchema.parse({
        accountId,
        currency: 'KZT',
        balance: 0,
        revision: 1,
        eventRevision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      }),
      [`payments/${paymentId}`]: seedPayment(),
    });
    const before = executor.snapshot().docs.get(`payments/${paymentId}`)?.data;
    const result = await runCommand(executor, {
      kind: 'record_financial_correction',
      context: adminContext('corr_over_refund'),
      intent: {
        correctionKind: 'admin_refund',
        paymentId,
        amount: 200_000,
        expectedPaymentRevision: 1,
        walletAccountId: accountId,
        expectedWalletRevision: 1,
        reasonExplanation: 'Too much',
      },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`payments/${paymentId}`)?.data).toEqual(before);
  });

  it('does not duplicate monetary events when transaction callback is retried', async () => {
    const inner = createInMemoryCanonicalTransactionExecutor(
      {
        [`users/${accountId}`]: AccountSchema.parse({
          accountId,
          lifecycle: { status: 'active' },
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'command_seed',
            lastChangedByCommandId: 'command_seed',
            correlationId,
          },
        }),
        [`users/${accountId}/wallet/state`]: WalletSchema.parse({
          accountId,
          currency: 'KZT',
          balance: 0,
          revision: 1,
          eventRevision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        }),
        [`payments/${paymentId}`]: seedPayment({
          paidAmount: 0,
          retainedAmount: 0,
          settledAmount: 0,
          outstandingAmount: 100_000,
          paymentStatus: 'unpaid',
        }),
      },
      { simulateRetry: true }
    );
    let callbackInvocations = 0;
    const executor: CanonicalTransactionExecutor & {
      snapshot: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>['snapshot'];
    } = {
      snapshot: () => inner.snapshot(),
      async runAtomic(input) {
        return inner.runAtomic({
          ...input,
          run: async (session) => {
            callbackInvocations += 1;
            const result = await input.run(session);
            if (callbackInvocations === 1) {
              throw new Error('TRANSACTION_ABORTED');
            }
            return result;
          },
        });
      },
    };

    const envelope: CommandEnvelope<'record_financial_correction'> = {
      kind: 'record_financial_correction',
      context: adminContext('corr_retry_safe'),
      intent: {
        correctionKind: 'write_off',
        paymentId,
        amount: 10_000,
        expectedPaymentRevision: 1,
        reasonExplanation: 'Retry-safe write-off',
      },
    };
    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });
});
