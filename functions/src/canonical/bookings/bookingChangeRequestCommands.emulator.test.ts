import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingChangeRequestIdSchema,
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
import { BOOKING_REVISION_TRANSPORT_KEY } from './bookingChangeRequestAuthorization';

const PROJECT_ID = 'ski-academy-change-request-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_change_req_emulator_01');
const accountId = AccountIdSchema.parse('account_change_req_emulator_01');
const instructorAccountId = AccountIdSchema.parse('account_change_req_emulator_instructor_01');
const adminAccountId = AccountIdSchema.parse('account_change_req_emulator_admin_01');
const participantId = ParticipantIdSchema.parse('participant_change_req_emulator_01');
const participantIdB = ParticipantIdSchema.parse('participant_change_req_emulator_02');
const managementId = ParticipantManagementIdSchema.parse('management_change_req_emulator_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_change_req_emulator_02');
const instructorId = InstructorIdSchema.parse('instructor_change_req_emulator_01');
const bookingId = BookingIdSchema.parse('booking_change_req_emulator_01');
const changeRequestId = BookingChangeRequestIdSchema.parse('booking_change_request_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

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
  'booking_change_requests',
  'bookings',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
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

function seedAccount(account: typeof accountId | typeof instructorAccountId | typeof adminAccountId) {
  return AccountSchema.parse({
    accountId: account,
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

function seedParticipantRecord(input: {
  participantId: typeof participantId;
  managementId: typeof managementId;
}) {
  return {
    participantId: input.participantId,
    displayName: `Emulator Participant ${input.participantId}`,
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

function seedManagementRecord(input: {
  managementId: typeof managementId;
  participantId: typeof participantId;
}) {
  return {
    participantManagementId: input.managementId,
    participantId: input.participantId,
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

async function seedInstructor(
  id: typeof instructorId,
  tariff: Readonly<{ pricePerHourKZT?: number; pricePerHour?: number }>
): Promise<void> {
  await firestore.collection('instructors').doc(id).set({
    id,
    name: `Emulator Instructor ${id}`,
    isAvailable: true,
    ...tariff,
  });
}

async function seedSharedFixture(walletBalance = WALLET_START_KZT): Promise<void> {
  await firestore.collection('users').doc(accountId).set(seedAccount(accountId));
  await firestore.collection('users').doc(instructorAccountId).set(seedAccount(instructorAccountId));
  await firestore.collection('users').doc(adminAccountId).set(seedAccount(adminAccountId));
  await firestore
    .collection('users')
    .doc(accountId)
    .collection('wallet')
    .doc('state')
    .set(seedWallet(walletBalance));

  await firestore.collection('participants').doc(participantId).set(
    seedParticipantRecord({ participantId, managementId })
  );
  await firestore.collection('participants').doc(participantIdB).set(
    seedParticipantRecord({ participantId: participantIdB, managementId: managementIdB })
  );

  await firestore.collection('participant_management').doc(managementId).set(
    seedManagementRecord({ managementId, participantId })
  );
  await firestore.collection('participant_management').doc(managementIdB).set(
    seedManagementRecord({ managementId: managementIdB, participantId: participantIdB })
  );

  await seedInstructor(instructorId, { pricePerHourKZT: BOOKING_PRICE_KZT });
}

function instructorContext(idempotencyKey: string, expectedRevision?: number) {
  return {
    actor: accountCommandActor(instructorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
  };
}

function adminContext(
  idempotencyKey: string,
  expectedRevision?: number,
  calendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  },
  transportMetadata: Record<string, string> = {}
) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    calendarInput,
    timezone: 'Asia/Almaty' as const,
    transportMetadata,
  };
}

async function createConfirmedBooking(
  commands: ReturnType<typeof createCommands>,
  input: {
    bookingId: typeof bookingId;
    instructorId: typeof instructorId;
    participantIds: readonly [typeof participantId];
    idempotencyKey: string;
    localTime?: string;
  }
): Promise<void> {
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: input.localTime ?? '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: input.bookingId,
      instructorId: input.instructorId,
      participantIds: [...input.participantIds],
    },
  });
  expect(result.status).toBe('success');
}

async function createOpenChangeRequest(
  commands: ReturnType<typeof createCommands>,
  idempotencyKey = 'create-change-request-emulator'
): Promise<number> {
  const result = await commands.execute({
    kind: 'create_booking_change_request',
    context: instructorContext(idempotencyKey, 1),
    intent: {
      bookingChangeRequestId: changeRequestId,
      bookingId,
      reason: 'Instructor cannot deliver the confirmed occurrence.',
    },
  });
  expect(result.status).toBe('success');
  const request = (await firestore.doc(`booking_change_requests/${changeRequestId}`).get()).data();
  return AggregateRevisionSchema.parse(request?.revision ?? 1);
}

async function durableCounts() {
  const [
    bookings,
    payments,
    monetaryEvents,
    activityLogs,
    idempotency,
    claims,
    changeRequests,
    wallet,
  ] = await Promise.all([
    firestore.collection('bookings').get(),
    firestore.collection('payments').get(),
    firestore.collection('monetary_events').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('resource_claims').get(),
    firestore.collection('booking_change_requests').get(),
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
    changeRequests: changeRequests.size,
    walletBalance: wallet.data()?.balance as number | undefined,
    bookingIds: bookings.docs.map((doc) => doc.id),
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking change request emulator races', () => {
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
    'J. request creation reserves nothing',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-change-req',
      });

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const claimsBefore = await firestore.collection('resource_claims').get();

      const result = await commands.execute({
        kind: 'create_booking_change_request',
        context: instructorContext('create-change-request-emulator', 1),
        intent: {
          bookingChangeRequestId: changeRequestId,
          bookingId,
          reason: 'Instructor cannot deliver the confirmed occurrence.',
        },
      });
      expect(result.status).toBe('success');

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const request = (await firestore.doc(`booking_change_requests/${changeRequestId}`).get()).data();
      const state = await durableCounts();
      const claimsAfter = await firestore.collection('resource_claims').get();

      expect(request?.lifecycle.status).toBe('open');
      expect(request?.requestType).toBe('instructor_unavailable');
      expect(bookingAfter?.lifecycle.status).toBe('confirmed');
      expect(bookingAfter?.revision).toBe(bookingBefore?.revision);
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.walletBalance).toBe(WALLET_START_KZT - BOOKING_PRICE_KZT);
      expect(claimsAfter.size).toBe(claimsBefore.size);
      expect(state.changeRequests).toBe(1);
      expect(state.activityLogs).toBe(2);
    },
    30_000
  );

  it(
    'K. accept reschedule vs target contention (if rescheduled resolution)',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-reschedule-contention',
      });
      await createOpenChangeRequest(commands, 'create-change-request-contention');

      const conflictingBookingId = BookingIdSchema.parse('booking_change_req_emulator_conflict');
      const rescheduleEnvelope: CommandEnvelope<'resolve_booking_change_request'> = {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-reschedule-contention', 1, undefined, {
          [BOOKING_REVISION_TRANSPORT_KEY]: '1',
        }),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'rescheduled',
          reasonExplanation: 'Client agreed to reschedule after instructor unavailability.',
        },
      };
      const contentionBookingEnvelope: CommandEnvelope<'create_confirmed_booking'> = {
        kind: 'create_confirmed_booking',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'contention-target-booking',
          correlationId,
          source: 'client_callable',
          calendarInput: {
            localDate: '2026-01-16',
            localTime: '11:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: {
          bookingId: conflictingBookingId,
          instructorId,
          participantIds: [participantIdB],
        },
      };

      const results = await Promise.allSettled([
        commands.execute(rescheduleEnvelope),
        commands.execute(contentionBookingEnvelope),
      ]);
      const outcomes = results.map((result) =>
        result.status === 'fulfilled' ? result.value : undefined
      );
      const successes = outcomes.filter((outcome) => outcome?.status === 'success');
      const instructorConflicts = outcomes.filter(
        (outcome) => outcome?.status === 'error' && outcome.error.code === 'instructor_conflict'
      );

      expect(successes.length).toBe(1);
      expect(instructorConflicts.length + successes.length).toBe(2);

      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const request = (await firestore.doc(`booking_change_requests/${changeRequestId}`).get()).data();
      const state = await durableCounts();

      if (request?.lifecycle.status === 'resolved') {
        expect(request.lifecycle.resolution).toBe('rescheduled');
        expect(booking?.revision).toBe(2);
        expect(state.bookings).toBe(1);
      } else {
        expect(request?.lifecycle.status).toBe('open');
        expect(state.bookings).toBe(2);
        expect(state.bookingIds).toContain(conflictingBookingId);
      }
    },
    30_000
  );

  it(
    'L. accept vs decline concurrent',
    async () => {
      const commands = createCommands('2026-01-02T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-accept-decline',
      });
      const requestRevision = await createOpenChangeRequest(commands, 'create-change-request-race');

      const resolveEnvelope: CommandEnvelope<'resolve_booking_change_request'> = {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-cancel-race', requestRevision, undefined, {
          [BOOKING_REVISION_TRANSPORT_KEY]: '1',
        }),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'booking_cancelled',
          refundAmount: BOOKING_PRICE_KZT,
          reasonExplanation: 'Client agreed to cancel after instructor unavailability.',
        },
      };
      const withdrawEnvelope: CommandEnvelope<'withdraw_booking_change_request'> = {
        kind: 'withdraw_booking_change_request',
        context: instructorContext('withdraw-race', requestRevision),
        intent: { bookingChangeRequestId: changeRequestId },
      };

      const results = await Promise.allSettled([
        commands.execute(resolveEnvelope),
        commands.execute(withdrawEnvelope),
      ]);
      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 'rejected'
      );
      expect(statuses.filter((status) => status === 'success').length).toBe(1);

      const request = (await firestore.doc(`booking_change_requests/${changeRequestId}`).get()).data();
      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const state = await durableCounts();

      if (request?.lifecycle.status === 'resolved') {
        expect(request.lifecycle.resolution).toBe('booking_cancelled');
        expect(booking?.lifecycle.status).toBe('cancelled');
        expect(payment?.refundedAmount).toBe(BOOKING_PRICE_KZT);
        expect(state.refundEvents).toBe(1);
        expect(state.walletBalance).toBe(WALLET_START_KZT);
      } else {
        expect(request?.lifecycle.status).toBe('cancelled');
        expect(booking?.lifecycle.status).toBe('confirmed');
        expect(payment?.refundedAmount ?? 0).toBe(0);
        expect(state.refundEvents).toBe(0);
      }
    },
    30_000
  );

  it(
    'M. acceptance replay',
    async () => {
      const commands = createCommands('2026-01-02T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-replay',
      });
      const requestRevision = await createOpenChangeRequest(commands, 'create-change-request-replay');

      const envelope: CommandEnvelope<'resolve_booking_change_request'> = {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-replay', requestRevision, undefined, {
          [BOOKING_REVISION_TRANSPORT_KEY]: '1',
        }),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'booking_cancelled',
          refundAmount: BOOKING_PRICE_KZT,
          reasonExplanation: 'Client agreed to cancel after instructor unavailability.',
        },
      };

      const first = await commands.execute(envelope);
      const second = await commands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');

      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const state = await durableCounts();

      expect(booking?.lifecycle.status).toBe('cancelled');
      expect(payment?.refundedAmount).toBe(BOOKING_PRICE_KZT);
      expect(state.refundEvents).toBe(1);
      expect(state.monetaryEvents).toBe(2);
      expect(state.walletBalance).toBe(WALLET_START_KZT);
      expect(state.changeRequests).toBe(1);
    },
    30_000
  );

  it(
    'N. direct T17 reschedule vs change-request resolution race',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-t17-race',
      });
      await createOpenChangeRequest(commands, 'create-change-request-t17-race');

      const rescheduleEnvelope: CommandEnvelope<'reschedule_booking'> = {
        kind: 'reschedule_booking',
        context: adminContext('admin-reschedule-race', 1, {
          localDate: '2026-01-16',
          localTime: '10:00',
          durationMinutes: 60,
        }),
        intent: {
          bookingId,
          reasonExplanation: 'Admin reschedule concurrent with change-request resolution',
        },
      };
      const resolveEnvelope: CommandEnvelope<'resolve_booking_change_request'> = {
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-reschedule-race-n', 1, {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        }, {
          [BOOKING_REVISION_TRANSPORT_KEY]: '1',
        }),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'rescheduled',
          reasonExplanation: 'Client agreed to reschedule after instructor unavailability.',
        },
      };

      const results = await Promise.allSettled([
        commands.execute(rescheduleEnvelope),
        commands.execute(resolveEnvelope),
      ]);
      const outcomes = results.map((result) =>
        result.status === 'fulfilled' ? result.value : undefined
      );
      const successes = outcomes.filter((outcome) => outcome?.status === 'success');
      const staleOutcomes = outcomes.filter(
        (outcome) => outcome?.status === 'error' && outcome.error.code === 'stale_version'
      );

      expect(successes.length).toBe(1);
      expect(successes.length + staleOutcomes.length).toBe(2);

      const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const request = (await firestore.doc(`booking_change_requests/${changeRequestId}`).get()).data();
      const claims = await firestore.collection('resource_claims').get();
      const activeClaims = claims.docs.filter((doc) => doc.data().lifecycle?.status === 'active');

      if (request?.lifecycle.status === 'resolved') {
        expect(request.lifecycle.resolution).toBe('rescheduled');
        expect(booking?.revision).toBe(2);
      } else {
        expect(request?.lifecycle.status).toBe('open');
        expect(booking?.revision).toBe(2);
      }
      expect(activeClaims.length).toBe(2);
    },
    30_000
  );

  it(
    'O. undefined serialization boundary for change request persistence',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands, {
        bookingId,
        instructorId,
        participantIds: [participantId],
        idempotencyKey: 'seed-booking-undefined-boundary',
      });

      const createResult = await commands.execute({
        kind: 'create_booking_change_request',
        context: instructorContext('create-change-request-undefined', 1),
        intent: {
          bookingChangeRequestId: changeRequestId,
          bookingId,
          reason: 'Instructor cannot deliver the confirmed occurrence.',
        },
      });
      expect(createResult.status).toBe('success');

      const requestDoc = await firestore.doc(`booking_change_requests/${changeRequestId}`).get();
      expect(requestDoc.exists).toBe(true);
      expect(Object.values(requestDoc.data() ?? {}).includes(undefined)).toBe(false);

      const resolveResult = await commands.execute({
        kind: 'resolve_booking_change_request',
        context: adminContext('resolve-no-change-undefined', 1),
        intent: {
          bookingChangeRequestId: changeRequestId,
          resolution: 'no_change',
        },
      });
      expect(resolveResult.status).toBe('success');
    },
    30_000
  );
});
