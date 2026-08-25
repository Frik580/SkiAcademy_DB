import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  AttendanceSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  paymentIdFromBookingId,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-attendance-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_attendance_emulator_01');
const accountId = AccountIdSchema.parse('account_attendance_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_attendance_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_attendance_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_attendance_emulator_01');
const bookingId = BookingIdSchema.parse('booking_attendance_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const lessonStartsAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));

const BOOKING_PRICE_KZT = 12_000;
const WALLET_START_KZT = 50_000;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
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
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-15T10:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-15T10:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function instructorContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor('account_instructor_attendance_emulator'),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
  };
}

function recordEnvelope(
  idempotencyKey: string,
  attendanceStatus: 'present' | 'absent',
  expectedAttendanceRevision?: number
): CommandEnvelope<'record_booking_attendance'> {
  return {
    kind: 'record_booking_attendance',
    context: {
      ...instructorContext(idempotencyKey),
      ...(expectedAttendanceRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(expectedAttendanceRevision) }),
    },
    intent: { bookingId, participantId, attendanceStatus },
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

async function seedSharedFixture(): Promise<void> {
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
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: WALLET_START_KZT,
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
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await firestore.doc(`users/account_instructor_attendance_emulator`).set(
    AccountSchema.parse({
      accountId: 'account_instructor_attendance_emulator',
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
}

async function createConfirmedBooking(commands: ReturnType<typeof createCommands>): Promise<void> {
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: 'create-attendance-emulator',
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
  expect(result.status).toBe('success');
  await commands.execute({
    kind: 'rollback_unpaid_booking_party_additions',
    context: {
      actor: systemCommandActor('system_actor_rollback_unpaid_party_01'),
      exercisedCapability: 'system',
      idempotencyKey: 'freeze-party',
      correlationId,
      source: 'scheduler',
    },
    intent: { bookingId },
  });
}

describe.skipIf(!runsOnFirestoreEmulator)('bookingAttendanceCommands.emulator', () => {
  beforeAll(async () => {
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
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture();
  });

  it('A. instructor attendance write is durable and idempotent', async () => {
    const commands = createCommands();
    await createConfirmedBooking(commands);
    const envelope = recordEnvelope('attendance-durable', 'present');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: (await firestore.doc(`bookings/${bookingId}`).get()).data()?.occurrence
        .occurrenceId,
      participantId,
    });
    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.id).toBe(attendanceId);
    const activityLogs = await firestore.collection('activity_logs').get();
    expect(activityLogs.size).toBeGreaterThanOrEqual(1);
  });

  it('C. no outcome before endsAt', async () => {
    const commands = createCommands('2026-01-15T09:30:00.000Z');
    await createConfirmedBooking(commands);
    await commands.execute(recordEnvelope('early-present', 'present'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
  });

  it('D. individual present -> completed after endsAt', async () => {
    const commands = createCommands();
    await createConfirmedBooking(commands);
    await commands.execute(recordEnvelope('present-complete', 'present'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('completed');
  });

  it('E. individual absent -> no_show', async () => {
    const commands = createCommands();
    await createConfirmedBooking(commands);
    await commands.execute(recordEnvelope('absent-noshow', 'absent'));
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('no_show');
  });

  it('F. missing attendance opens one deterministic issue on resolver replay', async () => {
    const commands = createCommands('2026-01-16T10:00:00.000Z');
    await createConfirmedBooking(commands);
    const resolveEnvelope: CommandEnvelope<'resolve_attendance_outcome'> = {
      kind: 'resolve_attendance_outcome',
      context: {
        actor: systemCommandActor('system_actor_resolve_attendance_outcome_01'),
        exercisedCapability: 'system',
        idempotencyKey: 'resolve-missing',
        correlationId,
        source: 'scheduler',
      },
      intent: { subjectKind: 'booking', subjectId: bookingId },
    };
    expect((await commands.execute(resolveEnvelope)).status).toBe('success');
    expect((await commands.execute(resolveEnvelope)).status).toBe('success');
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.docs.filter((doc) => doc.data().kind === 'missing_attendance')).toHaveLength(1);
  });

  it('K. present attendance with payment gate violation preserves attendance and opens conflict issue', async () => {
    const commands = createCommands();
    await createConfirmedBooking(commands);
    await firestore.doc(`payments/${paymentId}`).update({
      paidAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      outstandingAmount: BOOKING_PRICE_KZT,
      paymentStatus: 'unpaid',
    });
    await commands.execute({
      kind: 'enforce_payment_start_gate',
      context: {
        actor: systemCommandActor('system_actor_payment_start_gate_01'),
        exercisedCapability: 'system',
        idempotencyKey: 'gate-open',
        correlationId,
        source: 'scheduler',
      },
      intent: { subjectKind: 'booking', subjectId: bookingId },
    });
    await commands.execute(recordEnvelope('present-conflict', 'present'));
    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.docs[0]?.data().attendanceStatus).toBe('present');
    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(payment?.paidAmount).toBe(0);
    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    expect(booking?.lifecycle.status).toBe('confirmed');
  });
});
