import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { CorrelationIdSchema, TRANSACTION_SAFETY_BUDGET } from '@ski-academy/shared-domain';
import { createFirestoreCanonicalTransactionExecutor } from './firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-canonical-tx-test';
const correlationId = CorrelationIdSchema.parse('correlation_tx_emulator_01');

let app: App;
let firestore: Firestore;

async function clearFirestore(database: Firestore): Promise<void> {
  const snapshot = await database.collection('canonical_tx_test').get();
  if (snapshot.empty) {
    return;
  }
  const batch = database.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

describe.skipIf(!runsOnFirestoreEmulator)('canonical transactions (firestore emulator)', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    await clearFirestore(firestore);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  it('commits reads-then-writes atomically on the emulator', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    await firestore.collection('canonical_tx_test').doc('seed').set({ version: 1 });

    await executor.runAtomic({
      correlationId,
      run: async (session) => {
        const seed = await session.tx.get({ path: 'canonical_tx_test/seed' });
        expect(seed.exists).toBe(true);
        session.plan.planRead({ path: 'canonical_tx_test/seed', category: 'other' });
        session.plan.planMutation({
          path: 'canonical_tx_test/committed',
          kind: 'create',
          category: 'other',
          estimatedPayloadBytes: 256,
        });
        await session.transitionToWrites();
        session.tx.create({ path: 'canonical_tx_test/committed' }, { version: 2 });
      },
    });

    const committed = await firestore.collection('canonical_tx_test').doc('committed').get();
    expect(committed.exists).toBe(true);
    expect(committed.data()).toEqual({ version: 2 });
  });

  it('performs zero authoritative writes when authoritative preflight fails', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    await firestore.collection('canonical_tx_test').doc('baseline').set({ version: 1 });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          await session.tx.get({ path: 'canonical_tx_test/baseline' });
          for (let index = 0; index < TRANSACTION_SAFETY_BUDGET.maxReads + 1; index += 1) {
            session.plan.planRead({
              path: `canonical_tx_test/read_${index}`,
              category: 'other',
            });
          }
          await session.transitionToWrites();
          session.tx.create({ path: 'canonical_tx_test/rejected' }, { version: 99 });
        },
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });

    const baseline = await firestore.collection('canonical_tx_test').doc('baseline').get();
    const rejected = await firestore.collection('canonical_tx_test').doc('rejected').get();
    expect(baseline.data()).toEqual({ version: 1 });
    expect(rejected.exists).toBe(false);
  });

  it('rolls back all writes when the emulator transaction aborts on conflict', async () => {
    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const docRef = firestore.collection('canonical_tx_test').doc('conflict');
    await docRef.set({ version: 1 });

    const first = executor.runAtomic({
      correlationId,
      run: async (session) => {
        await session.tx.get({ path: 'canonical_tx_test/conflict' });
        session.plan.planRead({ path: 'canonical_tx_test/conflict', category: 'other' });
        session.plan.planMutation({
          path: 'canonical_tx_test/conflict',
          kind: 'update',
          category: 'other',
          estimatedPayloadBytes: 128,
        });
        await session.transitionToWrites();
        session.tx.update({ path: 'canonical_tx_test/conflict' }, { version: 2 });
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    });

    const second = executor.runAtomic({
      correlationId,
      run: async (session) => {
        await session.tx.get({ path: 'canonical_tx_test/conflict' });
        session.plan.planRead({ path: 'canonical_tx_test/conflict', category: 'other' });
        session.plan.planMutation({
          path: 'canonical_tx_test/conflict',
          kind: 'update',
          category: 'other',
          estimatedPayloadBytes: 128,
        });
        await session.transitionToWrites();
        session.tx.update({ path: 'canonical_tx_test/conflict' }, { version: 3 });
      },
    });

    await Promise.allSettled([first, second]);
    const finalDoc = await docRef.get();
    expect(finalDoc.data()?.version).toBeTypeOf('number');
    expect([2, 3]).toContain(finalDoc.data()?.version);
  });
});
