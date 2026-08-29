import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  accountCommandActor,
  AggregateRevisionSchema,
  activityLogIdFromCommandId,
  BookingIdSchema,
  canonicalReference,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  domainOutboxIdFromCommand,
  resolveCommandIdempotencyIdentity,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { executeAuthoritativeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-canonical-audit-test';
const correlationId = CorrelationIdSchema.parse('correlation_audit_emulator_01');
const accountId = AccountIdSchema.parse('account_audit_emulator_01');
const bookingId = BookingIdSchema.parse('booking_audit_emulator_01');
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

function auditPlan(): AuditOutboxStagingPlan {
  return {
    activityLog: {
      reason: { registryVersion: 'reason:v1', reasonCode: 'self_service_completion' },
      primarySubject: {
        kind: 'booking',
        id: bookingId,
        subjectKey: `booking:${bookingId}`,
      },
      affectedSubjects: [canonicalReference('booking', bookingId)],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: canonicalReference('booking', bookingId),
          summary: 'Booking marked completed',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [{ subject: canonicalReference('booking', bookingId), revision: 2 }],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: accountId },
        channel: 'in_app',
        templateId: 'booking_completed',
        templateVersion: 'v1',
        renderInputs: { bookingId },
        deliverySemantics: 'transactional',
      },
    ],
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

type ConcurrentAuditAttemptOutcome =
  | { kind: 'success'; result: CommandResult<'complete_booking'> }
  | { kind: 'emulator_transient' }
  | { kind: 'unknown_rejection'; reason: unknown }
  | { kind: 'unexpected_command_error'; code: string };

function classifyConcurrentAuditAttempt(
  outcome: PromiseSettledResult<CommandResult<'complete_booking'>>
): ConcurrentAuditAttemptOutcome {
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

async function assertConcurrentAuditDurableInvariants(input: {
  readonly identity: ReturnType<typeof resolveCommandIdempotencyIdentity>;
}) {
  const booking = await firestore.collection('bookings').doc(bookingId).get();
  expect(booking.data()?.status).toBe('completed');
  expect(booking.data()?.revision).toBe(2);

  const activityLogs = await firestore.collection('activity_logs').get();
  const outboxDocs = await firestore.collection('domain_outbox').get();
  const idempotency = await firestore.doc(input.identity.recordPath.slice(1)).get();

  expect(activityLogs.size).toBe(1);
  expect(outboxDocs.size).toBe(1);
  expect(activityLogs.docs[0]!.id).toBe(activityLogIdFromCommandId(input.identity.commandKey));
  expect(outboxDocs.docs[0]!.id).toBe(domainOutboxIdFromCommand(input.identity.commandKey, 0));

  expect(idempotency.exists).toBe(true);
  expect(idempotency.data()?.completionState).toBe('completed');

  const activityLogData = activityLogs.docs[0]!.data();
  expect(activityLogData?.correlationId).toBe(correlationId);
  expect(activityLogData?.command?.commandId).toBe(input.identity.commandKey);
  expect(activityLogData?.decidedAt).toBeDefined();
  expect(activityLogData?.committedAt).toBeDefined();

  const outboxData = outboxDocs.docs[0]!.data();
  expect(outboxData?.activityLogId).toBe(activityLogIdFromCommandId(input.identity.commandKey));
  expect(outboxData?.commandId).toBe(input.identity.commandKey);
  expect(outboxData?.delivery?.status).toBe('pending');

  return {
    activityLogCount: activityLogs.size,
    outboxCount: outboxDocs.size,
    duplicateObligations: activityLogs.size + outboxDocs.size - 2,
  };
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'audited idempotent command execution (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    });

    beforeEach(async () => {
      await clearCollection(firestore, 'bookings');
      await clearCollection(firestore, 'command_idempotency');
      await clearCollection(firestore, 'activity_logs');
      await clearCollection(firestore, 'domain_outbox');
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

    it('commits domain, audit, and outbox atomically in Firestore', async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);

      await executeAuthoritativeIdempotentCanonicalCommand({
        envelope: envelope('audit-emulator-atomic-01'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T00:00:00.000Z'), {
            committedAtOffsetMs: 1500,
          }),
        },
        executor,
        revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
        handler: {
          planAuditOutbox: async () => auditPlan(),
          execute: async (session) => {
            session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
            return commandSuccessResult('complete_booking', correlationId);
          },
        },
      });

      const identity = resolveCommandIdempotencyIdentity(envelope('audit-emulator-atomic-01'));
      const booking = await firestore.collection('bookings').doc(bookingId).get();
      const activityLog = await firestore
        .doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
        .get();
      const outbox = await firestore
        .doc(`domain_outbox/${domainOutboxIdFromCommand(identity.commandKey, 0)}`)
        .get();
      const idempotency = await firestore.doc(identity.recordPath.slice(1)).get();

      expect(booking.data()?.status).toBe('completed');
      expect(activityLog.exists).toBe(true);
      expect(outbox.exists).toBe(true);
      expect(outbox.data()?.delivery?.status).toBe('pending');
      expect(idempotency.exists).toBe(true);
      expect(activityLog.data()?.decidedAt).toBeDefined();
      expect(activityLog.data()?.committedAt).toBeDefined();
    });

    it('serializes concurrent audited commands without duplicate obligations', async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      let handlerCalls = 0;

      const run = () =>
        executeAuthoritativeIdempotentCanonicalCommand({
          envelope: envelope('audit-emulator-concurrent-01'),
          environment: {
            clock: createAuthoritativeCommandClock(new Date('2026-04-02T00:00:00.000Z')),
          },
          executor,
          revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
          handler: {
            planAuditOutbox: async () => auditPlan(),
            execute: async (session) => {
              handlerCalls += 1;
              session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
              return commandSuccessResult('complete_booking', correlationId);
            },
          },
        });

      const settled = await Promise.allSettled([run(), run()]);
      const outcomes = settled.map(classifyConcurrentAuditAttempt);

      for (const outcome of outcomes) {
        if (outcome.kind === 'unknown_rejection') {
          throw outcome.reason;
        }
        if (outcome.kind === 'unexpected_command_error') {
          expect.fail(`Unexpected command error: ${outcome.code}`);
        }
      }

      const successOutcomes = outcomes.filter(
        (outcome): outcome is Extract<ConcurrentAuditAttemptOutcome, { kind: 'success' }> =>
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

      const identity = resolveCommandIdempotencyIdentity(envelope('audit-emulator-concurrent-01'));
      const durable = await assertConcurrentAuditDurableInvariants({ identity });

      expect(durable.duplicateObligations).toBe(0);
      expect(handlerCalls).toBeGreaterThanOrEqual(1);

      if (process.env.AUDIT_OUTBOX_RACE_STRESS_METRICS === '1') {
        console.log(
          JSON.stringify({
            metric: 'audit-outbox-concurrent-race',
            successCount,
            emulatorTransientCount,
            activityLogCount: durable.activityLogCount,
            outboxCount: durable.outboxCount,
            duplicateObligations: durable.duplicateObligations,
          })
        );
      }
    });
  }
);
