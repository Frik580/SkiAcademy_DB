import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  PaymentSchema,
  accountCommandActor,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  paymentIdFromBookingId,
  paymentRequiredAtStartIdentity,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-payment-gate-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_payment_gate_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_payment_gate_emulator_02');
const bookingId = BookingIdSchema.parse('booking_payment_gate_emulator_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_payment_gate_emulator_01');
const accountId = 'account_payment_gate_emulator_01';
const startAt = new Date('2026-01-15T04:00:00.000Z');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const startTimestamp = timestampFromDate(startAt);

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

let app: App;
let firestore: Firestore;

const COLLECTIONS_TO_CLEAR = [
  'users',
  'bookings',
  'payments',
  'admin_issues',
  'activity_logs',
  'command_idempotency',
  'monetary_events',
  'domain_outbox',
] as const;

function seedAccount() {
  return AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed_payment_gate_emulator',
      lastChangedByCommandId: 'command_seed_payment_gate_emulator',
      correlationId,
    },
  });
}

function seedBooking() {
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId },
    },
    party: {
      kind: 'individual',
      participantIds: ['participant_payment_gate_emulator_01'],
    },
    occurrence: {
      occurrenceId,
      instructorId: 'instructor_payment_gate_emulator_01',
      interval: {
        startsAt: startTimestamp,
        endsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: ['participant_payment_gate_emulator_01'] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: accountId,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed_payment_gate_emulator',
      lastChangedByCommandId: 'command_seed_payment_gate_emulator',
      correlationId,
    },
  });
}

function seedUnpaidPayment() {
  const paymentId = paymentIdFromBookingId(bookingId);
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'booking',
    subjectId: bookingId,
    currency: 'KZT',
    originalPrice: 100_000,
    price: 100_000,
    paidAmount: 0,
    refundedAmount: 0,
    retainedAmount: 0,
    settledAmount: 0,
    writtenOffAmount: 0,
    outstandingAmount: 100_000,
    paymentStatus: 'unpaid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

function issueDocId(): string {
  const identity = paymentRequiredAtStartIdentity({ bookingId, occurrenceId });
  return adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity));
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

async function seedUnderfundedFixture(): Promise<void> {
  await clearCollections([...COLLECTIONS_TO_CLEAR]);
  const booking = seedBooking();
  const payment = seedUnpaidPayment();
  await firestore.collection('users').doc(accountId).set(seedAccount());
  await firestore.collection('bookings').doc(booking.bookingId).set(booking);
  await firestore.collection('payments').doc(payment.paymentId).set(payment);
}

function createCommands() {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(startAt) },
    createFirestoreCanonicalTransactionExecutor(firestore)
  );
}

function gateEnvelope(
  idempotencyKey: string,
  correlation = correlationId
): CommandEnvelope<'enforce_payment_start_gate'> {
  return {
    kind: 'enforce_payment_start_gate',
    context: {
      actor: systemCommandActor('system_payment_gate_emulator_01'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId: correlation,
      source: 'scheduler',
    },
    intent: { subjectKind: 'booking', subjectId: bookingId },
  };
}

function fundingEnvelope(): CommandEnvelope<'record_provider_payment_event'> {
  return {
    kind: 'record_provider_payment_event',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'administrator',
      idempotencyKey: 'gate-emulator-funding-01',
      correlationId: correlationIdB,
      source: 'admin_callable',
    },
    intent: {
      paymentId: paymentIdFromBookingId(bookingId),
      amount: 100_000,
      sourceKind: 'cash',
    },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('enforce_payment_start_gate (firestore emulator)', () => {
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
    await seedUnderfundedFixture();
  }, 30_000);

  it('creates a single canonical issue for concurrent underfunded gate executions', async () => {
    const commands = createCommands();
    const results = await Promise.all([
      commands.execute(gateEnvelope('gate-emulator-concurrent-a', correlationId)),
      commands.execute(gateEnvelope('gate-emulator-concurrent-b', correlationIdB)),
    ]);
    expect(results.every((result) => result.status === 'success')).toBe(true);
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.size).toBe(1);
    expect(issues.docs[0]?.id).toBe(issueDocId());
    expect(issues.docs[0]?.data().kind).toBe('payment_required_at_start');
    expect(issues.docs[0]?.data().lifecycle.status).toBe('open');
  }, 30_000);

  it('serializes a funding-versus-gate race to a valid funded or restricted outcome', async () => {
    const commands = createCommands();
    const results = await Promise.all([
      commands.execute(fundingEnvelope()),
      commands.execute(gateEnvelope('gate-emulator-race-gate')),
    ]);
    expect(
      results.every((result) => result.status === 'success' || result.status === 'error')
    ).toBe(true);
    const issues = await firestore.collection('admin_issues').get();
    const payment = await firestore
      .collection('payments')
      .doc(paymentIdFromBookingId(bookingId))
      .get();
    expect(issues.size).toBeLessThanOrEqual(1);
    if (issues.size === 1) {
      expect(issues.docs[0]?.data().kind).toBe('payment_required_at_start');
    } else {
      expect(payment.data()?.outstandingAmount).toBe(0);
      expect(payment.data()?.retainedAmount).toBe(100_000);
    }
    expect(payment.data()?.writtenOffAmount).toBe(0);
  }, 30_000);

  it('replays the exact command without duplicating the issue or Activity Log', async () => {
    const commands = createCommands();
    const envelope = gateEnvelope('gate-emulator-replay-01');
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    const issues = await firestore.collection('admin_issues').get();
    const logs = await firestore.collection('activity_logs').get();
    expect(issues.size).toBe(1);
    expect(logs.size).toBe(1);
  }, 30_000);
});
