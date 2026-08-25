import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  accountCommandActor,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-cancel-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_cancel_emulator_01');
const accountId = AccountIdSchema.parse('account_cancel_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_cancel_emulator_admin');
const participantId = ParticipantIdSchema.parse('participant_cancel_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_cancel_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_cancel_emulator_01');
const bookingId = BookingIdSchema.parse('booking_cancel_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking cancellation emulator races', () => {
  beforeAll(() => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    const collections = [
      'users',
      'participants',
      'participant_management',
      'instructors',
      'bookings',
      'payments',
      'monetary_events',
      'resource_claims',
      'resource_claim_guards',
      'activity_logs',
      'domain_outbox',
      'command_idempotency',
      'admin_issues',
    ];
    for (const collection of collections) {
      const snapshot = await firestore.collection(collection).get();
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }, 30_000);

  it(
    'serializes admin approve vs reject without duplicate refunds',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const commands = createProductionCanonicalCommands(environment(), executor);

      await firestore.doc(`users/${accountId}`).set(
        AccountSchema.parse({
          accountId,
          lifecycle: { status: 'active' },
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'seed',
            lastChangedByCommandId: 'seed',
            correlationId,
          },
        })
      );
      await firestore.doc(`users/${adminAccountId}`).set(
        AccountSchema.parse({
          accountId: adminAccountId,
          lifecycle: { status: 'active' },
          revision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: 'seed',
            lastChangedByCommandId: 'seed',
            correlationId,
          },
        })
      );
      await firestore.doc(`users/${accountId}/wallet/state`).set(
        WalletSchema.parse({
          accountId,
          currency: 'KZT',
          balance: 50_000,
          revision: 1,
          eventRevision: 1,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        })
      );
      await firestore.doc(`participants/${participantId}`).set({
        participantId,
        displayName: 'Emulator Participant',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: managementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId,
        },
      });
      await firestore.doc(`participant_management/${managementId}`).set({
        participantManagementId: managementId,
        participantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId,
        },
      });
      await firestore.doc(`instructors/${instructorId}`).set({
        id: instructorId,
        name: 'Emulator Coach',
        pricePerHourKZT: 12_000,
        isAvailable: true,
      });

      const createResult = await commands.execute({
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'create-emulator-01',
          correlationId,
          source: 'client_callable',
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId, instructorId, participantIds: [participantId] },
      });
      expect(createResult.status).toBe('success');

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      await commands.execute({
        kind: 'request_booking_cancellation',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'pending-emulator-01',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1),
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId },
      });

      const pendingBooking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const revision = AggregateRevisionSchema.parse(pendingBooking?.revision ?? 2);

      const approveEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'approve-race-01',
          correlationId,
          source: 'admin_callable',
          expectedRevision: revision,
        },
        intent: {
          bookingId,
          decision: 'approve',
          refundAmount: 12_000,
          reasonExplanation: 'Approve race test',
        },
      };
      const rejectEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'reject-race-01',
          correlationId,
          source: 'admin_callable',
          expectedRevision: revision,
        },
        intent: {
          bookingId,
          decision: 'reject',
          reasonExplanation: 'Reject race test',
        },
      };

      const results = await Promise.allSettled([
        commands.execute(approveEnvelope),
        commands.execute(rejectEnvelope),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBe(1);

      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      expect(payment?.refundedAmount ?? 0).toBeLessThanOrEqual(12_000);
    },
    30_000
  );
});
