import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QuerySnapshot } from 'firebase-admin/firestore';
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
  paymentIdFromBookingId,
  timestampFromDate,
  accountCommandActor,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-party-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_party_emulator_01');
const accountId = AccountIdSchema.parse('account_party_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_party_emulator_01');
const participantTwoId = ParticipantIdSchema.parse('participant_party_emulator_02');
const participantThreeId = ParticipantIdSchema.parse('participant_party_emulator_03');
const managementId = ParticipantManagementIdSchema.parse('management_party_emulator_01');
const managementTwoId = ParticipantManagementIdSchema.parse('management_party_emulator_02');
const managementThreeId = ParticipantManagementIdSchema.parse('management_party_emulator_03');
const instructorId = InstructorIdSchema.parse('instructor_party_emulator_01');
const bookingId = BookingIdSchema.parse('booking_party_emulator_01');
const paymentId = paymentIdFromBookingId(bookingId);
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

function environment(at = '2026-01-10T09:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-10T09:00:00.000Z') {
  return createProductionCanonicalCommands(
    environment(at),
    createFirestoreCanonicalTransactionExecutor(firestore)
  );
}

async function clearCollection(collectionName: string): Promise<void> {
  const snapshot: QuerySnapshot = await firestore.collection(collectionName).get();
  if (snapshot.empty) return;
  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function clearAll(): Promise<void> {
  for (const collection of COLLECTIONS_TO_CLEAR) {
    await clearCollection(collection);
  }
}

async function seedBase(): Promise<void> {
  await firestore.doc(`users/${accountId}`).set(
    AccountSchema.parse({
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
    })
  );
  await firestore.doc(`participants/${participantId}`).set({
    participantId,
    displayName: 'Emulator Participant One',
    age: { kind: 'age_years', years: 20 },
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
  await firestore.doc(`participants/${participantTwoId}`).set({
    participantId: participantTwoId,
    displayName: 'Emulator Participant Two',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementTwoId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant_two',
      lastChangedByCommandId: 'command_seed_participant_two',
      correlationId,
    },
  });
  await firestore.doc(`participants/${participantThreeId}`).set({
    participantId: participantThreeId,
    displayName: 'Emulator Participant Three',
    age: { kind: 'age_years', years: 16 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementThreeId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant_three',
      lastChangedByCommandId: 'command_seed_participant_three',
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
      createdByCommandId: 'command_seed_management',
      lastChangedByCommandId: 'command_seed_management',
      correlationId,
    },
  });
  await firestore.doc(`participant_management/${managementTwoId}`).set({
    participantManagementId: managementTwoId,
    participantId: participantTwoId,
    accountId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_management_two',
      lastChangedByCommandId: 'command_seed_management_two',
      correlationId,
    },
  });
  await firestore.doc(`participant_management/${managementThreeId}`).set({
    participantManagementId: managementThreeId,
    participantId: participantThreeId,
    accountId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_management_three',
      lastChangedByCommandId: 'command_seed_management_three',
      correlationId,
    },
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Emulator Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
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
}

async function createConfirmedBooking(): Promise<void> {
  const commands = createCommands('2026-01-01T00:00:00.000Z');
  const result = await commands.execute({
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: 'create-party-emulator',
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
}

describe.skipIf(!runsOnFirestoreEmulator)('booking party commands emulator', () => {
  beforeAll(() => {
    if (!runsOnFirestoreEmulator) return;
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
    await clearAll();
    await seedBase();
  });

  it('serializes concurrent party mutations from the same booking revision', async () => {
    await createConfirmedBooking();
    const commands = createCommands();
    const [addTwoResult, addThreeResult] = await Promise.allSettled([
      commands.execute({
        kind: 'change_booking_party',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'party-emulator-add-two',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId, participantIdsToAdd: [participantTwoId] },
      }),
      commands.execute({
        kind: 'change_booking_party',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'party-emulator-add-three',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
          calendarInput: {
            localDate: '2026-01-15',
            localTime: '09:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId, participantIdsToAdd: [participantThreeId] },
      }),
    ]);

    const outcomes = [addTwoResult, addThreeResult].map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);

    const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
    const party = booking?.party.participantIds ?? [];
    expect(party.length).toBe(2);
    expect(party).toContain(participantId);
    expect([participantTwoId, participantThreeId].filter((id) => party.includes(id)).length).toBe(1);
    const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
    expect(payment?.price).toBe(18_000);
  }, 30_000);
});
