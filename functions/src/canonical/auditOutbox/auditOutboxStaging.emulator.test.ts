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
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { executeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
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

      await executeIdempotentCanonicalCommand({
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
        executeIdempotentCanonicalCommand({
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

      const [first, second] = await Promise.all([run(), run()]);
      expect(first).toEqual(second);

      const identity = resolveCommandIdempotencyIdentity(envelope('audit-emulator-concurrent-01'));
      const activityLogs = await firestore.collection('activity_logs').get();
      const outboxDocs = await firestore.collection('domain_outbox').get();

      expect(activityLogs.size).toBe(1);
      expect(outboxDocs.size).toBe(1);
      expect(activityLogs.docs[0].id).toBe(activityLogIdFromCommandId(identity.commandKey));
      expect(handlerCalls).toBeGreaterThanOrEqual(1);
    });
  }
);
