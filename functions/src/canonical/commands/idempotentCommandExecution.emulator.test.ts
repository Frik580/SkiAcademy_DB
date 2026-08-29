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
  type CommandResult,
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

function isFirestoreEmulatorTransientRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }
  if (!reason.message.includes('Transaction is invalid or closed')) {
    return false;
  }
  const code = (reason as { code?: unknown }).code;
  return code === 3 || code === 'invalid-argument';
}

type ConcurrentIdempotencyAttemptOutcome =
  | { kind: 'success'; result: CommandResult<'complete_booking'> }
  | { kind: 'emulator_transient' }
  | { kind: 'unknown_rejection'; reason: unknown }
  | { kind: 'unexpected_command_error'; code: string };

function classifyConcurrentIdempotencyAttempt(
  outcome: PromiseSettledResult<CommandResult<'complete_booking'>>
): ConcurrentIdempotencyAttemptOutcome {
  if (outcome.status === 'rejected') {
    if (isFirestoreEmulatorTransientRejection(outcome.reason)) {
      return { kind: 'emulator_transient' };
    }
    return { kind: 'unknown_rejection', reason: outcome.reason };
  }

  const result = outcome.value;
  if (result.status === 'success') {
    return { kind: 'success', result };
  }
  return {
    kind: 'unexpected_command_error',
    code: result.status === 'error' ? result.error.code : 'unknown',
  };
}

async function assertConcurrentIdempotencyDurableInvariants(input: {
  readonly identity: ReturnType<typeof resolveCommandIdempotencyIdentity>;
}) {
  const bookings = await firestore.collection('bookings').get();
  expect(bookings.size).toBe(1);

  const booking = await firestore.collection('bookings').doc(bookingId).get();
  expect(booking.data()?.revision).toBe(2);
  expect(booking.data()?.status).toBe('completed');

  const idempotencyDocs = await firestore.collection('command_idempotency').get();
  expect(idempotencyDocs.size).toBe(1);

  const idempotencyDoc = await firestore.doc(input.identity.recordPath.slice(1)).get();
  expect(idempotencyDoc.exists).toBe(true);
  expect(idempotencyDoc.data()?.completionState).toBe('completed');
  expect(idempotencyDoc.data()?.commandKind).toBe('complete_booking');
  expect(idempotencyDoc.data()?.result?.status).toBe('success');
  expect(idempotencyDoc.data()?.correlationId).toBe(correlationId);

  return {
    bookingCount: bookings.size,
    idempotencyCount: idempotencyDocs.size,
  };
}

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

      const settled = await Promise.allSettled([run(), run()]);
      const outcomes = settled.map(classifyConcurrentIdempotencyAttempt);

      for (const outcome of outcomes) {
        if (outcome.kind === 'unknown_rejection') {
          throw outcome.reason;
        }
        if (outcome.kind === 'unexpected_command_error') {
          expect.fail(`Unexpected command error: ${outcome.code}`);
        }
      }

      const successOutcomes = outcomes.filter(
        (outcome): outcome is Extract<ConcurrentIdempotencyAttemptOutcome, { kind: 'success' }> =>
          outcome.kind === 'success'
      );
      const successCount = successOutcomes.length;
      const emulatorTransientCount = outcomes.filter(
        (outcome) => outcome.kind === 'emulator_transient'
      ).length;

      expect(successCount + emulatorTransientCount).toBe(2);

      if (successCount === 2) {
        expect(successOutcomes[0]!.result).toEqual(successOutcomes[1]!.result);
      }

      const identity = resolveCommandIdempotencyIdentity(envelope('idem-concurrent-01'));
      const durable = await assertConcurrentIdempotencyDurableInvariants({ identity });

      expect(handlerCalls).toBeGreaterThanOrEqual(1);

      if (process.env.IDEMPOTENT_RACE_STRESS_METRICS === '1') {
        console.log(
          JSON.stringify({
            metric: 'idempotent-concurrent-race',
            successCount,
            emulatorTransientCount,
            bookingCount: durable.bookingCount,
            idempotencyCount: durable.idempotencyCount,
          })
        );
      }
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
