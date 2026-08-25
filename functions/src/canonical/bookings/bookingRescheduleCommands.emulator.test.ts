import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QuerySnapshot } from 'firebase-admin/firestore';
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
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  bookingOccurrenceIdFromScheduleRevision,
  initialBookingOccurrenceIdFromBookingId,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { bookingClaimIdentities } from './bookingClaimOperations';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-reschedule-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_reschedule_emulator_01');
const accountId = AccountIdSchema.parse('account_reschedule_emulator_01');
const accountTwoId = AccountIdSchema.parse('account_reschedule_emulator_02');
const adminAccountId = AccountIdSchema.parse('account_reschedule_emulator_admin');
const participantId = ParticipantIdSchema.parse('participant_reschedule_emulator_01');
const participantTwoId = ParticipantIdSchema.parse('participant_reschedule_emulator_02');
const managementId = ParticipantManagementIdSchema.parse('management_reschedule_emulator_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_reschedule_emulator_02');
const instructorId = InstructorIdSchema.parse('instructor_reschedule_emulator_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_reschedule_emulator_02');
const bookingId = BookingIdSchema.parse('booking_reschedule_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
const initialOccurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));

const BOOKING_PRICE_KZT = 12_000;
const INSTRUCTOR_TWO_PRICE_KZT = 18_000;
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
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

type CalendarInput = {
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
};

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
  expectedRevision?: number,
  calendarInput: CalendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  }
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
    calendarInput,
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

async function seedAccountAndWallet(
  account: typeof accountId | typeof accountTwoId,
  walletBalance = WALLET_START_KZT
): Promise<void> {
  await firestore.doc(`users/${account}`).set(
    AccountSchema.parse({
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
    })
  );
  await firestore.doc(`users/${account}/wallet/state`).set(
    WalletSchema.parse({
      accountId: account,
      currency: 'KZT',
      balance: walletBalance,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
}

async function seedParticipantBundle(input: {
  account: typeof accountId | typeof accountTwoId;
  participant: typeof participantId | typeof participantTwoId;
  management: typeof managementId | typeof managementTwoId;
  displayName: string;
}): Promise<void> {
  await firestore.doc(`participants/${input.participant}`).set({
    participantId: input.participant,
    displayName: input.displayName,
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.management },
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
  await firestore.doc(`participant_management/${input.management}`).set({
    participantManagementId: input.management,
    participantId: input.participant,
    accountId: input.account,
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
}

async function seedSharedFixture(): Promise<void> {
  await seedAccountAndWallet(accountId);
  await seedAccountAndWallet(accountTwoId);
  await seedParticipantBundle({
    account: accountId,
    participant: participantId,
    management: managementId,
    displayName: 'Emulator Participant',
  });
  await seedParticipantBundle({
    account: accountTwoId,
    participant: participantTwoId,
    management: managementTwoId,
    displayName: 'Emulator Participant Two',
  });
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
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Emulator Coach',
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await firestore.doc(`instructors/${instructorTwoId}`).set({
    id: instructorTwoId,
    name: 'Emulator Coach Two',
    pricePerHourKZT: INSTRUCTOR_TWO_PRICE_KZT,
    isAvailable: true,
  });
}

async function createConfirmedBooking(
  commands: ReturnType<typeof createCommands>,
  input: {
    targetBookingId?: typeof bookingId;
    actorAccountId?: typeof accountId | typeof accountTwoId;
    instructor?: typeof instructorId | typeof instructorTwoId;
    participantIds?: readonly [typeof participantId | typeof participantTwoId];
    calendarInput?: CalendarInput;
    idempotencyKey?: string;
  } = {}
): Promise<void> {
  const targetBookingId = input.targetBookingId ?? bookingId;
  const actorAccountId = input.actorAccountId ?? accountId;
  const instructor = input.instructor ?? instructorId;
  const participantIds = input.participantIds ?? [participantId];
  const calendarInput = input.calendarInput ?? {
    localDate: '2026-01-15',
    localTime: '09:00',
    durationMinutes: 60,
  };
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(actorAccountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey ?? `create-${targetBookingId}`,
      correlationId,
      source: 'client_callable',
      calendarInput,
      timezone: 'Asia/Almaty',
    },
    intent: { bookingId: targetBookingId, instructorId: instructor, participantIds },
  });
  expect(result.status).toBe('success');
}

async function durableCounts() {
  const [
    bookings,
    payments,
    monetaryEvents,
    activityLogs,
    idempotency,
    claims,
    wallet,
  ] = await Promise.all([
    firestore.collection('bookings').get(),
    firestore.collection('payments').get(),
    firestore.collection('monetary_events').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('resource_claims').get(),
    firestore.doc(`users/${accountId}/wallet/state`).get(),
  ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );

  return {
    bookings: bookings.size,
    payments: payments.size,
    monetaryEvents: monetaryEvents.size,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    activeClaims: claims.docs.filter((doc) => doc.data().lifecycle?.status === 'active').length,
    releasedClaims: claims.docs.filter((doc) => doc.data().lifecycle?.status === 'released').length,
    walletBalance: wallet.data()?.balance as number | undefined,
  };
}

function claimsForBookingOccurrence(
  claims: QuerySnapshot,
  bookingIdValue: string,
  occurrenceIdValue: string
) {
  return claims.docs.filter(
    (doc) =>
      doc.data().ownerId === bookingIdValue && doc.data().occurrenceId === occurrenceIdValue
  );
}

function rescheduleEnvelope(
  idempotencyKey: string,
  expectedRevision = 1,
  calendarInput: CalendarInput = {
    localDate: '2026-01-16',
    localTime: '11:00',
    durationMinutes: 60,
  }
): CommandEnvelope<'reschedule_booking'> {
  return {
    kind: 'reschedule_booking',
    context: accountContext('account_owner', accountId, idempotencyKey, expectedRevision, calendarInput),
    intent: { bookingId },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking reschedule Firestore emulator', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  }, 30_000);

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture();
  }, 30_000);

  it(
    'A. serializes concurrent client self-service reschedules to one winner with single occurrence rotation',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const raceCommands = createCommands(requestIso);
      const revision = AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1);

      const envelopeA = rescheduleEnvelope('race-a', revision, {
        localDate: '2026-01-16',
        localTime: '11:00',
        durationMinutes: 60,
      });
      const envelopeB = rescheduleEnvelope('race-b', revision, {
        localDate: '2026-01-16',
        localTime: '12:00',
        durationMinutes: 60,
      });

      const [resultA, resultB] = await Promise.all([
        raceCommands.execute(envelopeA),
        raceCommands.execute(envelopeB),
      ]);

      const outcomes = [resultA.status, resultB.status];
      expect(outcomes.filter((status) => status === 'success').length).toBe(1);
      expect(outcomes.filter((status) => status === 'error').length).toBe(1);

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const rotatedOccurrenceId = bookingOccurrenceIdFromScheduleRevision(bookingId, 2);
      expect(bookingAfter?.occurrence.occurrenceId).toBe(rotatedOccurrenceId);
      expect(bookingAfter?.occurrence.occurrenceId).not.toBe(initialOccurrenceId);
      expect(bookingAfter?.occurrence.scheduleRevision).toBe(2);
      expect(bookingAfter?.clientSelfServiceRescheduleConsumedAt).toBeDefined();

      const claimsSnapshot = await firestore.collection('resource_claims').get();
      const activeClaims = claimsSnapshot.docs.filter(
        (doc) => doc.data().lifecycle?.status === 'active'
      );
      expect(activeClaims.length).toBe(2);
      expect(
        activeClaims.every((doc) => doc.data().occurrenceId === bookingAfter?.occurrence.occurrenceId)
      ).toBe(true);

      const oldOccurrenceClaims = claimsForBookingOccurrence(
        claimsSnapshot,
        bookingId,
        initialOccurrenceId
      );
      expect(oldOccurrenceClaims.every((doc) => doc.data().lifecycle?.status === 'released')).toBe(
        true
      );

      const successfulEnvelope = resultA.status === 'success' ? envelopeA : envelopeB;
      const identity = resolveCommandIdempotencyIdentity(successfulEnvelope);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(true);

      const state = await durableCounts();
      expect(state.successfulIdempotency).toBe(2);
      expect(state.monetaryEvents).toBe(1);
    },
    30_000
  );

  it(
    'A-claim. successful same-resource reschedule releases old claims and activates new occurrence claims',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);

      const oldClaimIds = bookingClaimIdentities({
        bookingId,
        occurrenceId: initialOccurrenceId,
        instructorId,
        participantId,
      });

      const result = await rescheduleCommands.execute(rescheduleEnvelope('same-resource-claim'));
      expect(result.status).toBe('success');

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const newOccurrenceId = bookingAfter?.occurrence.occurrenceId;
      expect(newOccurrenceId).toBe(bookingOccurrenceIdFromScheduleRevision(bookingId, 2));

      const newClaimIds = bookingClaimIdentities({
        bookingId,
        occurrenceId: newOccurrenceId!,
        instructorId,
        participantId,
      });

      const oldInstructorClaim = await firestore
        .doc(`resource_claims/${oldClaimIds.instructorClaimId}`)
        .get();
      const oldParticipantClaim = await firestore
        .doc(`resource_claims/${oldClaimIds.participantClaimId}`)
        .get();
      expect(oldInstructorClaim.data()?.lifecycle?.status).toBe('released');
      expect(oldParticipantClaim.data()?.lifecycle?.status).toBe('released');

      const newInstructorClaim = await firestore
        .doc(`resource_claims/${newClaimIds.instructorClaimId}`)
        .get();
      const newParticipantClaim = await firestore
        .doc(`resource_claims/${newClaimIds.participantClaimId}`)
        .get();
      expect(newInstructorClaim.data()?.lifecycle?.status).toBe('active');
      expect(newParticipantClaim.data()?.lifecycle?.status).toBe('active');
    },
    30_000
  );

  it(
    'B. rejects reschedule when target instructor interval is already claimed and preserves original booking state',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const blockerBookingId = BookingIdSchema.parse('booking_reschedule_emulator_blocker_instr');
      await createConfirmedBooking(commands, {
        targetBookingId: blockerBookingId,
        actorAccountId: accountTwoId,
        participantIds: [participantTwoId],
        calendarInput: {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        },
        idempotencyKey: 'create-blocker-instr',
      });

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentBefore = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);

      const envelope = rescheduleEnvelope('instr-contention');
      const result = await rescheduleCommands.execute(envelope);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('instructor_conflict');
      }

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentAfter = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const claimsSnapshot = await firestore.collection('resource_claims').get();

      expect(bookingAfter?.occurrence.occurrenceId).toBe(initialOccurrenceId);
      expect(bookingAfter?.occurrence.scheduleRevision).toBe(1);
      expect(bookingAfter?.occurrence.interval).toEqual(bookingBefore?.occurrence.interval);
      expect(bookingAfter?.clientSelfServiceRescheduleConsumedAt).toBeUndefined();
      expect(paymentAfter).toEqual(paymentBefore);
      expect(walletAfter?.balance).toBe(walletBefore?.balance);

      const oldOccurrenceClaims = claimsForBookingOccurrence(
        claimsSnapshot,
        bookingId,
        initialOccurrenceId
      );
      expect(oldOccurrenceClaims.length).toBe(2);
      expect(
        oldOccurrenceClaims.every((doc) => doc.data().lifecycle?.status === 'active')
      ).toBe(true);

      const identity = resolveCommandIdempotencyIdentity(envelope);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(false);
      expect(
        (await firestore.doc(`monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`).get())
          .exists
      ).toBe(false);

      const state = await durableCounts();
      expect(state.successfulIdempotency).toBe(2);
      expect(state.monetaryEvents).toBe(2);
      expect(state.activityLogs).toBe(2);
    },
    30_000
  );

  it(
    'C. rejects reschedule when target participant interval is already claimed and preserves original booking state',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const blockerBookingId = BookingIdSchema.parse('booking_reschedule_emulator_blocker_part');
      await createConfirmedBooking(commands, {
        targetBookingId: blockerBookingId,
        instructor: instructorTwoId,
        calendarInput: {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        },
        idempotencyKey: 'create-blocker-part',
      });

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentBefore = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);

      const envelope = rescheduleEnvelope('participant-contention');
      const result = await rescheduleCommands.execute(envelope);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('participant_conflict');
      }

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentAfter = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const claimsSnapshot = await firestore.collection('resource_claims').get();

      expect(bookingAfter?.occurrence.occurrenceId).toBe(initialOccurrenceId);
      expect(bookingAfter?.occurrence.scheduleRevision).toBe(1);
      expect(bookingAfter?.occurrence.instructorId).toBe(instructorId);
      expect(paymentAfter).toEqual(paymentBefore);
      expect(walletAfter?.balance).toBe(walletBefore?.balance);

      const oldOccurrenceClaims = claimsForBookingOccurrence(
        claimsSnapshot,
        bookingId,
        initialOccurrenceId
      );
      expect(oldOccurrenceClaims.length).toBe(2);
      expect(
        oldOccurrenceClaims.every((doc) => doc.data().lifecycle?.status === 'active')
      ).toBe(true);

      const identity = resolveCommandIdempotencyIdentity(envelope);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(false);

      const state = await durableCounts();
      expect(state.successfulIdempotency).toBe(2);
      expect(state.monetaryEvents).toBe(2);
      expect(state.activityLogs).toBe(2);
    },
    30_000
  );

  it(
    'D. admin instructor change reprices atomically with claim rotation and preserved payment identity',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();

      const envelope: CommandEnvelope<'change_booking_instructor'> = {
        kind: 'change_booking_instructor',
        context: accountContext('administrator', adminAccountId, 'admin-instructor-emulator', 1, {
          localDate: '2026-01-15',
          localTime: '09:00',
          durationMinutes: 60,
        }),
        intent: {
          bookingId,
          instructorId: instructorTwoId,
          reasonExplanation: 'Instructor unavailable',
        },
      };

      const result = await commands.execute(envelope);
      expect(result.status).toBe('success');

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentAfter = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const claimsSnapshot = await firestore.collection('resource_claims').get();
      const identity = resolveCommandIdempotencyIdentity(envelope);
      const rotatedOccurrenceId = bookingOccurrenceIdFromScheduleRevision(bookingId, 2);

      expect(bookingAfter?.occurrence.instructorId).toBe(instructorTwoId);
      expect(bookingAfter?.occurrence.occurrenceId).toBe(rotatedOccurrenceId);
      expect(bookingAfter?.occurrence.scheduleRevision).toBe(2);
      expect(paymentAfter?.paymentId).toBe(paymentId);
      expect(paymentAfter?.price).toBe(INSTRUCTOR_TWO_PRICE_KZT);
      expect(walletAfter?.balance).toBe(walletBefore?.balance);

      const oldOccurrenceClaims = claimsForBookingOccurrence(
        claimsSnapshot,
        bookingId,
        initialOccurrenceId
      );
      expect(oldOccurrenceClaims.every((doc) => doc.data().lifecycle?.status === 'released')).toBe(
        true
      );

      const newOccurrenceClaims = claimsForBookingOccurrence(
        claimsSnapshot,
        bookingId,
        rotatedOccurrenceId
      );
      expect(newOccurrenceClaims.length).toBe(2);
      expect(
        newOccurrenceClaims.every((doc) => doc.data().lifecycle?.status === 'active')
      ).toBe(true);
      expect(
        newOccurrenceClaims.some((doc) => doc.data().resourceId === instructorTwoId)
      ).toBe(true);
      expect(
        newOccurrenceClaims.some((doc) => doc.data().resourceId === participantId)
      ).toBe(true);

      const state = await durableCounts();
      expect(state.monetaryEvents).toBe(2);
      expect(state.activityLogs).toBe(2);
      expect(state.successfulIdempotency).toBe(2);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(true);
      expect(
        (await firestore.doc(`monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`).get())
          .exists
      ).toBe(true);
    },
    30_000
  );

  it(
    'E. rolls back failed admin instructor change on target conflict without partial durable state',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const blockerBookingId = BookingIdSchema.parse('booking_reschedule_emulator_blocker_admin');
      await createConfirmedBooking(commands, {
        targetBookingId: blockerBookingId,
        actorAccountId: accountTwoId,
        participantIds: [participantTwoId],
        instructor: instructorTwoId,
        idempotencyKey: 'create-blocker-admin',
      });

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentBefore = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const claimsBefore = await firestore.collection('resource_claims').get();

      const envelope: CommandEnvelope<'change_booking_instructor'> = {
        kind: 'change_booking_instructor',
        context: accountContext('administrator', adminAccountId, 'admin-conflict-emulator', 1, {
          localDate: '2026-01-15',
          localTime: '09:00',
          durationMinutes: 60,
        }),
        intent: {
          bookingId,
          instructorId: instructorTwoId,
          reasonExplanation: 'Conflict test',
        },
      };

      const result = await commands.execute(envelope);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error.code).toBe('instructor_conflict');
      }

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const paymentAfter = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
      const claimsAfter = await firestore.collection('resource_claims').get();

      expect(bookingAfter?.occurrence.occurrenceId).toBe(initialOccurrenceId);
      expect(bookingAfter?.occurrence.scheduleRevision).toBe(1);
      expect(bookingAfter?.occurrence.instructorId).toBe(instructorId);
      expect(bookingAfter?.occurrence.interval).toEqual(bookingBefore?.occurrence.interval);
      expect(paymentAfter).toEqual(paymentBefore);
      expect(walletAfter?.balance).toBe(walletBefore?.balance);

      const oldOccurrenceClaimsBefore = claimsForBookingOccurrence(
        claimsBefore,
        bookingId,
        initialOccurrenceId
      );
      const oldOccurrenceClaimsAfter = claimsForBookingOccurrence(
        claimsAfter,
        bookingId,
        initialOccurrenceId
      );
      expect(oldOccurrenceClaimsAfter.length).toBe(oldOccurrenceClaimsBefore.length);
      expect(
        oldOccurrenceClaimsAfter.every((doc) => doc.data().lifecycle?.status === 'active')
      ).toBe(true);

      const identity = resolveCommandIdempotencyIdentity(envelope);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get())
          .exists
      ).toBe(false);
      expect(
        (await firestore.doc(`monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`).get())
          .exists
      ).toBe(false);

      const state = await durableCounts();
      expect(state.successfulIdempotency).toBe(2);
      expect(state.monetaryEvents).toBe(2);
      expect(state.activityLogs).toBe(2);
    },
    30_000
  );

  it(
    'F. replays successful reschedule and admin service change without duplicate mutation',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);

      const rescheduleEnvelopeValue = rescheduleEnvelope('replay-reschedule');
      await rescheduleCommands.execute(rescheduleEnvelopeValue);
      const occurrenceAfterReschedule = (
        await firestore.doc(`bookings/${bookingId}`).get()
      ).data()?.occurrence.occurrenceId;
      const walletAfterReschedule = (
        await firestore.doc(`users/${accountId}/wallet/state`).get()
      ).data()?.balance;
      const paymentAfterReschedule = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const countsAfterReschedule = await durableCounts();

      const rescheduleReplay = await rescheduleCommands.execute(rescheduleEnvelopeValue);
      expect(rescheduleReplay.status).toBe('success');
      expect(
        (await firestore.doc(`bookings/${bookingId}`).get()).data()?.occurrence.occurrenceId
      ).toBe(occurrenceAfterReschedule);
      expect((await firestore.doc(`payments/${paymentId}`).get()).data()).toEqual(
        paymentAfterReschedule
      );
      expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(
        walletAfterReschedule
      );
      const countsAfterRescheduleReplay = await durableCounts();
      expect(countsAfterRescheduleReplay.monetaryEvents).toBe(countsAfterReschedule.monetaryEvents);
      expect(countsAfterRescheduleReplay.activityLogs).toBe(countsAfterReschedule.activityLogs);

      const instructorEnvelope: CommandEnvelope<'change_booking_instructor'> = {
        kind: 'change_booking_instructor',
        context: accountContext('administrator', adminAccountId, 'replay-instructor', 2, {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        }),
        intent: {
          bookingId,
          instructorId: instructorTwoId,
          reasonExplanation: 'Replay instructor change',
        },
      };
      const instructorCommands = createCommands(requestIso);
      await instructorCommands.execute(instructorEnvelope);
      const occurrenceAfterInstructor = (
        await firestore.doc(`bookings/${bookingId}`).get()
      ).data()?.occurrence.occurrenceId;
      const paymentAfterInstructor = (await firestore.doc(`payments/${paymentId}`).get()).data();
      const walletAfterInstructor = (
        await firestore.doc(`users/${accountId}/wallet/state`).get()
      ).data()?.balance;
      const countsAfterInstructor = await durableCounts();

      const instructorReplay = await instructorCommands.execute(instructorEnvelope);
      expect(instructorReplay.status).toBe('success');
      expect(
        (await firestore.doc(`bookings/${bookingId}`).get()).data()?.occurrence.occurrenceId
      ).toBe(occurrenceAfterInstructor);
      expect((await firestore.doc(`payments/${paymentId}`).get()).data()).toEqual(
        paymentAfterInstructor
      );
      expect((await firestore.doc(`users/${accountId}/wallet/state`).get()).data()?.balance).toBe(
        walletAfterInstructor
      );
      const countsAfterInstructorReplay = await durableCounts();
      expect(countsAfterInstructorReplay.monetaryEvents).toBe(countsAfterInstructor.monetaryEvents);
      expect(countsAfterInstructorReplay.activityLogs).toBe(countsAfterInstructor.activityLogs);
    },
    30_000
  );

  it(
    'F-attendance. occurrence rotation does not rewrite existing attendance on the old occurrence',
    async () => {
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: initialOccurrenceId,
        participantId,
      });
      await firestore.doc(`attendance/${attendanceId}`).set(
        AttendanceSchema.parse({
          attendanceId,
          subject: {
            subjectKind: 'booking',
            bookingId,
            occurrenceId: initialOccurrenceId,
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

      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);
      await rescheduleCommands.execute(rescheduleEnvelope('attendance-preservation'));

      const attendanceAfter = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
      expect(attendanceAfter?.subject.occurrenceId).toBe(initialOccurrenceId);
      expect(
        (await firestore.doc(`bookings/${bookingId}`).get()).data()?.occurrence.occurrenceId
      ).not.toBe(initialOccurrenceId);
    },
    30_000
  );

  it(
    'G. commits reschedule through real Firestore without undefined-field write failures when optional instructor fields are absent',
    async () => {
      await firestore.doc(`instructors/${instructorId}`).set({
        id: instructorId,
        name: 'Emulator Coach',
        pricePerHour: 120,
        isAvailable: true,
      });

      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await createConfirmedBooking(commands);
      const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      const startsAt = bookingBefore?.occurrence.interval.startsAt;
      const requestAt = addMillisecondsToCanonicalTimestamp(
        startsAt,
        -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
      );
      const requestIso = new Date(canonicalTimestampToEpochMs(requestAt)).toISOString();
      const rescheduleCommands = createCommands(requestIso);

      const result = await rescheduleCommands.execute(rescheduleEnvelope('firestore-boundary'));
      expect(result.status).toBe('success');

      const bookingAfter = await firestore.doc(`bookings/${bookingId}`).get();
      expect(bookingAfter.exists).toBe(true);
      expect(bookingAfter.data()?.occurrence.occurrenceId).toBe(
        bookingOccurrenceIdFromScheduleRevision(bookingId, 2)
      );
    },
    30_000
  );
});
