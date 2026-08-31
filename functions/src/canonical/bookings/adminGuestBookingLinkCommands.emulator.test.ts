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
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  participantManagementIdFromGuestLink,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { bookingClaimIdentities } from './bookingClaimOperations';

const PROJECT_ID = 'ski-academy-admin-guest-booking-link-emulator';
const correlationId = CorrelationIdSchema.parse('correlation_admin_guest_booking_link_em_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_guest_booking_link_em_01');
const guestParticipantId = ParticipantIdSchema.parse('participant_admin_guest_booking_link_em_guest');
const managedParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_booking_link_em_managed'
);
const bookingId = BookingIdSchema.parse('booking_admin_guest_booking_link_em_01');
const adminAccountId = AccountIdSchema.parse('account_admin_guest_booking_link_em_admin');
const targetAccountId = AccountIdSchema.parse('account_admin_guest_booking_link_em_target');
const managementId = participantManagementIdFromGuestLink({
  participantId: managedParticipantId,
  accountId: targetAccountId,
});
const tokenSecret = 'admin-guest-booking-link-emulator-secret';
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

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
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

function createCommands(at = '2026-01-01T10:00:00.000Z') {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret: tokenSecret }
  );
}

async function clearCollections() {
  for (const collection of COLLECTIONS_TO_CLEAR) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedFixture() {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Admin Link Emulator Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.collection('participants').doc(guestParticipantId).set({
    participantId: guestParticipantId,
    displayName: 'Guest Emulator Source',
    age: { kind: 'age_years', years: 24 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_guest',
      lastChangedByCommandId: 'command_seed_guest',
      correlationId,
    },
  });
  await firestore.collection('participants').doc(managedParticipantId).set({
    participantId: managedParticipantId,
    displayName: 'Managed Emulator Target',
    age: { kind: 'age_years', years: 28 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_managed',
      lastChangedByCommandId: 'command_seed_managed',
      correlationId,
    },
  });
  await firestore.collection('participant_management').doc(managementId).set({
    participantManagementId: managementId,
    participantId: managedParticipantId,
    accountId: targetAccountId,
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
  for (const accountId of [adminAccountId, targetAccountId]) {
    await firestore.collection('users').doc(accountId).set(
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
  }
}

function guestCreateEnvelope(): CommandEnvelope<'create_guest_booking_request'> {
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectIdFromBookingId(bookingId)),
      exercisedCapability: 'guest',
      idempotencyKey: 'admin-guest-booking-em-create',
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: 'Guest Emulator Source',
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 24,
      }),
    },
    intent: {
      bookingId,
      instructorId,
      participantIds: [guestParticipantId],
    },
  };
}

function adminLinkEnvelope(
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'link_guest_booking_to_account_as_administrator'> {
  return {
    kind: 'link_guest_booking_to_account_as_administrator',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      bookingId,
      targetAccountId,
      targetParticipantId: managedParticipantId,
      reasonExplanation: 'Emulator existing managed identity',
    },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'link_guest_booking_to_account_as_administrator (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST =
        process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    }, 30_000);

    afterAll(async () => {
      if (app) {
        await deleteApp(app);
      }
    });

    beforeEach(async () => {
      await clearCollections();
      await seedFixture();
    }, 30_000);

    it(
      'replaces the guest occurrence, migrates claims, and leaves Payment and the guest Participant untouched',
      async () => {
        const commands = createCommands();
        expect((await commands.execute(guestCreateEnvelope())).status).toBe('success');
        const bookingBefore = (await firestore.doc(`bookings/${bookingId}`).get()).data();
        const paymentBefore = (
          await firestore.doc(`payments/${paymentIdFromBookingId(bookingId)}`).get()
        ).data();
        const occurrenceId = bookingBefore?.occurrence.occurrenceId as string;
        const guestClaimId = bookingClaimIdentities({
          bookingId,
          occurrenceId,
          instructorId,
          participantId: guestParticipantId,
        }).participantClaimId;
        const targetClaimId = bookingClaimIdentities({
          bookingId,
          occurrenceId,
          instructorId,
          participantId: managedParticipantId,
        }).participantClaimId;

        const envelope = adminLinkEnvelope('admin-guest-booking-em-link');
        expect((await commands.execute(envelope)).status).toBe('success');
        expect((await commands.execute(envelope)).status).toBe('success');

        const booking = (await firestore.doc(`bookings/${bookingId}`).get()).data();
        expect(booking?.party.participantIds).toEqual([managedParticipantId]);
        expect(booking?.attribution).toEqual(bookingBefore?.attribution);
        expect(booking?.lifecycle.status).toBe(bookingBefore?.lifecycle.status);
        expect(
          (await firestore.doc(`participants/${guestParticipantId}`).get()).data()?.management
        ).toEqual({ kind: 'unmanaged_guest' });
        expect(
          (await firestore.doc(`payments/${paymentIdFromBookingId(bookingId)}`).get()).data()
        ).toMatchObject({
          price: paymentBefore?.price,
          paidAmount: paymentBefore?.paidAmount,
          paymentStatus: paymentBefore?.paymentStatus,
        });
        expect(
          (await firestore.doc(`resource_claims/${guestClaimId}`).get()).data()?.lifecycle.status
        ).toBe('released');
        expect(
          (await firestore.doc(`resource_claims/${targetClaimId}`).get()).data()?.lifecycle.status
        ).toBe('active');
        expect((await firestore.collection('bookings').get()).size).toBe(1);
      },
      30_000
    );

    it(
      'serializes concurrent Admin link attempts to one effect',
      async () => {
        const commands = createCommands();
        expect((await commands.execute(guestCreateEnvelope())).status).toBe('success');
        const [first, second] = await Promise.all([
          commands.execute(adminLinkEnvelope('admin-guest-booking-em-race-a')),
          commands.execute(adminLinkEnvelope('admin-guest-booking-em-race-b')),
        ]);
        const successes = [first, second].filter((result) => result.status === 'success');
        expect(successes.length).toBe(1);
        expect((await firestore.doc(`bookings/${bookingId}`).get()).data()?.party.participantIds).toEqual(
          [managedParticipantId]
        );
      },
      30_000
    );

    it(
      'denies a non-administrator actor against the live Booking',
      async () => {
        const commands = createCommands();
        expect((await commands.execute(guestCreateEnvelope())).status).toBe('success');
        const result = await commands.execute({
          ...adminLinkEnvelope('admin-guest-booking-em-owner'),
          context: {
            actor: accountCommandActor(targetAccountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'admin-guest-booking-em-owner',
            correlationId,
            source: 'client_callable',
            expectedRevision: AggregateRevisionSchema.parse(1),
          },
        });
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('forbidden');
        }
      },
      30_000
    );
  }
);
