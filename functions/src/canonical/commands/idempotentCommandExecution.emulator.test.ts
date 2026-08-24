import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  accountCommandActor,
  AggregateRevisionSchema,
  BookingIdSchema,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  resolveCommandIdempotencyIdentity,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from './commandClock';
import { executeIdempotentCanonicalCommand } from './idempotentCommandExecution';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-canonical-idem-test';
const correlationId = CorrelationIdSchema.parse('correlation_idem_emulator_01');
const accountId = AccountIdSchema.parse('account_idem_emulator_01');
const bookingId = BookingIdSchema.parse('booking_idem_emulator_01');
const bookingPath = `bookings/${bookingId}`;

let app: App;
let firestore: Firestore;

async function clearCollection(database: Firestore, collection: string): Promise<void> {
  const snapshot = await database.collection(collection).get();
  if (snapshot.empty) {
    return;
  }
  const batch = database.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}

function envelope(idempotencyKey: string): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: { bookingId },
  };
}

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

describe.skipIf(!runsOnFirestoreEmulator)(
  'executeIdempotentCanonicalCommand (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    });

    beforeEach(async () => {
      await clearCollection(firestore, 'bookings');
      await clearCollection(firestore, 'command_idempotency');
      await firestore
        .collection('bookings')
        .doc(bookingId)
        .set({ revision: 1, status: 'confirmed' });
    });

    afterAll(async () => {
      if (app) {
        await deleteApp(app);
      }
    });

    it('serializes concurrent matching requests into one logical effect', async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      let handlerCalls = 0;

      const run = () =>
        executeIdempotentCanonicalCommand({
          envelope: envelope('idem-concurrent-01'),
          environment: {
            clock: createAuthoritativeCommandClock(new Date('2026-03-01T00:00:00.000Z')),
          },
          executor,
          revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
          handler: {
            execute: async (session) => {
              handlerCalls += 1;
              session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
              return commandSuccessResult('complete_booking', correlationId);
            },
          },
        });

      const [first, second] = await Promise.all([run(), run()]);

      expect(first).toEqual(second);

      const booking = await firestore.collection('bookings').doc(bookingId).get();
      expect(booking.data()?.revision).toBe(2);

      const identity = resolveCommandIdempotencyIdentity(envelope('idem-concurrent-01'));
      const idempotencyDoc = await firestore.doc(identity.recordPath.slice(1)).get();
      expect(idempotencyDoc.exists).toBe(true);
      expect(handlerCalls).toBeGreaterThanOrEqual(1);
    });

    it('commits idempotency state atomically with command effects', async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);

      await executeIdempotentCanonicalCommand({
        envelope: envelope('idem-atomic-01'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-03-02T00:00:00.000Z')),
        },
        executor,
        revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
        handler: {
          execute: async (session) => {
            session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
            return commandSuccessResult('complete_booking', correlationId);
          },
        },
      });

      const booking = await firestore.collection('bookings').doc(bookingId).get();
      const identity = resolveCommandIdempotencyIdentity(envelope('idem-atomic-01'));
      const idempotencyDoc = await firestore.doc(identity.recordPath).get();

      expect(booking.data()?.status).toBe('completed');
      expect(idempotencyDoc.exists).toBe(true);
      expect(idempotencyDoc.data()?.completionState).toBe('completed');
    });
  }
);
