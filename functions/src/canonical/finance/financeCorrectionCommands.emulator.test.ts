import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  PaymentSchema,
  WalletSchema,
  accountCommandActor,
  adminIssueIdFromDedupeKey,
  adminIssueDedupeKeyFromIdentity,
  financialReconciliationMismatchIdentity,
  monetaryEventIdFromCommandEffect,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
  type Payment,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { createFirestoreMonetaryEventLoader } from './financeCorrectionCommands';

const PROJECT_ID = 'ski-academy-finance-correction-emulator';
const correlationId = CorrelationIdSchema.parse('correlation_fin_corr_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_fin_corr_emulator_02');
const accountId = 'account_fin_corr_emulator_01';
const paymentId = 'payment_fin_corr_emulator_01';
const bookingId = 'booking_fin_corr_emulator_01';
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

function adminContext(idempotencyKey: string, correlation = correlationId) {
  return {
    actor: accountCommandActor(accountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId: correlation,
    source: 'admin_callable' as const,
    expectedRevision: AggregateRevisionSchema.parse(1),
  };
}

function systemReconciliationContext(idempotencyKey: string, correlation = correlationId) {
  return {
    actor: { kind: 'system' as const, systemActorId: 'system_reconcile' },
    exercisedCapability: 'system' as const,
    idempotencyKey,
    correlationId: correlation,
    source: 'system_reconciliation' as const,
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

function seedWallet(balance: number) {
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
    subjectId: bookingId,
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

async function clearCollections(collections: readonly string[]): Promise<void> {
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function seedMismatchPaymentFixture(): Promise<void> {
  await clearCollections([
    'users',
    'payments',
    'monetary_events',
    'admin_issues',
    'activity_logs',
    'command_idempotency',
  ]);
  await firestore.collection('users').doc(accountId).set(seedAccount());
  await firestore
    .collection('users')
    .doc(accountId)
    .collection('wallet')
    .doc('state')
    .set(seedWallet(0));
  await firestore
    .collection('payments')
    .doc(paymentId)
    .set(
      seedPayment({
        paidAmount: 30_000,
        retainedAmount: 30_000,
        settledAmount: 30_000,
        outstandingAmount: 70_000,
        paymentStatus: 'partially_paid',
      })
    );
}

async function seedCorrectionFixture(): Promise<void> {
  await clearCollections([
    'users',
    'payments',
    'monetary_events',
    'admin_issues',
    'activity_logs',
    'command_idempotency',
  ]);
  await firestore.collection('users').doc(accountId).set(seedAccount());
  await firestore
    .collection('users')
    .doc(accountId)
    .collection('wallet')
    .doc('state')
    .set(seedWallet(0));
  await firestore.collection('payments').doc(paymentId).set(seedPayment());
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    executor,
    { monetaryEventLoader: createFirestoreMonetaryEventLoader(firestore) }
  );
}

function reconcileEnvelope(idempotencyKey: string, correlation = correlationId) {
  return {
    kind: 'record_audit_correction' as const,
    context: systemReconciliationContext(idempotencyKey, correlation),
    intent: {
      operation: 'reconcile_payment' as const,
      paymentId,
    },
  };
}

function refundCorrectionEnvelope(
  idempotencyKey: string,
  amount: number,
  expectedPaymentRevision = 1
): CommandEnvelope<'record_financial_correction'> {
  return {
    kind: 'record_financial_correction',
    context: adminContext(idempotencyKey),
    intent: {
      correctionKind: 'admin_refund',
      paymentId,
      amount,
      expectedPaymentRevision,
      walletAccountId: accountId,
      expectedWalletRevision: 1,
      reasonExplanation: 'Emulator correction refund',
    },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('finance correction commands emulator', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await seedMismatchPaymentFixture();
  });

  it(
    'A. reconciliation detects mismatch without financial mutation',
    async () => {
      const commands = createCommands();
      const paymentBefore = (await firestore.collection('payments').doc(paymentId).get()).data();
      const walletBefore = (
        await firestore.collection('users').doc(accountId).collection('wallet').doc('state').get()
      ).data();

      const result = await commands.execute(reconcileEnvelope('reconcile-a'));
      expect(result.status).toBe('success');

      const paymentAfter = (await firestore.collection('payments').doc(paymentId).get()).data();
      const walletAfter = (
        await firestore.collection('users').doc(accountId).collection('wallet').doc('state').get()
      ).data();
      expect(paymentAfter).toEqual(paymentBefore);
      expect(walletAfter).toEqual(walletBefore);

      const events = await firestore.collection('monetary_events').get();
      expect(events.size).toBe(0);

      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(1);
      expect(issues.docs[0]?.data().kind).toBe('financial_reconciliation_mismatch');
    },
    30_000
  );

  it(
    'B. reconciliation replay and concurrent dedupe create one AdminIssue',
    async () => {
      const commands = createCommands();
      const [first, second] = await Promise.all([
        commands.execute(reconcileEnvelope('reconcile-b1', correlationId)),
        commands.execute(reconcileEnvelope('reconcile-b2', correlationIdB)),
      ]);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const issues = await firestore.collection('admin_issues').get();
      expect(issues.size).toBe(1);

      const replay = await commands.execute(reconcileEnvelope('reconcile-b1', correlationId));
      expect(replay.status).toBe('success');
      expect((await firestore.collection('admin_issues').get()).size).toBe(1);
    },
    30_000
  );

  it(
    'C. admin correction commits payment, wallet, event, audit, and idempotency atomically',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const envelope = refundCorrectionEnvelope('corr-atomic-c', 15_000);
      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');

      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      const wallet = (
        await firestore.collection('users').doc(accountId).collection('wallet').doc('state').get()
      ).data();
      const events = await firestore.collection('monetary_events').get();
      const audits = await firestore.collection('activity_logs').get();
      const idem = await firestore.collection('command_idempotency').get();

      expect(payment?.refundedAmount).toBe(15_000);
      expect(wallet?.balance).toBe(15_000);
      expect(events.size).toBe(1);
      expect(audits.size).toBe(1);
      expect(idem.size).toBe(1);
    },
    30_000
  );

  it(
    'D. correction replay does not duplicate payment, wallet, event, or audit',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const envelope = refundCorrectionEnvelope('corr-replay-d', 10_000);
      await commands.execute(envelope);
      await commands.execute(envelope);

      const identity = resolveCommandIdempotencyIdentity(envelope);
      const eventId = monetaryEventIdFromCommandEffect(identity.commandKey, 0);
      expect((await firestore.collection('monetary_events').doc(eventId).get()).exists).toBe(true);
      expect((await firestore.collection('monetary_events').get()).size).toBe(1);
      expect((await firestore.collection('activity_logs').get()).size).toBe(1);
      expect(
        (await firestore.collection('payments').doc(paymentId).get()).data()?.refundedAmount
      ).toBe(10_000);
    },
    30_000
  );

  it(
    'E. correction vs provider payment event serializes without double settlement',
    async () => {
      await seedCorrectionFixture();
      await firestore.collection('payments').doc(paymentId).set(
        seedPayment({
          paidAmount: 30_000,
          retainedAmount: 30_000,
          settledAmount: 30_000,
          outstandingAmount: 70_000,
          paymentStatus: 'partially_paid',
        })
      );

      const commands = createCommands();
      const providerEnvelope: CommandEnvelope<'record_provider_payment_event'> = {
        kind: 'record_provider_payment_event',
        context: adminContext('provider-race-e', correlationIdB),
        intent: {
          paymentId,
          amount: 20_000,
          sourceKind: 'manual_external',
          manualReference: 'bank-transfer-race-e',
        },
      };
      const correctionEnvelope = refundCorrectionEnvelope('corr-race-e', 5_000);

      const settled = await Promise.allSettled([
        commands.execute(providerEnvelope),
        commands.execute(correctionEnvelope),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      expect(payment?.paidAmount).toBeGreaterThanOrEqual(30_000);
      expect(payment?.refundedAmount).toBeLessThanOrEqual(payment?.paidAmount ?? 0);
      expect(payment?.outstandingAmount).toBeGreaterThanOrEqual(0);
    },
    30_000
  );

  it(
    'H. incremental requirement inconsistency opens deterministic AdminIssue without party mutation',
    async () => {
      await seedCorrectionFixture();
      const base = seedPayment({
        paidAmount: 50_000,
        retainedAmount: 50_000,
        settledAmount: 50_000,
        outstandingAmount: 50_000,
        paymentStatus: 'partially_paid',
      });
      await firestore.collection('payments').doc(paymentId).set({
        ...base,
        incrementalRequirements: [
          {
            incrementalRequirementId: 'incr_req_emulator_h_01',
            participantId: 'participant_emulator_h_01',
            createdAt: decidedAt,
            createdByCommandId: 'command_seed',
            requiredPriceDelta: 20_000,
            allocatedSettledAmount: 30_000,
            allocatedRetainedAmount: 30_000,
            state: 'active',
          },
        ],
      });

      const commands = createCommands();
      const result = await commands.execute(reconcileEnvelope('reconcile-h'));
      expect(result.status).toBe('success');

      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      expect(payment?.incrementalRequirements?.[0]?.allocatedSettledAmount).toBe(30_000);

      const issueId = adminIssueIdFromDedupeKey(
        adminIssueDedupeKeyFromIdentity(
          financialReconciliationMismatchIdentity({
            subjectKind: 'booking',
            subjectId: bookingId,
            reconciliationScope: 'payment_invariants',
          })
        )
      );
      expect((await firestore.collection('admin_issues').doc(issueId).get()).exists).toBe(true);
    },
    30_000
  );

  it(
    'J. historical monetary events remain unchanged after compensating correction',
    async () => {
      await seedCorrectionFixture();
      const historicalEventId = 'monetary_event_hist_j_01';
      const historicalEvent = {
        eventId: historicalEventId,
        eventKind: 'external_payment',
        currency: 'KZT',
        paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
        paymentEffect: {
          paidAmountDelta: 100_000,
          settledAmountDelta: 100_000,
          outstandingAmountDelta: -100_000,
        },
        sourceKind: 'manual_external',
        manualReference: 'seed-historical',
        actor: { kind: 'system', systemActorId: 'seed' },
        commandId: 'command_seed_event',
        correlationId: 'correlation_seed_event',
        paymentEventRevision: 1,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      };
      await firestore.collection('monetary_events').doc(historicalEventId).set(historicalEvent);

      const commands = createCommands();
      const envelope: CommandEnvelope<'record_financial_correction'> = {
        kind: 'record_financial_correction',
        context: adminContext('corr-hist-j'),
        intent: {
          correctionKind: 'compensating_event',
          paymentId,
          correctsEventId: historicalEventId,
          paymentEffect: { refundedAmountDelta: 5_000 },
          expectedPaymentRevision: 1,
          reasonExplanation: 'Reverse over-credited external payment',
        },
      };
      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');

      const historicalAfter = (await firestore.collection('monetary_events').doc(historicalEventId).get()).data();
      expect(historicalAfter).toEqual(historicalEvent);
      expect((await firestore.collection('monetary_events').get()).size).toBe(2);
    },
    30_000
  );

  it(
    'K. illegal correction beyond retained leaves durable state unchanged',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const paymentBefore = (await firestore.collection('payments').doc(paymentId).get()).data();
      const result = await commands.execute(refundCorrectionEnvelope('corr-bounds-k', 200_000));
      expect(result.status).toBe('error');

      const paymentAfter = (await firestore.collection('payments').doc(paymentId).get()).data();
      expect(paymentAfter).toEqual(paymentBefore);
      expect((await firestore.collection('monetary_events').get()).size).toBe(0);
    },
    30_000
  );

  it(
    'L. stale payment revision rejects second correction based on old revision',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const first = await commands.execute(refundCorrectionEnvelope('corr-stale-l-a', 5_000));
      expect(first.status).toBe('success');

      const stale = await commands.execute(refundCorrectionEnvelope('corr-stale-l-b', 5_000, 1));
      expect(stale.status).toBe('error');

      expect(
        (await firestore.collection('payments').doc(paymentId).get()).data()?.refundedAmount
      ).toBe(5_000);
    },
    30_000
  );

  it(
    'N. correction with absent optional metadata serializes without undefined write errors',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const envelope: CommandEnvelope<'record_financial_correction'> = {
        kind: 'record_financial_correction',
        context: adminContext('corr-undefined-n'),
        intent: {
          correctionKind: 'write_off',
          paymentId,
          amount: 10_000,
          expectedPaymentRevision: 1,
          reasonExplanation: 'Write off unpaid balance',
        },
      };
      await firestore.collection('payments').doc(paymentId).set(
        seedPayment({
          paidAmount: 0,
          retainedAmount: 0,
          settledAmount: 0,
          outstandingAmount: 100_000,
          paymentStatus: 'unpaid',
        })
      );

      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');
      expect(
        (await firestore.collection('payments').doc(paymentId).get()).data()?.writtenOffAmount
      ).toBe(10_000);
    },
    30_000
  );
});
