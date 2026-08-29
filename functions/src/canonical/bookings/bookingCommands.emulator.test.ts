import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
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
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-booking-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_booking_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_booking_emulator_02');
const accountId = AccountIdSchema.parse('account_booking_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_booking_emulator_01');
const participantIdB = ParticipantIdSchema.parse('participant_booking_emulator_02');
const managementId = ParticipantManagementIdSchema.parse('management_booking_emulator_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_booking_emulator_02');
const instructorId = InstructorIdSchema.parse('instructor_booking_emulator_01');
const instructorIdB = InstructorIdSchema.parse('instructor_booking_emulator_02');
const participantRaceInstructorIds = Array.from({ length: 6 }, (_, index) =>
  InstructorIdSchema.parse(`instructor_booking_emulator_part_race_${index}`)
);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const BOOKING_PRICE_KZT = 12_000;
const WALLET_ONE_BOOKING_KZT = BOOKING_PRICE_KZT;
const WALLET_TWO_BOOKINGS_KZT = BOOKING_PRICE_KZT * 2;
const INSTRUCTOR_RACE_BOOKING_IDS = Array.from({ length: 6 }, (_, index) =>
  BookingIdSchema.parse(`booking_booking_emulator_race_${index}`)
);

let app: App;
let firestore: Firestore;

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

function seedParticipantRecord(input: {
  participantId: typeof participantId;
  managementId: typeof managementId;
}) {
  return {
    participantId: input.participantId,
    displayName: `Emulator Participant ${input.participantId}`,
    age: { kind: 'age_years', years: 22 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
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
      createdByCommandId: 'command_seed_management',
      lastChangedByCommandId: 'command_seed_management',
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

function bookingEnvelope(input: {
  bookingId: string;
  idempotencyKey: string;
  participantIds: readonly [typeof participantId];
  instructorId: typeof instructorId;
  correlation?: typeof correlationId;
  localTime?: string;
}): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlation ?? correlationId,
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: input.localTime ?? '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: BookingIdSchema.parse(input.bookingId),
      instructorId: input.instructorId,
      participantIds: [...input.participantIds],
    },
  };
}

async function seedInstructor(
  id: typeof instructorId,
  tariff: Readonly<{ pricePerHourKZT?: number; pricePerHour?: number; avatarUrl?: string }>
): Promise<void> {
  await firestore
    .collection('instructors')
    .doc(id)
    .set({
      id,
      name: `Emulator Instructor ${id}`,
      isAvailable: true,
      ...tariff,
    });
}

async function seedSharedFixture(walletBalance: number): Promise<void> {
  await firestore.collection('users').doc(accountId).set(seedAccount());
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
  await seedInstructor(instructorIdB, { pricePerHourKZT: BOOKING_PRICE_KZT });
}

function createCommands() {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  const environment = { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) };
  return createProductionCanonicalCommands(environment, executor);
}

function isFirestoreEmulatorTransientRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }
  if (!reason.message.includes('Transaction is invalid or closed')) {
    return false;
  }
  const code = (reason as { code?: unknown }).code;
  return code === 3 || code === 'invalid-argument';
}

type InstructorRaceAttemptOutcome =
  | { kind: 'success' }
  | { kind: 'instructor_conflict' }
  | { kind: 'emulator_transient' }
  | { kind: 'unknown_rejection'; reason: unknown }
  | { kind: 'unexpected_command_error'; code: string };

function classifyInstructorRaceAttempt(
  outcome: PromiseSettledResult<CommandResult<'create_confirmed_booking'>>
): InstructorRaceAttemptOutcome {
  if (outcome.status === 'rejected') {
    if (isFirestoreEmulatorTransientRejection(outcome.reason)) {
      return { kind: 'emulator_transient' };
    }
    return { kind: 'unknown_rejection', reason: outcome.reason };
  }

  const result = outcome.value;
  if (result.status === 'success') {
    return { kind: 'success' };
  }
  if (result.status === 'error' && result.error.code === 'instructor_conflict') {
    return { kind: 'instructor_conflict' };
  }
  return {
    kind: 'unexpected_command_error',
    code: result.status === 'error' ? result.error.code : 'unknown',
  };
}

async function assertInstructorRaceDurableInvariants(input: {
  readonly raceBookingIds: readonly (typeof INSTRUCTOR_RACE_BOOKING_IDS)[number][];
}) {
  const state = await durableCounts();
  expect(state.bookings).toBe(1);

  const bookingsSnapshot = await firestore.collection('bookings').get();
  expect(bookingsSnapshot.docs).toHaveLength(1);
  const winningBooking = bookingsSnapshot.docs[0]!;
  const winningBookingId = BookingIdSchema.parse(winningBooking.id);
  const winningBookingData = winningBooking.data();
  expect(winningBookingData?.lifecycle).toEqual({ status: 'confirmed' });
  expect(winningBookingData?.occurrence?.instructorId).toBe(instructorId);
  expect(winningBookingData?.party?.participantIds).toEqual([participantId]);

  expect(state.payments).toBe(1);
  expect(state.monetaryEvents).toBe(1);
  expect(state.activityLogs).toBe(1);
  expect(state.successfulIdempotency).toBe(1);
  expect(state.claims).toBe(2);
  expect(state.walletBalance).toBe(WALLET_TWO_BOOKINGS_KZT - BOOKING_PRICE_KZT);
  expect(state.paymentIds).toEqual([paymentIdFromBookingId(winningBookingId)]);

  const claimsSnapshot = await firestore.collection('resource_claims').get();
  expect(claimsSnapshot.docs).toHaveLength(2);
  const claims = claimsSnapshot.docs.map((doc) => doc.data());
  expect(
    claims.every(
      (claim) => claim.ownerKind === 'booking' && claim.ownerId === winningBookingId
    )
  ).toBe(true);
  expect(claims.every((claim) => claim.lifecycle?.status === 'active')).toBe(true);

  const instructorClaim = claims.find((claim) => claim.resourceKind === 'instructor');
  const participantClaim = claims.find((claim) => claim.resourceKind === 'participant');
  expect(instructorClaim?.resourceId).toBe(instructorId);
  expect(participantClaim?.resourceId).toBe(participantId);

  const loserBookingIds = input.raceBookingIds.filter((id) => id !== winningBookingId);
  for (const loserBookingId of loserBookingIds) {
    const loserBooking = await firestore.collection('bookings').doc(loserBookingId).get();
    expect(loserBooking.exists).toBe(false);

    const loserPayment = await firestore
      .collection('payments')
      .doc(paymentIdFromBookingId(loserBookingId))
      .get();
    expect(loserPayment.exists).toBe(false);
  }

  const loserClaims = claimsSnapshot.docs.filter((doc) =>
    loserBookingIds.includes(doc.data().ownerId)
  );
  expect(loserClaims).toHaveLength(0);

  return { winningBookingId, state };
}

async function durableCounts() {
  const [bookings, payments, monetaryEvents, activityLogs, idempotency, claims, wallet] =
    await Promise.all([
      firestore.collection('bookings').get(),
      firestore.collection('payments').get(),
      firestore.collection('monetary_events').get(),
      firestore.collection('activity_logs').get(),
      firestore.collection('command_idempotency').get(),
      firestore.collection('resource_claims').get(),
      firestore
        .collection('users')
        .doc(accountId)
        .collection('wallet')
        .doc('state')
        .get(),
    ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );

  return {
    bookings: bookings.size,
    payments: payments.size,
    monetaryEvents: monetaryEvents.size,
    activityLogs: activityLogs.size,
    idempotency: idempotency.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    walletBalance: wallet.data()?.balance as number | undefined,
    bookingIds: bookings.docs.map((doc) => doc.id),
    paymentIds: payments.docs.map((doc) => doc.id),
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('booking commands (firestore emulator)', () => {
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
    await seedSharedFixture(WALLET_TWO_BOOKINGS_KZT);
  }, 30_000);

  it(
    'serializes overlapping instructor booking races so exactly one wins',
    async () => {
      const commands = createCommands();
      const envelopes = Array.from({ length: 6 }, (_, index) =>
        bookingEnvelope({
          bookingId: `booking_booking_emulator_race_${index}`,
          idempotencyKey: `booking-race-${index}`,
          participantIds: [participantId],
          instructorId,
        })
      );

      const settled = await Promise.allSettled(
        envelopes.map((envelope) => commands.execute(envelope))
      );
      const outcomes = settled.map(classifyInstructorRaceAttempt);

      for (const outcome of outcomes) {
        if (outcome.kind === 'unknown_rejection') {
          throw outcome.reason;
        }
        if (outcome.kind === 'unexpected_command_error') {
          expect.fail(`Unexpected command error: ${outcome.code}`);
        }
      }

      const successCount = outcomes.filter((outcome) => outcome.kind === 'success').length;
      const instructorConflictCount = outcomes.filter(
        (outcome) => outcome.kind === 'instructor_conflict'
      ).length;
      const emulatorTransientCount = outcomes.filter(
        (outcome) => outcome.kind === 'emulator_transient'
      ).length;

      expect(successCount + instructorConflictCount + emulatorTransientCount).toBe(6);

      const { state } = await assertInstructorRaceDurableInvariants({
        raceBookingIds: INSTRUCTOR_RACE_BOOKING_IDS,
      });

      if (process.env.BOOKING_RACE_STRESS_METRICS === '1') {
        console.log(
          JSON.stringify({
            metric: 'booking-instructor-race',
            successCount,
            instructorConflictCount,
            emulatorTransientCount,
            confirmedBookings: state.bookings,
          })
        );
      }
    },
    30_000
  );

  it(
    'serializes overlapping participant booking races so exactly one wins',
    async () => {
      for (const raceInstructorId of participantRaceInstructorIds) {
        await seedInstructor(raceInstructorId, { pricePerHourKZT: BOOKING_PRICE_KZT });
      }

      const commands = createCommands();
      const attempts = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          commands.execute(
            bookingEnvelope({
              bookingId: `booking_booking_emulator_participant_race_${index}`,
              idempotencyKey: `booking-participant-race-${index}`,
              participantIds: [participantId],
              instructorId: participantRaceInstructorIds[index]!,
            })
          )
        )
      );
      const successes = attempts.filter((attempt) => attempt.status === 'success');
      const conflicts = attempts.filter(
        (attempt) => attempt.status === 'error' && attempt.error.code === 'participant_conflict'
      );
      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(5);

      const state = await durableCounts();
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(WALLET_TWO_BOOKINGS_KZT - BOOKING_PRICE_KZT);
    },
    30_000
  );

  it(
    'prevents concurrent wallet debits from funding two separate bookings on the same wallet',
    async () => {
      const commands = createCommands();
      const envelopeA = bookingEnvelope({
        bookingId: 'booking_booking_emulator_wallet_a',
        idempotencyKey: 'booking-wallet-contention-a',
        participantIds: [participantId],
        instructorId,
        correlation: correlationId,
        localTime: '09:00',
      });
      const envelopeB = bookingEnvelope({
        bookingId: 'booking_booking_emulator_wallet_b',
        idempotencyKey: 'booking-wallet-contention-b',
        participantIds: [participantIdB],
        instructorId: instructorIdB,
        correlation: correlationIdB,
        localTime: '11:00',
      });

      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedSharedFixture(WALLET_ONE_BOOKING_KZT);
      const aloneA = await commands.execute(envelopeA);
      expect(aloneA.status).toBe('success');

      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedSharedFixture(WALLET_ONE_BOOKING_KZT);
      const aloneB = await commands.execute(envelopeB);
      expect(aloneB.status).toBe('success');

      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedSharedFixture(WALLET_ONE_BOOKING_KZT);

      const settled = await Promise.allSettled([
        commands.execute(envelopeA),
        commands.execute(envelopeB),
      ]);
      expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);

      const resultA = settled[0]?.status === 'fulfilled' ? settled[0].value : undefined;
      const resultB = settled[1]?.status === 'fulfilled' ? settled[1].value : undefined;
      const successes = [resultA, resultB].filter((result) => result?.status === 'success');
      const insufficient = [resultA, resultB].filter(
        (result) => result?.status === 'error' && result.error.code === 'insufficient_funds'
      );

      expect(successes).toHaveLength(1);
      expect(insufficient).toHaveLength(1);

      const state = await durableCounts();
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.activityLogs).toBe(1);
      expect(state.successfulIdempotency).toBe(1);
      expect(state.claims).toBe(2);
      expect(state.walletBalance).toBe(0);

      const winnerBookingId = state.bookingIds[0]!;
      const loserBookingId =
        winnerBookingId === envelopeA.intent.bookingId
          ? envelopeB.intent.bookingId
          : envelopeA.intent.bookingId;
      expect(state.paymentIds).toEqual([paymentIdFromBookingId(winnerBookingId)]);
      expect(state.paymentIds).not.toContain(paymentIdFromBookingId(loserBookingId));
    },
    30_000
  );

  it(
    'commits booking creation through real Firestore without undefined-field write failures',
    async () => {
      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await firestore.collection('users').doc(accountId).set(seedAccount());
      await firestore
        .collection('users')
        .doc(accountId)
        .collection('wallet')
        .doc('state')
        .set(seedWallet(WALLET_ONE_BOOKING_KZT));
      await firestore.collection('participants').doc(participantId).set(
        seedParticipantRecord({ participantId, managementId })
      );
      await firestore.collection('participant_management').doc(managementId).set(
        seedManagementRecord({ managementId, participantId })
      );
      await seedInstructor(instructorId, { pricePerHour: 120 });

      const commands = createCommands();
      const result = await commands.execute(
        bookingEnvelope({
          bookingId: 'booking_booking_emulator_firestore_boundary',
          idempotencyKey: 'booking-firestore-boundary',
          participantIds: [participantId],
          instructorId,
        })
      );
      expect(result.status).toBe('success');

      const bookingDoc = await firestore
        .collection('bookings')
        .doc('booking_booking_emulator_firestore_boundary')
        .get();
      expect(bookingDoc.exists).toBe(true);
      expect(bookingDoc.data()?.lifecycle).toEqual({ status: 'confirmed' });
    },
    30_000
  );

  it(
    'replays the same idempotency key without duplicate booking or payment writes',
    async () => {
      const commands = createCommands();
      const envelope = bookingEnvelope({
        bookingId: 'booking_booking_emulator_replay',
        idempotencyKey: 'booking-replay-emulator',
        participantIds: [participantId],
        instructorId,
      });
      const first = await commands.execute(envelope);
      const second = await commands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');
      const state = await durableCounts();
      expect(state.bookings).toBe(1);
      expect(state.payments).toBe(1);
      expect(state.monetaryEvents).toBe(1);
      expect(state.paymentIds[0]).toBe(
        paymentIdFromBookingId(BookingIdSchema.parse('booking_booking_emulator_replay'))
      );
    },
    30_000
  );
});
