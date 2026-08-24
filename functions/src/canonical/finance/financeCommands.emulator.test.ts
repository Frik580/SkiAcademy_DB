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
  monetaryEventIdFromCommandEffect,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-finance-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_finance_emulator_01');
const accountId = 'account_finance_emulator_01';
const paymentId = 'payment_finance_emulator_01';
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

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

function seedPayment() {
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'booking',
    subjectId: 'booking_finance_emulator_01',
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
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
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

describe.skipIf(!runsOnFirestoreEmulator)('finance commands emulator concurrency', () => {
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
    await clearCollections([
      'users',
      'payments',
      'monetary_events',
      'activity_logs',
      'command_idempotency',
      'provider_event_receipts',
    ]);
    await firestore.collection('users').doc(accountId).set(seedAccount());
    await firestore
      .collection('users')
      .doc(accountId)
      .collection('wallet')
      .doc('state')
      .set(seedWallet(5_000));
    await firestore.collection('payments').doc(paymentId).set(seedPayment());
  });

  it(
    'prevents concurrent wallet debits from overspending the same balance',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
      };
      const commands = createProductionCanonicalCommands(environment, executor);

      const envelopeA: CommandEnvelope<'adjust_service_price'> = {
        kind: 'adjust_service_price',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'concurrent-debit-a',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: {
          paymentId,
          newPrice: 110_000,
          fundingAmount: 4_000,
          walletAccountId: accountId,
          reasonExplanation: 'Concurrent increase A',
        },
      };

      const envelopeB: CommandEnvelope<'adjust_service_price'> = {
        kind: 'adjust_service_price',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'concurrent-debit-b',
          correlationId: CorrelationIdSchema.parse('correlation_finance_emulator_02'),
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: {
          paymentId,
          newPrice: 110_000,
          fundingAmount: 4_000,
          walletAccountId: accountId,
          reasonExplanation: 'Concurrent increase B',
        },
      };

      const [resultA, resultB] = await Promise.all([
        commands.execute(envelopeA),
        commands.execute(envelopeB),
      ]);

      const successes = [resultA, resultB].filter((result) => result.status === 'success');
      const insufficient = [resultA, resultB].filter(
        (result) => result.status === 'error' && result.error.code === 'insufficient_funds'
      );

      expect(successes).toHaveLength(1);
      expect(insufficient).toHaveLength(1);

      const walletSnapshot = await firestore
        .collection('users')
        .doc(accountId)
        .collection('wallet')
        .doc('state')
        .get();
      expect(walletSnapshot.data()?.balance).toBe(1_000);
    },
    30_000
  );

  it(
    'does not duplicate monetary events on exact command replay',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
      };
      const commands = createProductionCanonicalCommands(environment, executor);

      const envelope: CommandEnvelope<'record_manual_wallet_funding'> = {
        kind: 'record_manual_wallet_funding',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'wallet-replay-emulator',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: {
          accountId,
          amount: 1_000,
          reasonExplanation: 'Replay test credit',
        },
      };

      await commands.execute(envelope);
      await commands.execute(envelope);

      const identity = resolveCommandIdempotencyIdentity(envelope);
      const eventId = monetaryEventIdFromCommandEffect(identity.commandKey, 0);
      const events = await firestore.collection('monetary_events').where('eventId', '==', eventId).get();
      expect(events.size).toBe(1);
    },
    30_000
  );
});
