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
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-booking-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_booking_emulator_01');
const accountId = AccountIdSchema.parse('account_booking_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_booking_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_booking_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_booking_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

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

function bookingEnvelope(bookingId: string, idempotencyKey: string): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
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
      bookingId: BookingIdSchema.parse(bookingId),
      instructorId,
      participantIds: [participantId],
    },
  };
}

async function seedSharedFixture(): Promise<void> {
  await firestore.collection('users').doc(accountId).set(seedAccount());
  await firestore
    .collection('users')
    .doc(accountId)
    .collection('wallet')
    .doc('state')
    .set(seedWallet(500_000));
  await firestore
    .collection('participants')
    .doc(participantId)
    .set({
      participantId,
      displayName: 'Emulator Participant',
      age: { kind: 'age_years', years: 22 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
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
  await firestore
    .collection('participant_management')
    .doc(managementId)
    .set({
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
        createdByCommandId: 'command_seed_management',
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    });
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Emulator Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
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
    await clearCollections([
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
    ]);
    await seedSharedFixture();
  }, 30_000);

  it(
    'serializes overlapping instructor booking races so exactly one wins',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) };
      const commands = createProductionCanonicalCommands(environment, executor);
      const attempts = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          commands.execute(
            bookingEnvelope(`booking_booking_emulator_race_${index}`, `booking-race-${index}`)
          )
        )
      );
      const successes = attempts.filter((attempt) => attempt.status === 'success');
      const conflicts = attempts.filter(
        (attempt) => attempt.status === 'error' && attempt.error.code === 'instructor_conflict'
      );
      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(5);
    },
    30_000
  );

  it(
    'replays the same idempotency key without duplicate booking or payment writes',
    async () => {
      const executor = createFirestoreCanonicalTransactionExecutor(firestore);
      const environment = { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) };
      const commands = createProductionCanonicalCommands(environment, executor);
      const envelope = bookingEnvelope('booking_booking_emulator_replay', 'booking-replay-emulator');
      const first = await commands.execute(envelope);
      const second = await commands.execute(envelope);
      expect(first.status).toBe('success');
      expect(second.status).toBe('success');
      const bookings = await firestore.collection('bookings').get();
      const payments = await firestore.collection('payments').get();
      const monetaryEvents = await firestore.collection('monetary_events').get();
      expect(bookings.size).toBe(1);
      expect(payments.size).toBe(1);
      expect(monetaryEvents.size).toBe(1);
      expect(payments.docs[0]!.id).toBe(
        paymentIdFromBookingId(BookingIdSchema.parse('booking_booking_emulator_replay'))
      );
    },
    30_000
  );
});
