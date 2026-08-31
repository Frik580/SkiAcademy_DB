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
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
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
const occurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
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

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function accountContext(
  capability: 'account_owner' | 'administrator',
  actorAccountId: typeof accountId | typeof adminAccountId,
  idempotencyKey: string,
  expectedRevision?: number
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput: {
      localDate: '2026-01-15',
      localTime: '09:00',
      durationMinutes: 60,
    },
    timezone: 'Asia/Almaty' as const,
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
}

async function createConfirmedBooking(
  commands: ReturnType<typeof createCommands>,
  targetBookingId = bookingId
): Promise<void> {
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: `create-${targetBookingId}`,
      correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: { bookingId: targetBookingId, instructorId, participantIds: [participantId] },
  });
  expect(result.status).toBe('success');
}

async function requestPendingCancellation(
  commands: ReturnType<typeof createCommands>,
  targetBookingId = bookingId,
  idempotencyKey = 'pending-emulator'
): Promise<number> {
  const bookingBefore = (await firestore.doc(`bookings/${targetBookingId}`).get()).data();
  const revision = AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1);
  const result = await commands.execute({
    kind: 'request_booking_cancellation',
    context: accountContext('account_owner', accountId, idempotencyKey, revision),
    intent: { bookingId: targetBookingId },
  });
  expect(result.status).toBe('success');
  const pendingBooking = (await firestore.doc(`bookings/${targetBookingId}`).get()).data();
  return AggregateRevisionSchema.parse(pendingBooking?.revision ?? revision + 1);
}

async function durableCounts() {
  const [
    bookings,
    payments,
    monetaryEvents,
    activityLogs,
    idempotency,
    claims,
    adminIssues,
    wallet,
  ] = await Promise.all([
    firestore.collection('bookings').get(),
    firestore.collection('payments').get(),
    firestore.collection('monetary_events').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('resource_claims').get(),
    firestore.collection('admin_issues').get(),
    firestore.doc(`users/${accountId}/wallet/state`).get(),
  ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );
  const refundEvents = monetaryEvents.docs.filter(
    (doc) => doc.data().eventKind === 'refund_to_wallet'
  );

  return {
    bookings: bookings.size,
    payments: payments.size,
    monetaryEvents: monetaryEvents.size,
    refundEvents: refundEvents.length,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    releasedClaims: claims.docs.filter((doc) => doc.data().lifecycle?.status === 'released')
      .length,
    adminIssues: adminIssues.size,
    openAdminIssues: adminIssues.docs.filter((doc) => doc.data().lifecycle?.status === 'open')
      .length,
    walletBalance: wallet.data()?.balance as number | undefined,
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking cancellation emulator races', () => {
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
    await seedSharedFixture();
  }, 30_000);

  it(
    'A. direct >=24h cancellation commits booking, refund, claims, audit, and idempotency atomically',
    async () => {
      const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(createCommandsAt);

      const bookingDoc = await firestore.doc(`bookings/${bookingId}`).get();
      const startsAt = bookingDoc.data()?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
      );
      const requestIso = new Date(
        requestAt.seconds * 1000 + requestAt.nanoseconds / 1_000_000
      ).toISOString();

      const commands = createCommands(requestIso);
      const envelope: CommandEnvelope<'request_booking_cancellation'> = {
        kind: 'request_booking_cancellation',
        context: accountContext('account_owner', accountId, 'direct-cancel-emulator', 1),
        intent: { bookingId },
      };
      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');

      const state = await durableCounts();
      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const claims = await firestore.collection('resource_claims').get();
      const identity = resolveCommandIdempotencyIdentity(envelope);

      expect(booking?.lifecycle.status).toBe('cancelled');
      expect(payment?.refundedAmount).toBe(BOOKING_PRICE_KZT);
      expect(state.walletBalance).toBe(WALLET_START_KZT);
      expect(state.refundEvents).toBe(1);
      expect(state.monetaryEvents).toBe(2);
      expect(state.releasedClaims).toBe(2);
      expect(state.activityLogs).toBe(2);
      expect(state.successfulIdempotency).toBe(2);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(true);
      expect(
        (
          await firestore
            .doc(`monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`)
            .get()
        ).exists
      ).toBe(true);
      expect(claims.docs.every((doc) => doc.data().lifecycle?.status === 'released')).toBe(true);

      const replay = await commands.execute(envelope);
      expect(replay.status).toBe('success');
      const afterReplay = await durableCounts();
      expect(afterReplay.refundEvents).toBe(1);
      expect(afterReplay.monetaryEvents).toBe(2);
      expect(afterReplay.successfulIdempotency).toBe(2);
    },
    30_000
  );

  it(
    'B. withdraw vs admin approve race yields exactly one durable decision without hybrid finance state',
    async () => {
      const commands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(commands);
      const revision = await requestPendingCancellation(commands);

      const withdrawEnvelope: CommandEnvelope<'withdraw_booking_cancellation_request'> = {
        kind: 'withdraw_booking_cancellation_request',
        context: accountContext('account_owner', accountId, 'withdraw-race-01', revision),
        intent: { bookingId },
      };
      const approveEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'approve-race-01', revision),
        intent: {
          bookingId,
          decision: 'approve',
          refundAmount: BOOKING_PRICE_KZT,
          expectedPaymentRevision: 1,
          reasonExplanation: 'Approve withdraw race',
        },
      };

      const results = await Promise.allSettled([
        commands.execute(withdrawEnvelope),
        commands.execute(approveEnvelope),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBe(1);

      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const state = await durableCounts();

      if (booking?.lifecycle.status === 'confirmed') {
        expect(payment?.refundedAmount ?? 0).toBe(0);
        expect(state.releasedClaims).toBe(0);
        expect(state.refundEvents).toBe(0);
      } else {
        expect(booking?.lifecycle.status).toBe('cancelled');
        expect(payment?.refundedAmount).toBe(BOOKING_PRICE_KZT);
        expect(state.releasedClaims).toBe(2);
        expect(state.refundEvents).toBe(1);
      }

      expect(
        booking?.lifecycle.status === 'confirmed' && (payment?.refundedAmount ?? 0) > 0
      ).toBe(false);
      expect(
        booking?.lifecycle.status === 'cancelled' && state.releasedClaims < 2
      ).toBe(false);
    },
    30_000
  );

  it(
    'C. admin approval replay does not duplicate refund, wallet credit, claims release, or activity log',
    async () => {
      const commands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(commands);
      const revision = await requestPendingCancellation(commands);

      const approveEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'approve-replay-01', revision),
        intent: {
          bookingId,
          decision: 'approve',
          refundAmount: 6_000,
          expectedPaymentRevision: 1,
          reasonExplanation: 'Partial approval replay',
        },
      };

      const first = await commands.execute(approveEnvelope);
      const second = await commands.execute(approveEnvelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const wallet = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const state = await durableCounts();
      const identity = resolveCommandIdempotencyIdentity(approveEnvelope);

      expect(payment?.refundedAmount).toBe(6_000);
      expect(wallet?.balance).toBe(WALLET_START_KZT - 6_000);
      expect(state.refundEvents).toBe(1);
      expect(state.activityLogs).toBe(3);
      expect(state.successfulIdempotency).toBe(3);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(true);

      const replayState = await durableCounts();
      expect(replayState.refundEvents).toBe(1);
      expect(replayState.releasedClaims).toBe(2);
    },
    30_000
  );

  it(
    'D. post-endsAt reject uses attendance present -> completed and absent -> no_show',
    async () => {
      const pendingCommands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(pendingCommands);
      await requestPendingCancellation(pendingCommands);

      const attendanceIdPresent = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId,
        participantId,
      });
      await firestore.doc(`attendance/${attendanceIdPresent}`).set(
        AttendanceSchema.parse({
          attendanceId: attendanceIdPresent,
          subject: {
            subjectKind: 'booking',
            bookingId,
            occurrenceId,
            participantId,
          },
          attendanceStatus: 'present',
          recordedBy: { kind: 'instructor', instructorId },
          recordedAt: lessonEndsAt,
          lastChangedBy: { kind: 'instructor', instructorId },
          updatedAt: lessonEndsAt,
          revision: 1,
          correlationId,
        })
      );

      const rejectPresentCommands = createCommands('2026-01-15T11:00:00.000Z');
      const presentResult = await rejectPresentCommands.execute({
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'reject-present-01', 2),
        intent: {
          bookingId,
          decision: 'reject',
          reasonExplanation: 'Participant attended',
        },
      });
      expect(presentResult.status).toBe('success');
      expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.lifecycle.status).toBe(
        'completed'
      );

      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedSharedFixture();
      const absentBookingId = BookingIdSchema.parse('booking_cancel_emulator_absent');
      const absentCommands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(absentCommands, absentBookingId);
      await requestPendingCancellation(absentCommands, absentBookingId, 'pending-absent');

      const absentOccurrenceId = initialBookingOccurrenceIdFromBookingId(absentBookingId);
      const attendanceIdAbsent = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: absentOccurrenceId,
        participantId,
      });
      await firestore.doc(`attendance/${attendanceIdAbsent}`).set(
        AttendanceSchema.parse({
          attendanceId: attendanceIdAbsent,
          subject: {
            subjectKind: 'booking',
            bookingId: absentBookingId,
            occurrenceId: absentOccurrenceId,
            participantId,
          },
          attendanceStatus: 'absent',
          recordedBy: { kind: 'instructor', instructorId },
          recordedAt: lessonEndsAt,
          lastChangedBy: { kind: 'instructor', instructorId },
          updatedAt: lessonEndsAt,
          revision: 1,
          correlationId,
        })
      );

      const rejectAbsentCommands = createCommands('2026-01-15T11:00:00.000Z');
      const absentResult = await rejectAbsentCommands.execute({
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'reject-absent-01', 2),
        intent: {
          bookingId: absentBookingId,
          decision: 'reject',
          reasonExplanation: 'Participant absent',
        },
      });
      expect(absentResult.status).toBe('success');
      expect(
        (await firestore.doc(`bookings/${absentBookingId}`).get()).data()?.lifecycle.status
      ).toBe('no_show');

      const earlyRejectCommands = createCommands('2026-01-14T12:00:00.000Z');
      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedSharedFixture();
      await createConfirmedBooking(earlyRejectCommands);
      await requestPendingCancellation(earlyRejectCommands);
      const earlyResult = await earlyRejectCommands.execute({
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'reject-early-01', 2),
        intent: {
          bookingId,
          decision: 'reject',
          reasonExplanation: 'Before lesson end',
        },
      });
      expect(earlyResult.status).toBe('success');
      expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.lifecycle.status).toBe(
        'confirmed'
      );
    },
    30_000
  );

  it(
    'E. post-endsAt reject without attendance keeps booking confirmed, opens one missing_attendance issue, and replays without multiplying issues',
    async () => {
      const commands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(commands);
      await requestPendingCancellation(commands);

      const rejectCommands = createCommands('2026-01-15T11:00:00.000Z');
      const envelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'reject-missing-01', 2),
        intent: {
          bookingId,
          decision: 'reject',
          reasonExplanation: 'Attendance missing',
        },
      };

      const first = await rejectCommands.execute(envelope);
      const second = await rejectCommands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const issues = await firestore.collection('admin_issues').get();
      const missingIssues = issues.docs.filter((doc) => doc.data().kind === 'missing_attendance');

      expect(booking?.lifecycle.status).toBe('confirmed');
      expect(missingIssues.length).toBe(1);
      expect(issues.size).toBe(2);
      expect(
        issues.docs.filter((doc) => doc.data().kind === 'unresolved_pending_cancellation').length
      ).toBe(1);
      expect(
        issues.docs.filter(
          (doc) =>
            doc.data().kind === 'unresolved_pending_cancellation' &&
            doc.data().lifecycle?.status === 'resolved'
        ).length
      ).toBe(1);
    },
    30_000
  );

  it(
    'F. cancellation refund path commits through real Firestore without undefined-field write failures',
    async () => {
      await firestore.doc(`instructors/${instructorId}`).set({
        id: instructorId,
        name: 'Emulator Coach',
        pricePerHour: 120,
        isAvailable: true,
      });

      const commands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(commands);
      const revision = await requestPendingCancellation(commands);

      const result = await commands.execute({
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'firestore-boundary-01', revision),
        intent: {
          bookingId,
          decision: 'approve',
          refundAmount: BOOKING_PRICE_KZT,
          expectedPaymentRevision: 1,
          reasonExplanation: 'Boundary serialization',
        },
      });
      expect(result.status).toBe('success');

      const booking = await firestore.doc(`bookings/${bookingId}`).get();
      const payment = await firestore.doc(`payments/${paymentId}`).get();
      expect(booking.data()?.lifecycle.status).toBe('cancelled');
      expect(payment.data()?.refundedAmount).toBe(BOOKING_PRICE_KZT);
    },
    30_000
  );

  it(
    'serializes admin approve vs reject without duplicate refunds',
    async () => {
      const commands = createCommands('2026-01-14T09:00:01.000Z');
      await createConfirmedBooking(commands);
      const revision = await requestPendingCancellation(commands, bookingId, 'pending-emulator-01');

      const approveEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'approve-race-legacy', revision),
        intent: {
          bookingId,
          decision: 'approve',
          refundAmount: BOOKING_PRICE_KZT,
          expectedPaymentRevision: 1,
          reasonExplanation: 'Approve race test',
        },
      };
      const rejectEnvelope: CommandEnvelope<'resolve_booking_cancellation'> = {
        kind: 'resolve_booking_cancellation',
        context: accountContext('administrator', adminAccountId, 'reject-race-legacy', revision),
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
      expect(payment?.refundedAmount ?? 0).toBeLessThanOrEqual(BOOKING_PRICE_KZT);
    },
    30_000
  );
});
