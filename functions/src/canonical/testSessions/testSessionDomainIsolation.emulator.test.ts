import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  BookingSchema,
  CanonicalCommandError,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantSchema,
  PaymentSchema,
  TestSessionIdSchema,
  WalletSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  commandSuccessResult,
  initialBookingOccurrenceIdFromBookingId,
  paymentIdFromBookingId,
  testCanonicalExecutionScope,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { executeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-t42b3-isolation-emulator';
const correlationA = CorrelationIdSchema.parse('correlation_t42b3_em_a');
const correlationB = CorrelationIdSchema.parse('correlation_t42b3_em_b');
const testSessionId = TestSessionIdSchema.parse('test_session_t42b3_em_01');
const testScope = testCanonicalExecutionScope(testSessionId);
const testParentId = AccountIdSchema.parse('account_t42b3_em_parent');
const liveAdminId = AccountIdSchema.parse('account_t42b3_em_admin');
const participantId = ParticipantIdSchema.parse('participant_t42b3_em_child');
const testInstructorId = InstructorIdSchema.parse('instructor_t42b3_em_test');
const bookingA = BookingIdSchema.parse('booking_t42b3_em_a');
const bookingB = BookingIdSchema.parse('booking_t42b3_em_b');
const paymentA = paymentIdFromBookingId(bookingA);
const paymentB = paymentIdFromBookingId(bookingB);
const liveCourseId = CourseIdSchema.parse('course_t42b3_em_live');
const testCourseId = CourseIdSchema.parse('course_t42b3_em_clone');
const commandId = CommandIdSchema.parse('command_t42b3_em_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const audit = {
  createdByCommandId: commandId,
  lastChangedByCommandId: commandId,
  correlationId: correlationA,
};

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

let app: App;
let firestore: Firestore;

function environment() {
  return {
    clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
    scope: testScope,
  };
}

function seedAccount(accountId: string, scope?: Record<string, unknown>) {
  return AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
    ...scope,
  });
}

function seedWallet(accountId: string, balance: number, scope?: Record<string, unknown>) {
  return WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    ...scope,
  });
}

function seedBooking(bookingId: typeof bookingA, paymentId: typeof paymentA) {
  return BookingSchema.parse({
    bookingId,
    dataScope: 'test',
    testSessionId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: liveAdminId },
    },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId: initialBookingOccurrenceIdFromBookingId(bookingId),
      instructorId: testInstructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-01-15T04:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-01-15T05:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId], frozenAt: timestampFromDate(new Date('2026-01-15T04:00:00.000Z')) },
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId: testParentId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit,
  });
}

function seedPayment(paymentId: typeof paymentA, bookingId: typeof bookingA) {
  return PaymentSchema.parse({
    paymentId,
    dataScope: 'test',
    testSessionId,
    subjectType: 'booking',
    subjectId: bookingId,
    currency: 'KZT',
    originalPrice: 10_000,
    price: 10_000,
    paidAmount: 0,
    refundedAmount: 0,
    retainedAmount: 0,
    settledAmount: 0,
    writtenOffAmount: 0,
    outstandingAmount: 10_000,
    paymentStatus: 'unpaid',
    incrementalRequirements: [],
    payerAccountId: testParentId,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
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

describe.skipIf(!runsOnFirestoreEmulator)('T42B-3 TEST isolation emulator', () => {
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
    await clearCollections([
      'users',
      'bookings',
      'payments',
      'monetary_events',
      'courses',
      'attendance',
      'participants',
      'command_idempotency',
      'activity_logs',
    ]);
  });

  it('keeps concurrent TEST wallet debit atomic and leaves a LIVE wallet untouched', async () => {
    await firestore.collection('users').doc(testParentId).set(
      seedAccount(testParentId, { dataScope: 'test', testSessionId })
    );
    await firestore.collection('users').doc(liveAdminId).set(seedAccount(liveAdminId));
    await firestore
      .collection('users')
      .doc(testParentId)
      .collection('wallet')
      .doc('state')
      .set(seedWallet(testParentId, 15_000, { dataScope: 'test', testSessionId }));
    await firestore
      .collection('users')
      .doc(liveAdminId)
      .collection('wallet')
      .doc('state')
      .set(seedWallet(liveAdminId, 888_000));
    await firestore.collection('bookings').doc(bookingA).set(seedBooking(bookingA, paymentA));
    await firestore.collection('bookings').doc(bookingB).set(seedBooking(bookingB, paymentB));
    await firestore.collection('payments').doc(paymentA).set(seedPayment(paymentA, bookingA));
    await firestore.collection('payments').doc(paymentB).set(seedPayment(paymentB, bookingB));

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const commands = createProductionCanonicalCommands(environment(), executor);
    const envelope = (
      bookingId: typeof bookingA,
      correlationId: typeof correlationA,
      key: string
    ): CommandEnvelope<'pay_service_from_wallet_as_administrator'> => ({
      kind: 'pay_service_from_wallet_as_administrator',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: key,
        correlationId,
        source: 'admin_callable',
      },
      intent: { subjectKind: 'booking', bookingId },
    });

    const [first, second] = await Promise.all([
      commands.execute(envelope(bookingA, correlationA, 'idem-t42b3-em-pay-a')),
      commands.execute(envelope(bookingB, correlationB, 'idem-t42b3-em-pay-b')),
    ]);
    const statuses = [first.status, second.status];
    expect(statuses.filter((status) => status === 'success')).toHaveLength(1);
    expect(statuses.filter((status) => status === 'error')).toHaveLength(1);

    const testWallet = await firestore
      .collection('users')
      .doc(testParentId)
      .collection('wallet')
      .doc('state')
      .get();
    const liveWallet = await firestore
      .collection('users')
      .doc(liveAdminId)
      .collection('wallet')
      .doc('state')
      .get();
    expect(testWallet.data()?.balance).toBe(5_000);
    expect(liveWallet.data()?.balance).toBe(888_000);
  }, 30_000);

  it('protects TEST course capacity without mutating the LIVE source course', async () => {
    const liveCourse = CourseSchema.parse({
      courseId: liveCourseId,
      title: 'Live Source',
      lifecycle: 'active',
      price: 10_000,
      capacity: { totalSeats: 2, availableSeats: 2 },
      instructorRosterIds: [testInstructorId],
      startAt: decidedAt,
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-01T05:00:00.000Z')),
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit,
    });
    const testCourse = CourseSchema.parse({
      ...liveCourse,
      courseId: testCourseId,
      dataScope: 'test',
      testSessionId,
      sourceCourseId: liveCourseId,
      capacity: { totalSeats: 1, availableSeats: 1 },
      instructorRosterIds: [testInstructorId],
    });
    await firestore.collection('courses').doc(liveCourseId).set(liveCourse);
    await firestore.collection('courses').doc(testCourseId).set(testCourse);

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const decrement = async (key: string, correlationId: typeof correlationA) => {
      let availableSeats = 0;
      return executeIdempotentCanonicalCommand({
        envelope: {
          kind: 'complete_booking',
          context: {
            actor: accountCommandActor(liveAdminId),
            exercisedCapability: 'administrator',
            idempotencyKey: key,
            correlationId,
            source: 'admin_callable',
          },
          intent: { bookingId: bookingA },
        },
        environment: environment(),
        executor,
        handler: {
          read: async (session) => {
            const snap = await session.tx.get({ path: `courses/${testCourseId}` });
            availableSeats = Number(
              (snap.data?.capacity as { availableSeats?: number } | undefined)?.availableSeats
            );
          },
          execute: async (session) => {
            if (!Number.isFinite(availableSeats) || availableSeats < 1) {
              throw new CanonicalCommandError('course_full', { correlationId });
            }
            session.tx.update(
              { path: `courses/${testCourseId}` },
              { capacity: { totalSeats: 1, availableSeats: availableSeats - 1 } }
            );
            return commandSuccessResult('complete_booking', correlationId);
          },
        },
      });
    };

    const [first, second] = await Promise.all([
      decrement('idem-t42b3-em-seat-a', correlationA),
      decrement('idem-t42b3-em-seat-b', correlationB),
    ]);
    const statuses = [first.status, second.status];
    expect(statuses.filter((status) => status === 'success')).toHaveLength(1);
    expect(
      statuses.filter(
        (status, index) =>
          status === 'error' &&
          [first, second][index]?.status === 'error' &&
          ([first, second][index] as { error: { code: string } }).error.code === 'course_full'
      )
    ).toHaveLength(1);

    const clone = await firestore.collection('courses').doc(testCourseId).get();
    const live = await firestore.collection('courses').doc(liveCourseId).get();
    expect(clone.data()?.capacity).toMatchObject({ totalSeats: 1, availableSeats: 0 });
    expect(live.data()?.capacity).toMatchObject({ totalSeats: 2, availableSeats: 2 });
  }, 30_000);

  it('keeps TEST payment, attendance, and LIVE finance/course aggregates isolated', async () => {
    const testParticipant = ParticipantSchema.parse({
      participantId,
      displayName: 'TEST Child',
      age: { kind: 'age_years', years: 10 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit,
      dataScope: 'test',
      testSessionId,
    });
    await firestore.collection('users').doc(testParentId).set(
      seedAccount(testParentId, { dataScope: 'test', testSessionId })
    );
    await firestore.collection('users').doc(liveAdminId).set(seedAccount(liveAdminId));
    await firestore
      .collection('users')
      .doc(testParentId)
      .collection('wallet')
      .doc('state')
      .set(seedWallet(testParentId, 50_000, { dataScope: 'test', testSessionId }));
    await firestore
      .collection('users')
      .doc(liveAdminId)
      .collection('wallet')
      .doc('state')
      .set(seedWallet(liveAdminId, 888_000));
    await firestore.collection('bookings').doc(bookingA).set(seedBooking(bookingA, paymentA));
    await firestore.collection('payments').doc(paymentA).set(seedPayment(paymentA, bookingA));
    await firestore.collection('participants').doc(participantId).set(testParticipant);
    await firestore.collection('courses').doc(liveCourseId).set(
      CourseSchema.parse({
        courseId: liveCourseId,
        title: 'Live Source',
        lifecycle: 'active',
        price: 10_000,
        capacity: { totalSeats: 2, availableSeats: 2 },
        instructorRosterIds: [testInstructorId],
        startAt: decidedAt,
        scheduleProjection: {
          courseDayCount: 1,
          finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-01T05:00:00.000Z')),
          courseScheduleRevision: 1,
        },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      })
    );

    const executor = createFirestoreCanonicalTransactionExecutor(firestore);
    const pay = await createProductionCanonicalCommands(environment(), executor).execute({
      kind: 'pay_service_from_wallet_as_administrator',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-em-flow-pay',
        correlationId: correlationA,
        source: 'admin_callable',
      },
      intent: { subjectKind: 'booking', bookingId: bookingA },
    });
    expect(pay.status).toBe('success');

    const attendance = await createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-15T06:00:00.000Z')),
        scope: testScope,
      },
      executor
    ).execute({
      kind: 'record_booking_attendance',
      context: {
        actor: accountCommandActor(liveAdminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-t42b3-em-flow-attendance',
        correlationId: correlationB,
        source: 'admin_callable',
        expectedRevision: 1,
      },
      intent: {
        bookingId: bookingA,
        participantId,
        attendanceStatus: 'present',
        reasonExplanation: 'TEST attendance isolation',
      },
    });
    expect(attendance.status).toBe('success');

    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: initialBookingOccurrenceIdFromBookingId(bookingA),
      participantId,
    });
    const attendanceDoc = await firestore.collection('attendance').doc(attendanceId).get();
    const paymentDoc = await firestore.collection('payments').doc(paymentA).get();
    const testWallet = await firestore
      .collection('users')
      .doc(testParentId)
      .collection('wallet')
      .doc('state')
      .get();
    const liveWallet = await firestore
      .collection('users')
      .doc(liveAdminId)
      .collection('wallet')
      .doc('state')
      .get();
    const liveCourse = await firestore.collection('courses').doc(liveCourseId).get();
    expect(paymentDoc.data()).toMatchObject({
      paymentStatus: 'paid',
      dataScope: 'test',
      testSessionId,
    });
    expect(attendanceDoc.data()).toMatchObject({
      attendanceStatus: 'present',
      dataScope: 'test',
      testSessionId,
    });
    expect(testWallet.data()?.balance).toBe(40_000);
    expect(liveWallet.data()?.balance).toBe(888_000);
    expect(liveCourse.data()?.capacity).toMatchObject({ totalSeats: 2, availableSeats: 2 });
  }, 30_000);
});
