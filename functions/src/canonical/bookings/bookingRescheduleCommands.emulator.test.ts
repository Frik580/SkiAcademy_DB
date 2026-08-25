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
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  activityLogIdFromCommandId,
  bookingOccurrenceIdFromScheduleRevision,
  initialBookingOccurrenceIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  canonicalTimestampToEpochMs,
  timestampFromDate,
  accountCommandActor,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-reschedule-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_reschedule_emulator_01');
const accountId = AccountIdSchema.parse('account_reschedule_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_reschedule_emulator_admin');
const participantId = ParticipantIdSchema.parse('participant_reschedule_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_reschedule_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_reschedule_emulator_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_reschedule_emulator_02');
const bookingId = BookingIdSchema.parse('booking_reschedule_emulator_01');
const initialOccurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

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
  expectedRevision?: number,
  calendarInput = {
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
  await firestore.doc(`instructors/${instructorTwoId}`).set({
    id: instructorTwoId,
    name: 'Emulator Coach Two',
    pricePerHourKZT: 18_000,
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

describe.skipIf(!runsOnFirestoreEmulator)('booking reschedule Firestore emulator', () => {
  beforeAll(() => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    await clearCollections(COLLECTIONS_TO_CLEAR);
    await seedSharedFixture();
  });

  it(
    'serializes concurrent client self-service reschedules to one winner',
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

      const envelopeA = {
        kind: 'reschedule_booking' as const,
        context: accountContext('account_owner', accountId, 'race-a', revision, {
          localDate: '2026-01-16',
          localTime: '11:00',
          durationMinutes: 60,
        }),
        intent: { bookingId },
      };
      const envelopeB = {
        kind: 'reschedule_booking' as const,
        context: accountContext('account_owner', accountId, 'race-b', revision, {
          localDate: '2026-01-16',
          localTime: '12:00',
          durationMinutes: 60,
        }),
        intent: { bookingId },
      };

      const [resultA, resultB] = await Promise.all([
        raceCommands.execute(envelopeA),
        raceCommands.execute(envelopeB),
      ]);

      const outcomes = [resultA.status, resultB.status];
      expect(outcomes.filter((status) => status === 'success').length).toBe(1);
      expect(outcomes.filter((status) => status === 'error').length).toBe(1);

      const bookingAfter = (await firestore.doc(`bookings/${bookingId}`).get()).data();
      expect(bookingAfter?.occurrence.occurrenceId).toBe(
        bookingOccurrenceIdFromScheduleRevision(bookingId, 2)
      );
      expect(bookingAfter?.occurrence.occurrenceId).not.toBe(initialOccurrenceId);
      expect(bookingAfter?.clientSelfServiceRescheduleConsumedAt).toBeDefined();

      const claims = await firestore.collection('resource_claims').get();
      const activeClaims = claims.docs.filter((doc) => doc.data().lifecycle?.status === 'active');
      expect(activeClaims.length).toBe(2);
      expect(
        activeClaims.every((doc) => doc.data().occurrenceId === bookingAfter?.occurrence.occurrenceId)
      ).toBe(true);

      const successfulEnvelope = resultA.status === 'success' ? envelopeA : envelopeB;
      const identity = resolveCommandIdempotencyIdentity(successfulEnvelope);
      expect(
        (await firestore.doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`).get()).exists
      ).toBe(true);
    },
    30_000
  );

  it(
    'replays successful reschedule without second occurrence rotation',
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
      const envelope = {
        kind: 'reschedule_booking' as const,
        context: accountContext('account_owner', accountId, 'replay-emulator', 1),
        intent: { bookingId },
      };
      await rescheduleCommands.execute(envelope);
      const occurrenceAfterFirst = (
        await firestore.doc(`bookings/${bookingId}`).get()
      ).data()?.occurrence.occurrenceId;
      const replay = await rescheduleCommands.execute(envelope);
      expect(replay.status).toBe('success');
      const occurrenceAfterReplay = (
        await firestore.doc(`bookings/${bookingId}`).get()
      ).data()?.occurrence.occurrenceId;
      expect(occurrenceAfterReplay).toBe(occurrenceAfterFirst);
    },
    30_000
  );
});
