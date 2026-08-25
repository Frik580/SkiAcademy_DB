import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AggregateRevisionSchema,
  AccountIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  accountCommandActor,
  guestCommandActor,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

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
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
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

async function seedFixture(): Promise<void> {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Guest Emulator Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.collection('participants').doc(participantId).set({
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
  await firestore.collection('users').doc(adminAccountId).set({
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

  it(
    'serializes overlapping guest instructor requests so exactly one wins',
    async () => {
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
    },
    30_000
  );

  it(
    'serializes confirm vs expiry race to one terminal pending outcome',
    async () => {
      const createCommandsAt = createCommands('2026-01-01T10:00:00.000Z');
      await createCommandsAt.execute(
        guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-race-seed-01' })
      );

      const confirmCommands = createCommands('2026-01-01T10:59:00.000Z');
      const expireCommands = createCommands('2026-01-01T11:01:00.000Z');
      const [confirmResult, expireResult] = await Promise.all([
        confirmCommands.execute({
          kind: 'confirm_guest_booking',
          context: {
            actor: accountCommandActor(adminAccountId),
            exercisedCapability: 'administrator',
            idempotencyKey: 'guest-confirm-race-01',
            correlationId,
            source: 'admin_callable',
            expectedRevision: AggregateRevisionSchema.parse(1),
          },
          intent: { bookingId },
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

      const successes = [confirmResult, expireResult].filter((result) => result.status === 'success');
      expect(successes.length).toBe(1);

      const booking = (await firestore.collection('bookings').doc(bookingId).get()).data();
      if (booking?.lifecycle?.status === 'confirmed') {
        expect(expireResult.status).toBe('error');
      } else {
        expect(booking?.lifecycle).toMatchObject({
          status: 'cancelled',
          reasonCode: 'reservation_expired',
        });
        expect(confirmResult.status).toBe('error');
      }

      const activityLogs = await firestore.collection('activity_logs').get();
      expect(activityLogs.size).toBeLessThanOrEqual(2);
    },
    30_000
  );

  it(
    'persists guest booking without invalid undefined optional Firestore fields',
    async () => {
      const commands = createCommands('2026-01-01T10:00:00.000Z');
      const result = await commands.execute(
        guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-serialize-01' })
      );
      expect(result.status).toBe('success');

      const booking = (await firestore.collection('bookings').doc(bookingId).get()).data();
      const payment = (await firestore.collection('payments').doc(paymentId).get()).data();
      expect(booking?.payerAccountId).toBeUndefined();
      expect(payment?.payerAccountId).toBeUndefined();
      expect(
        (await firestore.collection('users').doc(guestSubjectId).get()).exists
      ).toBe(false);
    },
    30_000
  );

  it(
    'replays admin confirmation without duplicate audit records',
    async () => {
      const createCommandsAt = createCommands('2026-01-01T10:00:00.000Z');
      const createResult = await createCommandsAt.execute(
        guestCreateEnvelope({ bookingId, idempotencyKey: 'guest-confirm-replay-seed' })
      );
      expect(createResult.status).toBe('success');

      const confirmEnvelope: CommandEnvelope<'confirm_guest_booking'> = {
        kind: 'confirm_guest_booking',
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'guest-confirm-replay-01',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: { bookingId },
      };
      const confirmCommands = createCommands('2026-01-01T10:30:00.000Z');
      const firstConfirm = await confirmCommands.execute(confirmEnvelope);
      const replayConfirm = await confirmCommands.execute(confirmEnvelope);
      expect(firstConfirm.status).toBe('success');
      expect(replayConfirm.status).toBe('success');

      const activityLogs = await firestore.collection('activity_logs').get();
      expect(activityLogs.size).toBe(2);

      const kinds = activityLogs.docs
        .map((doc) => doc.data().command?.kind)
        .sort();
      expect(kinds).toEqual(['confirm_guest_booking', 'create_guest_booking_request']);
    },
    30_000
  );
});
