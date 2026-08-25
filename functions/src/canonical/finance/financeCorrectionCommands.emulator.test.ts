import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  InstructorIdSchema,
  PaymentSchema,
  WalletSchema,
  addMillisecondsToCanonicalTimestamp,
  accountCommandActor,
  adminIssueIdFromDedupeKey,
  adminIssueDedupeKeyFromIdentity,
  attendancePaymentConflictIdentity,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  financialReconciliationMismatchIdentity,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  systemCommandActor,
  activityLogIdFromCommandId,
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
const raceBookingId = 'booking_fin_corr_race_01';
const racePaymentId = paymentIdFromBookingId(raceBookingId);
const raceParticipantId = ParticipantIdSchema.parse('participant_fin_corr_race_01');
const raceManagementId = ParticipantManagementIdSchema.parse('management_fin_corr_race_01');
const raceInstructorId = InstructorIdSchema.parse('instructor_fin_corr_race_01');
const raceOccurrenceId = initialBookingOccurrenceIdFromBookingId(raceBookingId);
const BOOKING_PRICE_KZT = 12_000;
const WALLET_START_KZT = 50_000;
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
    { monetaryEventLoader: createFirestoreMonetaryEventLoader() }
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
    'G. correction vs price adjustment serializes without lost payment revision',
    async () => {
      await seedCorrectionFixture();
      const commands = createCommands();
      const priceEnvelope: CommandEnvelope<'adjust_service_price'> = {
        kind: 'adjust_service_price',
        context: adminContext('price-race-g', correlationIdB),
        intent: {
          paymentId,
          newPrice: 110_000,
          fundingAmount: 5_000,
          walletAccountId: accountId,
          reasonExplanation: 'Concurrent repricing',
        },
      };
      const correctionEnvelope = refundCorrectionEnvelope('corr-race-g', 5_000);

      const settled = await Promise.allSettled([
        commands.execute(priceEnvelope),
        commands.execute(correctionEnvelope),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      expect(payment?.revision).toBeGreaterThanOrEqual(2);
      expect(payment?.refundedAmount).toBeLessThanOrEqual(payment?.paidAmount ?? 0);
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

  it(
    'F. correction vs cancellation refund serializes without impossible finance state',
    async () => {
      await clearCollections([
        'users',
        'participants',
        'participant_management',
        'instructors',
        'bookings',
        'payments',
        'monetary_events',
        'admin_issues',
        'activity_logs',
        'command_idempotency',
        'resource_claims',
        'attendance',
      ]);
      await firestore.collection('users').doc(accountId).set(seedAccount());
      await firestore.collection('users').doc(accountId).collection('wallet').doc('state').set(
        seedWallet(WALLET_START_KZT)
      );
      await firestore.doc(`participants/${raceParticipantId}`).set({
        participantId: raceParticipantId,
        displayName: 'Race Participant',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: raceManagementId },
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
      await firestore.doc(`participant_management/${raceManagementId}`).set({
        participantManagementId: raceManagementId,
        participantId: raceParticipantId,
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
      await firestore.doc(`instructors/${raceInstructorId}`).set({
        id: raceInstructorId,
        name: 'Race Coach',
        pricePerHourKZT: BOOKING_PRICE_KZT,
        isAvailable: true,
      });

      const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
      const createResult = await setupCommands.execute({
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'create-race-booking-f',
          correlationId,
          source: 'client_callable',
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: {
          bookingId: raceBookingId,
          instructorId: raceInstructorId,
          participantIds: [raceParticipantId],
        },
      });
      expect(createResult.status).toBe('success');

      const bookingDoc = await firestore.doc(`bookings/${raceBookingId}`).get();
      const startsAt = bookingDoc.data()?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
      );
      const requestIso = new Date(
        requestAt.seconds * 1000 + requestAt.nanoseconds / 1_000_000
      ).toISOString();
      const commands = createCommands(requestIso);
      const bookingRevision = AggregateRevisionSchema.parse(bookingDoc.data()?.revision ?? 1);

      const cancelEnvelope: CommandEnvelope<'request_booking_cancellation'> = {
        kind: 'request_booking_cancellation',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'cancel-race-f',
          correlationId,
          source: 'client_callable',
          expectedRevision: bookingRevision,
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId: raceBookingId },
      };
      const paymentBefore = (await firestore.doc(`payments/${racePaymentId}`).get()).data();
      const paymentRevision = AggregateRevisionSchema.parse(paymentBefore?.revision ?? 1);
      const correctionEnvelope: CommandEnvelope<'record_financial_correction'> = {
        kind: 'record_financial_correction',
        context: adminContext('corr-race-f', correlationIdB),
        intent: {
          correctionKind: 'admin_refund',
          paymentId: racePaymentId,
          amount: 4_000,
          expectedPaymentRevision: paymentRevision,
          walletAccountId: accountId,
          expectedWalletRevision: 1,
          reasonExplanation: 'Concurrent correction refund',
        },
      };

      const settled = await Promise.allSettled([
        commands.execute(cancelEnvelope),
        commands.execute(correctionEnvelope),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const payment = (await firestore.doc(`payments/${racePaymentId}`).get()).data();
      const booking = (await firestore.doc(`bookings/${raceBookingId}`).get()).data();
      expect(payment?.refundedAmount).toBeLessThanOrEqual(payment?.paidAmount ?? 0);
      expect(payment?.retainedAmount).toBe(
        (payment?.paidAmount ?? 0) - (payment?.refundedAmount ?? 0)
      );
      expect(payment?.price).toBe(
        (payment?.settledAmount ?? 0) +
          (payment?.writtenOffAmount ?? 0) +
          (payment?.outstandingAmount ?? 0)
      );
      expect(booking?.lifecycle.status === 'cancelled' || (payment?.refundedAmount ?? 0) > 0).toBe(
        true
      );
      const refundEvents = (await firestore.collection('monetary_events').get()).docs.filter(
        (doc) => doc.data().eventKind === 'refund_to_wallet'
      );
      expect(refundEvents.length).toBeLessThanOrEqual(2);
    },
    30_000
  );

  it(
    'I. attendance_payment_conflict correction resolves issue without mutating attendance',
    async () => {
      await clearCollections([
        'users',
        'participants',
        'participant_management',
        'instructors',
        'bookings',
        'payments',
        'monetary_events',
        'admin_issues',
        'activity_logs',
        'command_idempotency',
        'resource_claims',
        'attendance',
      ]);
      await firestore.collection('users').doc(accountId).set(seedAccount());
      await firestore.collection('users').doc(accountId).collection('wallet').doc('state').set(
        seedWallet(WALLET_START_KZT)
      );
      await firestore.doc(`participants/${raceParticipantId}`).set({
        participantId: raceParticipantId,
        displayName: 'Conflict Participant',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: raceManagementId },
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
      await firestore.doc(`participant_management/${raceManagementId}`).set({
        participantManagementId: raceManagementId,
        participantId: raceParticipantId,
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
      await firestore.doc(`instructors/${raceInstructorId}`).set({
        id: raceInstructorId,
        name: 'Conflict Coach',
        pricePerHourKZT: BOOKING_PRICE_KZT,
        isAvailable: true,
      });

      const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
      await setupCommands.execute({
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'create-conflict-booking-i',
          correlationId,
          source: 'client_callable',
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: {
          bookingId: raceBookingId,
          instructorId: raceInstructorId,
          participantIds: [raceParticipantId],
        },
      });
      await setupCommands.execute({
        kind: 'rollback_unpaid_booking_party_additions',
        context: {
          actor: systemCommandActor('system_freeze_conflict_i'),
          exercisedCapability: 'system',
          idempotencyKey: 'freeze-conflict-i',
          correlationId,
          source: 'scheduler',
        },
        intent: { bookingId: raceBookingId },
      });
      await firestore.doc('users/account_instructor_fin_corr_race').set(
        AccountSchema.parse({
          accountId: 'account_instructor_fin_corr_race',
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

      await firestore.doc(`payments/${racePaymentId}`).update({
        paidAmount: 0,
        retainedAmount: 0,
        settledAmount: 0,
        outstandingAmount: BOOKING_PRICE_KZT,
        paymentStatus: 'unpaid',
      });

      const lessonEndIso = '2026-01-15T10:00:00.000Z';
      const attendanceCommands = createCommands(lessonEndIso);
      await attendanceCommands.execute({
        kind: 'enforce_payment_start_gate',
        context: {
          actor: systemCommandActor('system_gate_i'),
          exercisedCapability: 'system',
          idempotencyKey: 'gate-i',
          correlationId,
          source: 'scheduler',
        },
        intent: { subjectKind: 'booking', subjectId: raceBookingId },
      });
      const presentEnvelope: CommandEnvelope<'record_booking_attendance'> = {
        kind: 'record_booking_attendance',
        context: {
          actor: accountCommandActor('account_instructor_fin_corr_race'),
          exercisedCapability: 'instructor',
          idempotencyKey: 'present-conflict-i',
          correlationId,
          source: 'client_callable',
          transportMetadata: { instructor_id: raceInstructorId },
        },
        intent: {
          bookingId: raceBookingId,
          participantId: raceParticipantId,
          attendanceStatus: 'present',
        },
      };
      expect((await attendanceCommands.execute(presentEnvelope)).status).toBe('success');

      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: raceOccurrenceId,
        participantId: raceParticipantId,
      });
      const attendanceBefore = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
      const conflictIssueId = adminIssueIdFromDedupeKey(
        adminIssueDedupeKeyFromIdentity(
          attendancePaymentConflictIdentity({
            bookingId: raceBookingId,
            occurrenceId: raceOccurrenceId,
            participantId: raceParticipantId,
          })
        )
      );
      const unrelatedIssueId = adminIssueIdFromDedupeKey(
        adminIssueDedupeKeyFromIdentity(
          financialReconciliationMismatchIdentity({
            subjectKind: 'booking',
            subjectId: raceBookingId,
            reconciliationScope: 'payment_invariants',
          })
        )
      );
      await firestore.collection('admin_issues').doc(unrelatedIssueId).set({
        issueId: unrelatedIssueId,
        kind: 'financial_reconciliation_mismatch',
        subjectRef: { subjectKind: 'booking', bookingId: raceBookingId },
        reconciliationScope: 'payment_invariants',
        lifecycle: { status: 'open', openedAt: decidedAt, lastDetectedAt: decidedAt },
        severity: 'urgent',
        blocksOutcome: false,
        blocksDelivery: false,
        dedupeKey: adminIssueDedupeKeyFromIdentity(
          financialReconciliationMismatchIdentity({
            subjectKind: 'booking',
            subjectId: raceBookingId,
            reconciliationScope: 'payment_invariants',
          })
        ),
        revision: 1,
        correlationId: 'correlation_unrelated_issue',
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'seed_unrelated',
          lastChangedByCommandId: 'seed_unrelated',
          correlationId: 'correlation_unrelated_issue',
        },
      });

      const historicalEventId = 'monetary_event_conflict_i_seed';
      await firestore.collection('monetary_events').doc(historicalEventId).set({
        eventId: historicalEventId,
        eventKind: 'wallet_debit',
        currency: 'KZT',
        paymentId: racePaymentId,
        subjectType: 'booking',
        subjectId: raceBookingId,
        paymentEffect: {
          paidAmountDelta: 0,
          settledAmountDelta: 0,
          outstandingAmountDelta: 0,
        },
        sourceKind: 'wallet',
        actor: { kind: 'system', systemActorId: 'seed' },
        commandId: 'command_seed_event_i',
        correlationId: 'correlation_seed_event_i',
        paymentEventRevision: 1,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      });

      const paymentRevision = AggregateRevisionSchema.parse(
        (await firestore.doc(`payments/${racePaymentId}`).get()).data()?.revision ?? 1
      );
      const conflictIssueRevision = AggregateRevisionSchema.parse(
        (await firestore.doc(`admin_issues/${conflictIssueId}`).get()).data()?.revision ?? 1
      );
      const correctionEnvelope: CommandEnvelope<'record_financial_correction'> = {
        kind: 'record_financial_correction',
        context: adminContext('corr-conflict-i'),
        intent: {
          correctionKind: 'compensating_event',
          paymentId: racePaymentId,
          correctsEventId: historicalEventId,
          paymentEffect: {
            paidAmountDelta: BOOKING_PRICE_KZT,
            settledAmountDelta: BOOKING_PRICE_KZT,
            outstandingAmountDelta: -BOOKING_PRICE_KZT,
          },
          expectedPaymentRevision: paymentRevision,
          adminIssueId: conflictIssueId,
          expectedAdminIssueRevision: conflictIssueRevision,
          reasonExplanation: 'Fund attendance conflict booking',
        },
      };

      const commands = createCommands(lessonEndIso);
      const result = await commands.execute(correctionEnvelope);
      expect(result.status).toBe('success');
      await commands.execute(correctionEnvelope);

      const attendanceAfter = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
      expect(attendanceAfter).toEqual(attendanceBefore);
      expect(attendanceAfter?.attendanceStatus).toBe('present');

      const payment = (await firestore.doc(`payments/${racePaymentId}`).get()).data();
      expect(payment?.paidAmount).toBe(BOOKING_PRICE_KZT);
      expect(payment?.outstandingAmount).toBe(0);

      const conflictIssue = (await firestore.doc(`admin_issues/${conflictIssueId}`).get()).data();
      expect(conflictIssue?.lifecycle?.status).toBe('resolved');
      const unrelatedIssue = (await firestore.doc(`admin_issues/${unrelatedIssueId}`).get()).data();
      expect(unrelatedIssue?.lifecycle?.status).toBe('open');

      const historicalAfter = (
        await firestore.collection('monetary_events').doc(historicalEventId).get()
      ).data();
      expect(historicalAfter?.eventId).toBe(historicalEventId);
      const correctionIdentity = resolveCommandIdempotencyIdentity(correctionEnvelope);
      const correctionEventId = monetaryEventIdFromCommandEffect(correctionIdentity.commandKey, 0);
      expect((await firestore.collection('monetary_events').doc(correctionEventId).get()).exists).toBe(
        true
      );
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(correctionIdentity.commandKey)}`).get())
          .exists
      ).toBe(true);
    },
    30_000
  );

  it(
    'O. rebuild_payment_projection vs provider event serializes with consistent eventRevision',
    async () => {
      await seedCorrectionFixture();
      const seedEventId = 'monetary_event_rebuild_o_seed';
      await firestore.collection('monetary_events').doc(seedEventId).set({
        eventId: seedEventId,
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
        manualReference: 'seed-rebuild-o',
        actor: { kind: 'system', systemActorId: 'seed' },
        commandId: 'command_seed_rebuild_o',
        correlationId: 'correlation_seed_rebuild_o',
        paymentEventRevision: 1,
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      });
      await firestore.collection('payments').doc(paymentId).set(
        seedPayment({
          paidAmount: 80_000,
          retainedAmount: 80_000,
          settledAmount: 80_000,
          outstandingAmount: 20_000,
          paymentStatus: 'partially_paid',
          eventRevision: 1,
        })
      );

      const commands = createCommands();
      const paymentRevision = 1;
      const rebuildEnvelope: CommandEnvelope<'record_audit_correction'> = {
        kind: 'record_audit_correction',
        context: adminContext('rebuild-race-o', correlationIdB),
        intent: {
          operation: 'rebuild_payment_projection',
          paymentId,
          expectedPaymentRevision: paymentRevision,
        },
      };
      const providerEnvelope: CommandEnvelope<'record_provider_payment_event'> = {
        kind: 'record_provider_payment_event',
        context: adminContext('provider-race-o'),
        intent: {
          paymentId,
          amount: 10_000,
          sourceKind: 'manual_external',
          manualReference: 'bank-transfer-race-o',
        },
      };

      const settled = await Promise.allSettled([
        commands.execute(rebuildEnvelope),
        commands.execute(providerEnvelope),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      const events = await firestore.collection('monetary_events').get();
      const maxEventRevision = events.docs.reduce(
        (max, doc) => Math.max(max, doc.data().paymentEventRevision ?? 0),
        0
      );
      expect(payment?.eventRevision).toBe(maxEventRevision);
      expect(payment?.paidAmount).toBeGreaterThanOrEqual(80_000);
      expect(payment?.retainedAmount).toBe(
        (payment?.paidAmount ?? 0) - (payment?.refundedAmount ?? 0)
      );
    },
    30_000
  );
});
