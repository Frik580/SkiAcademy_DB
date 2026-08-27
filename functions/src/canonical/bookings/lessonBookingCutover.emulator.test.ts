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
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  buildPaymentPresentation,
  queryLessonBookingReadModels,
} from '../readModels/lessonBookingReadModels';
import { parseBooking } from '../bookings/bookingStore';
import { parsePayment } from '../finance/financeStore';

const PROJECT_ID = 'ski-academy-lesson-cutover-emulator';
const correlationId = CorrelationIdSchema.parse('correlation_lesson_cutover_01');
const payerAccountId = AccountIdSchema.parse('account_lesson_cutover_payer');
const managerAccountId = AccountIdSchema.parse('account_lesson_cutover_manager');
const participantId = ParticipantIdSchema.parse('participant_lesson_cutover_01');
const payerManagementId = ParticipantManagementIdSchema.parse('management_lesson_cutover_payer');
const managerManagementId = ParticipantManagementIdSchema.parse('management_lesson_cutover_manager');
const instructorId = InstructorIdSchema.parse('instructor_lesson_cutover_01');
const bookingId = BookingIdSchema.parse('booking_lesson_cutover_auth_01');
const guestBookingId = BookingIdSchema.parse('booking_lesson_cutover_guest_01');
const guestParticipantId = ParticipantIdSchema.parse('participant_lesson_cutover_guest');
const guestTokenSecret = 'lesson-cutover-guest-secret-01';
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const hotReadNow = new Date('2026-01-15T04:30:00.000Z');

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
] as const;

let app: App;
let firestore: Firestore;

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

function createCommands(at: string, guestSecret = guestTokenSecret) {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    executor,
    { guestActionTokenSecret: guestSecret }
  );
}

async function seedInstructor(): Promise<void> {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Lesson Cutover Instructor',
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
}

async function seedManagedParticipantFixture(): Promise<void> {
  await firestore.doc(`users/${payerAccountId}`).set(
    AccountSchema.parse({
      accountId: payerAccountId,
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
  await firestore.doc(`users/${managerAccountId}`).set(
    AccountSchema.parse({
      accountId: managerAccountId,
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
  await firestore.doc(`users/${payerAccountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId: payerAccountId,
      currency: 'KZT',
      balance: WALLET_START_KZT,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  await firestore.collection('participants').doc(participantId).set({
    participantId,
    displayName: 'Lesson Cutover Student',
    age: { kind: 'age_years', years: 12 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: payerManagementId },
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
  await firestore.collection('participant_management').doc(payerManagementId).set({
    participantManagementId: payerManagementId,
    participantId,
    accountId: payerAccountId,
    role: 'owner',
    authority: 'parent_guardian',
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
  await firestore.collection('participant_management').doc(managerManagementId).set({
    participantManagementId: managerManagementId,
    participantId,
    accountId: managerAccountId,
    role: 'manager',
    authority: 'parent_guardian',
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
  await seedInstructor();
}

function authenticatedCreateEnvelope(
  targetBookingId: typeof bookingId,
  idempotencyKey: string,
  capability: 'account_owner' | 'parent_guardian' = 'parent_guardian',
  actorAccountId: typeof payerAccountId = payerAccountId
): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(actorAccountId),
      exercisedCapability: capability,
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
      bookingId: targetBookingId,
      instructorId,
      participantIds: [participantId],
    },
  };
}

function guestCreateEnvelope(
  targetBookingId: typeof guestBookingId,
  idempotencyKey: string
): CommandEnvelope<'create_guest_booking_request'> {
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectIdFromBookingId(targetBookingId)),
      exercisedCapability: 'guest',
      idempotencyKey,
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '10:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: 'Guest Cutover Participant',
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 20,
      }),
    },
    intent: {
      bookingId: targetBookingId,
      instructorId,
      participantIds: [guestParticipantId],
    },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)('lesson booking cutover boundary (firestore emulator)', () => {
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
  }, 30_000);

  it(
    'authenticated create_confirmed_booking is readable through account_hot with canonical revision',
    async () => {
      await seedManagedParticipantFixture();
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      const createResult = await commands.execute(
        authenticatedCreateEnvelope(bookingId, 'cutover-auth-create-01')
      );
      expect(createResult.status).toBe('success');

      const bookingDoc = await firestore.collection('bookings').doc(bookingId).get();
      const bookingRevision = AggregateRevisionSchema.parse(bookingDoc.data()?.revision ?? 1);

      const hotRead = await queryLessonBookingReadModels(
        firestore,
        { scope: 'account_hot' },
        { accountId: payerAccountId, now: hotReadNow }
      );
      expect(hotRead.items.some((item) => item.bookingId === bookingId)).toBe(true);
      const readItem = hotRead.items.find((item) => item.bookingId === bookingId);
      expect(readItem?.revision).toBe(bookingRevision);
      expect(readItem?.lifecycle.status).toBe('confirmed');
    },
    30_000
  );

  it(
    'guest create provisions participant, returns credential, and authorizes guest_single reads',
    async () => {
      await seedInstructor();
      const commands = createCommands('2026-01-01T10:00:00.000Z');
      const createResult = await commands.execute(
        guestCreateEnvelope(guestBookingId, 'cutover-guest-create-01')
      );
      expect(createResult.status).toBe('success');
      const credential = createResult.payload?.guestActionCredential;
      expect(credential).toBeDefined();

      const participants = await firestore.collection('participants').get();
      expect(participants.size).toBe(1);
      expect(participants.docs[0]?.data().management).toEqual({ kind: 'unmanaged_guest' });

      const authorized = await queryLessonBookingReadModels(
        firestore,
        {
          scope: 'guest_single',
          bookingId: guestBookingId,
          guestActionNonce: credential!.nonce,
          guestActionSignature: credential!.signature,
        },
        { guestActionSecret: guestTokenSecret, now: new Date('2026-01-01T10:30:00.000Z') }
      );
      expect(authorized.items).toHaveLength(1);
      expect(authorized.items[0]?.bookingId).toBe(guestBookingId);

      const wrongSubject = await queryLessonBookingReadModels(
        firestore,
        {
          scope: 'guest_single',
          bookingId: BookingIdSchema.parse('booking_lesson_cutover_guest_other'),
          guestActionNonce: credential!.nonce,
          guestActionSignature: credential!.signature,
        },
        { guestActionSecret: guestTokenSecret, now: new Date('2026-01-01T10:30:00.000Z') }
      );
      expect(wrongSubject.items).toHaveLength(0);

      const expired = await queryLessonBookingReadModels(
        firestore,
        {
          scope: 'guest_single',
          bookingId: guestBookingId,
          guestActionNonce: credential!.nonce,
          guestActionSignature: credential!.signature,
        },
        { guestActionSecret: guestTokenSecret, now: new Date('2026-01-01T12:30:00.000Z') }
      );
      expect(expired.items).toHaveLength(0);
    },
    30_000
  );

  it(
    'authenticated cancellation uses expectedRevision and stale revisions are rejected',
    async () => {
      await seedManagedParticipantFixture();
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await commands.execute(authenticatedCreateEnvelope(bookingId, 'cutover-cancel-seed'));

      const bookingBefore = (await firestore.collection('bookings').doc(bookingId).get()).data();
      const currentRevision = AggregateRevisionSchema.parse(bookingBefore?.revision ?? 1);

      const stale = await commands.execute({
        kind: 'request_booking_cancellation',
        context: {
          actor: accountCommandActor(payerAccountId),
          exercisedCapability: 'parent_guardian',
          idempotencyKey: 'cutover-cancel-stale',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(currentRevision + 5),
        },
        intent: { bookingId },
      });
      expect(stale.status).toBe('error');
      expect(stale.error?.code).toBe('stale_version');

      const cancel = await commands.execute({
        kind: 'request_booking_cancellation',
        context: {
          actor: accountCommandActor(payerAccountId),
          exercisedCapability: 'parent_guardian',
          idempotencyKey: 'cutover-cancel-valid',
          correlationId,
          source: 'client_callable',
          expectedRevision: currentRevision,
        },
        intent: { bookingId },
      });
      expect(cancel.status).toBe('success');

      expect(cancel.status).toBe('success');

      const bookingAfter = (await firestore.collection('bookings').doc(bookingId).get()).data();
      expect(bookingAfter?.lifecycle?.status).toBe('cancelled');
      expect(bookingAfter?.revision).toBeGreaterThan(currentRevision);

      const historyRead = await queryLessonBookingReadModels(
        firestore,
        { scope: 'account_history' },
        { accountId: payerAccountId, now: hotReadNow }
      );
      const historyItem = historyRead.items.find((entry) => entry.bookingId === bookingId);
      expect(historyItem?.lifecycle.status).toBe('cancelled');
      expect(historyItem?.revision).toBe(bookingAfter?.revision);
    },
    30_000
  );

  it(
    'payment presentation is visible to payer and withheld for authorized non-payer manager',
    async () => {
      await seedManagedParticipantFixture();
      const commands = createCommands('2026-01-01T00:00:00.000Z');
      await commands.execute(authenticatedCreateEnvelope(bookingId, 'cutover-payment-create'));

      const payerRead = await queryLessonBookingReadModels(
        firestore,
        { scope: 'account_hot' },
        { accountId: payerAccountId, now: hotReadNow }
      );
      const payerItem = payerRead.items.find((entry) => entry.bookingId === bookingId);
      expect(payerItem?.paymentPresentation).toMatchObject({
        kind: 'visible',
        paymentStatus: 'paid',
      });

      const bookingRecord = parseBooking(
        (await firestore.collection('bookings').doc(bookingId).get()).data() as Record<
          string,
          unknown
        >
      );
      const paymentRecord = parsePayment(
        (await firestore
          .collection('payments')
          .doc(paymentIdFromBookingId(bookingId))
          .get()).data() as Record<string, unknown>
      );
      expect(bookingRecord).toBeDefined();
      expect(paymentRecord).toBeDefined();
      expect(buildPaymentPresentation(payerAccountId, bookingRecord!, paymentRecord)).toMatchObject({
        kind: 'visible',
        paymentStatus: 'paid',
      });
      expect(
        buildPaymentPresentation(managerAccountId, bookingRecord!, paymentRecord)
      ).toEqual({ kind: 'withheld' });
      expect(
        buildPaymentPresentation(managerAccountId, bookingRecord!, paymentRecord)
      ).not.toMatchObject({
        kind: 'visible',
        paymentStatus: 'paid',
      });
    },
    30_000
  );
});
