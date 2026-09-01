import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AggregateRevisionSchema,
  AccountIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  MonetaryEventSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { sweepGuestConfirmationLifecycleMismatches } from '../guestConfirmation/guestConfirmationReconciliationSweep';

const PROJECT_ID = 'ski-academy-guest-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_guest_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_guest_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_guest_emulator_admin');
const bookingId = BookingIdSchema.parse('booking_guest_emulator_01');
const guestSubjectId = guestSubjectIdFromBookingId(bookingId);
const paymentId = paymentIdFromBookingId(bookingId);
const tokenSecret = 'guest-emulator-test-secret-01';
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'instructors',
  'participants',
  'bookings',
  'payments',
  'monetary_events',
  'provider_event_receipts',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'admin_issues',
  'domain_outbox',
  'command_idempotency',
  'users',
  'participant_management',
  'participant_management_active_owner',
] as const;

function guestCreateEnvelope(input: {
  bookingId: string;
  idempotencyKey: string;
  localTime?: string;
}): CommandEnvelope<'create_guest_booking_request'> {
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectIdFromBookingId(BookingIdSchema.parse(input.bookingId))),
      exercisedCapability: 'guest',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: input.localTime ?? '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: 'Guest Emulator Participant',
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 24,
      }),
    },
    intent: {
      bookingId: BookingIdSchema.parse(input.bookingId),
      instructorId,
      participantIds: [participantId],
    },
  };
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

async function seedInstructorOnly(): Promise<void> {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Guest Emulator Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
}

async function seedFixture(): Promise<void> {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Guest Emulator Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore
    .collection('participants')
    .doc(participantId)
    .set({
      participantId,
      displayName: 'Guest Emulator Participant',
      age: { kind: 'age_years', years: 24 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_participant',
        lastChangedByCommandId: 'command_seed_participant',
        correlationId,
      },
    });
  await firestore
    .collection('users')
    .doc(adminAccountId)
    .set({
      accountId: adminAccountId,
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

function createCommands(at: string) {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    executor,
    { guestActionTokenSecret: tokenSecret }
  );
}

describe.skipIf(!runsOnFirestoreEmulator)('guest booking commands (firestore emulator)', () => {
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
    await clearCollections([...COLLECTIONS_TO_CLEAR]);
    await seedFixture();
  }, 30_000);

  it('serializes overlapping guest instructor requests so exactly one wins', async () => {
    const commands = createCommands('2026-01-01T10:00:00.000Z');
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        commands.execute(
          guestCreateEnvelope({
            bookingId: `booking_guest_emulator_race_${index}`,
            idempotencyKey: `guest-race-${index}`,
          })
        )
      )
    );
    const successes = attempts.filter((attempt) => attempt.status === 'success');
    const conflicts = attempts.filter(
      (attempt) => attempt.status === 'error' && attempt.error.code === 'instructor_conflict'
    );
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(5);

    const bookings = await firestore.collection('bookings').get();
    const payments = await firestore.collection('payments').get();
    const claims = await firestore.collection('resource_claims').get();
    const activityLogs = await firestore.collection('activity_logs').get();
    expect(bookings.size).toBe(1);
    expect(payments.size).toBe(1);
    expect(claims.size).toBe(2);
    expect(activityLogs.size).toBe(1);
  }, 30_000);

  it('serializes full Payment vs expiry without resurrecting a terminal booking', async () => {
    const createCommandsAt = createCommands('2026-01-01T10:00:00.000Z');
    await createCommandsAt.execute(
      guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-race-seed-01' })
    );

    const confirmCommands = createCommands('2026-01-01T10:59:00.000Z');
    const expireCommands = createCommands('2026-01-01T11:01:00.000Z');
    const [confirmResult, expireResult] = await Promise.all([
      confirmCommands.execute({
        kind: 'record_provider_payment_event',
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'guest-payment-race-01',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: {
          paymentId,
          amount: 12_000,
          sourceKind: 'manual_external',
          manualReference: 'guest-payment-race-ref',
        },
      }),
      expireCommands.execute({
        kind: 'expire_guest_reservation',
        context: {
          actor: systemCommandActor(SystemActorIdSchema.parse('system_guest_expiry_emulator')),
          exercisedCapability: 'system',
          idempotencyKey: 'guest-expire-race-01',
          correlationId,
          source: 'scheduler',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: { bookingId },
      }),
    ]);

    const booking = (await firestore.collection('bookings').doc(bookingId).get()).data();
    if (booking?.lifecycle?.status === 'confirmed') {
      expect(confirmResult.status).toBe('success');
      expect(expireResult.status).toBe('error');
    } else {
      expect(booking?.lifecycle).toMatchObject({
        status: 'cancelled',
        reasonCode: 'reservation_expired',
      });
      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      if (confirmResult.status === 'success') {
        expect(payment).toMatchObject({ paidAmount: 12_000, outstandingAmount: 0 });
        const issues = await firestore.collection('admin_issues').get();
        expect(issues.size).toBe(1);
        expect(issues.docs[0]?.data()).toMatchObject({
          kind: 'financial_reconciliation_mismatch',
          reconciliationScope: 'guest_confirmation_lifecycle',
          lifecycle: { status: 'open' },
        });
      } else {
        expect(confirmResult.error.code).toBe('invalid_transition');
        expect(payment).toMatchObject({ paidAmount: 0, outstandingAmount: 12_000 });
      }
    }

    const activityLogs = await firestore.collection('activity_logs').get();
    expect(activityLogs.size).toBeLessThanOrEqual(4);
  }, 30_000);

  it('provisions guest participant atomically and returns a guest action credential', async () => {
    await clearCollections([...COLLECTIONS_TO_CLEAR]);
    await seedInstructorOnly();

    const commands = createCommands('2026-01-01T10:00:00.000Z');
    const first = await commands.execute(
      guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-provision-01' })
    );
    const replay = await commands.execute(
      guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-provision-01' })
    );

    expect(first.status).toBe('success');
    expect(replay.status).toBe('success');
    expect(replay.payload?.guestActionCredential).toEqual(first.payload?.guestActionCredential);

    const participants = await firestore.collection('participants').get();
    expect(participants.size).toBe(1);
    expect(participants.docs[0]?.data().management).toEqual({ kind: 'unmanaged_guest' });
  }, 30_000);

  it('persists guest booking without invalid undefined optional Firestore fields', async () => {
    const commands = createCommands('2026-01-01T10:00:00.000Z');
    const result = await commands.execute(
      guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-serialize-01' })
    );
    expect(result.status).toBe('success');

    const booking = (await firestore.collection('bookings').doc(bookingId).get()).data();
    const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
    expect(booking?.payerAccountId).toBeUndefined();
    expect(payment?.payerAccountId).toBeUndefined();
    expect((await firestore.collection('users').doc(guestSubjectId).get()).exists).toBe(false);
  }, 30_000);

  it('replays full Payment delivery without duplicate confirmation audit records', async () => {
    const createCommandsAt = createCommands('2026-01-01T10:00:00.000Z');
    const createResult = await createCommandsAt.execute(
      guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-confirm-replay-seed' })
    );
    expect(createResult.status).toBe('success');

    const confirmEnvelope: CommandEnvelope<'record_provider_payment_event'> = {
      kind: 'record_provider_payment_event',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'guest-payment-replay-01',
        correlationId,
        source: 'admin_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        paymentId,
        amount: 12_000,
        sourceKind: 'manual_external',
        manualReference: 'guest-payment-replay-ref',
      },
    };
    const confirmCommands = createCommands('2026-01-01T10:30:00.000Z');
    const firstConfirm = await confirmCommands.execute(confirmEnvelope);
    const replayConfirm = await confirmCommands.execute(confirmEnvelope);
    expect(firstConfirm.status).toBe('success');
    expect(replayConfirm.status).toBe('success');

    const activityLogs = await firestore.collection('activity_logs').get();
    expect(activityLogs.size).toBe(2);

    const kinds = activityLogs.docs.map((doc) => doc.data().command?.kind).sort();
    expect(kinds).toEqual(['create_guest_booking_request', 'record_provider_payment_event']);
  }, 30_000);

  it('sweeps a durable fully-paid terminal mismatch into one canonical AdminIssue', async () => {
    const commands = createCommands('2026-01-01T10:00:00.000Z');
    expect(
      (
        await commands.execute(
          guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-sweep-seed-create' })
        )
      ).status
    ).toBe('success');
    expect(
      (
        await commands.execute({
          kind: 'record_provider_payment_event',
          context: {
            actor: accountCommandActor(adminAccountId),
            exercisedCapability: 'administrator',
            idempotencyKey: 'guest-sweep-seed-payment',
            correlationId,
            source: 'admin_callable',
            expectedRevision: AggregateRevisionSchema.parse(1),
          },
          intent: {
            paymentId,
            amount: 12_000,
            sourceKind: 'manual_external',
            manualReference: 'guest-sweep-seed-payment-ref',
          },
        })
      ).status
    ).toBe('success');

    expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
      paymentStatus: 'paid',
      paidAmount: 12_000,
      outstandingAmount: 0,
    });

    const refundedAt = timestampFromDate(new Date('2026-01-01T10:59:30.000Z'));
    const refundHistoryEvent = MonetaryEventSchema.parse({
      eventId: 'monetary_event_guest_sweep_refund_history',
      eventKind: 'correction',
      currency: 'KZT',
      paymentId,
      subjectType: 'booking',
      subjectId: bookingId,
      paymentEffect: { paidAmountDelta: 1_000, refundedAmountDelta: 1_000 },
      sourceKind: 'admin_adjustment',
      actor: { kind: 'system', systemActorId: 'system_guest_sweep_fixture' },
      commandId: 'command_guest_sweep_refund_history',
      correlationId,
      paymentEventRevision: 2,
      occurredAt: refundedAt,
      recordedAt: refundedAt,
    });
    await firestore
      .collection('monetary_events')
      .doc(refundHistoryEvent.eventId)
      .set(refundHistoryEvent);
    await firestore.collection('payments').doc(paymentId).update({
      paidAmount: 13_000,
      refundedAmount: 1_000,
      retainedAmount: 12_000,
      paymentStatus: 'partially_refunded',
      revision: 3,
      eventRevision: 2,
      updatedAt: refundedAt,
    });

    const mismatchAt = timestampFromDate(new Date('2026-01-01T11:01:00.000Z'));
    await firestore.collection('bookings').doc(bookingId).update({
      lifecycle: {
        status: 'cancelled',
        cancelledAt: mismatchAt,
        reasonCode: 'reservation_expired',
      },
      revision: 3,
      updatedAt: mismatchAt,
    });

    const firstSweep = await sweepGuestConfirmationLifecycleMismatches(
      firestore,
      new Date('2026-01-01T11:02:00.000Z')
    );
    const replaySweep = await sweepGuestConfirmationLifecycleMismatches(
      firestore,
      new Date('2026-01-01T11:03:00.000Z')
    );
    expect(firstSweep.scannedPayments).toBe(1);
    expect(replaySweep.scannedPayments).toBe(1);

    const issues = await firestore.collection('admin_issues').get();
    expect(issues.size).toBe(1);
    expect(issues.docs[0]?.data()).toMatchObject({
      kind: 'financial_reconciliation_mismatch',
      reconciliationScope: 'guest_confirmation_lifecycle',
      lifecycle: { status: 'open' },
      revision: 1,
    });

    const issue = issues.docs[0]!;
    const resolvedAt = timestampFromDate(new Date('2026-01-01T11:03:30.000Z'));
    await issue.ref.update({
      lifecycle: {
        status: 'resolved',
        openedAt: issue.data().lifecycle.openedAt,
        lastDetectedAt: issue.data().lifecycle.lastDetectedAt,
        resolvedAt,
        resolution: {
          reason: 'Temporarily acknowledged without changing the mismatch',
          resolvedByAccountId: adminAccountId,
        },
      },
      revision: 2,
      updatedAt: resolvedAt,
    });
    await sweepGuestConfirmationLifecycleMismatches(
      firestore,
      new Date('2026-01-01T11:04:00.000Z')
    );
    expect((await issue.ref.get()).data()).toMatchObject({
      lifecycle: { status: 'open', reopenedAt: timestampFromDate(new Date('2026-01-01T11:04:00.000Z')) },
      revision: 3,
    });
  }, 30_000);
});
