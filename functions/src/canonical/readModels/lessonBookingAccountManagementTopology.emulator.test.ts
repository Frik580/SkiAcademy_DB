import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  loadLessonBookingReadAuthorizationContext,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';
import { ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE } from './readModelRequestContext';

const PROJECT_ID = 'ski-academy-lesson-mgmt-topology-m1';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

const accountId = AccountIdSchema.parse('account_m1_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_m1_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const historyNow = new Date('2026-06-01T00:00:00.000Z');
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_m1_emulator',
    lastChangedByCommandId: 'command_m1_emulator',
    correlationId: 'correlation_m1_emulator',
  },
};

let app: App;
let firestore: Firestore;

function pad(index: number): string {
  return String(index).padStart(3, '0');
}

async function commitInBatches(
  database: Firestore,
  writes: ReadonlyArray<readonly [string, Record<string, unknown>]>
) {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = database.batch();
    for (const [path, data] of writes.slice(offset, offset + 400)) {
      batch.set(database.doc(path), data);
    }
    await batch.commit();
  }
}

async function clearCollections(database: Firestore) {
  for (const collection of [
    'users',
    'participants',
    'participant_management',
    'bookings',
    'instructors',
    'payments',
  ] as const) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

describeEmulator('T32.9R.M1 active management query on Firestore emulator', () => {
  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    await clearCollections(firestore);
    await firestore.collection('users').doc(accountId).set({
      accountId,
      lifecycle: { status: 'active' },
      ...metadata,
    });
    await firestore.collection('instructors').doc(instructorId).set({
      id: instructorId,
      name: 'M1 Emulator Coach',
      pricePerHourKZT: 10_000,
    });
  });

  afterAll(async () => {
    if (getApps().length > 0) {
      await deleteApp(app);
    }
  });

  it('does not let 60 ended rows hide the active management row', async () => {
    const activeManagementId = ParticipantManagementIdSchema.parse('management_m1_emulator_target');
    const activeParticipantId = ParticipantIdSchema.parse('participant_m1_emulator_target');
    const bookingId = BookingIdSchema.parse('booking_m1_emulator_target');
    const startsAt = timestampFromDate(new Date('2026-02-01T09:00:00.000Z'));
    const endsAt = timestampFromDate(new Date('2026-02-01T10:00:00.000Z'));

    const writes: Array<readonly [string, Record<string, unknown>]> = [];
    for (let index = 0; index < 60; index += 1) {
      const managementId = ParticipantManagementIdSchema.parse(`management_m1_emulator_hist_${pad(index)}`);
      writes.push([
        `participant_management/${managementId}`,
        {
          participantManagementId: managementId,
          accountId,
          participantId: ParticipantIdSchema.parse(`participant_m1_emulator_hist_${pad(index)}`),
          role: 'owner',
          authority: 'parent_guardian',
          status: 'ended',
          endedAt: decidedAt,
          ...metadata,
        },
      ]);
    }
    writes.push([
      `participant_management/${activeManagementId}`,
      {
        participantManagementId: activeManagementId,
        accountId,
        participantId: activeParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ]);
    writes.push([
      `participants/${activeParticipantId}`,
      {
        participantId: activeParticipantId,
        displayName: 'Emulator Target',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: activeManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ]);
    writes.push([
      `bookings/${bookingId}`,
      {
        bookingId,
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId },
        },
        party: { kind: 'individual', participantIds: [activeParticipantId] },
        occurrence: {
          occurrenceId: OccurrenceIdSchema.parse('occurrence_m1_emulator_target'),
          instructorId,
          interval: { startsAt, endsAt },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [activeParticipantId], frozenAt: startsAt },
        },
        lifecycle: { status: 'completed', completedAt: endsAt },
        paymentId: paymentIdFromBookingId(bookingId),
        payerAccountId: accountId,
        revision: 1,
        createdAt: decidedAt,
        updatedAt: endsAt,
        audit: metadata.audit,
      },
    ]);
    await commitInBatches(firestore, writes);

    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement.map((row) => row.participantId)).toEqual([
      activeParticipantId,
    ]);

    const endedQuery = await firestore
      .collection('participant_management')
      .where('accountId', '==', accountId)
      .where('status', '==', 'ended')
      .get();
    expect(endedQuery.size).toBe(60);

    const activeQuery = await firestore
      .collection('participant_management')
      .where('accountId', '==', accountId)
      .where('status', '==', 'active')
      .orderBy('participantManagementId', 'asc')
      .limit(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE)
      .get();
    expect(activeQuery.docs.map((doc) => doc.id)).toEqual([activeManagementId]);

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow }
    );
    expect(history.items.map((item) => item.bookingId)).toEqual([bookingId]);
  });

  it('pages more than 50 active management rows without omitting the last Participant', async () => {
    const activeCount = ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE + 2;
    const writes: Array<readonly [string, Record<string, unknown>]> = [];
    for (let index = 0; index < activeCount; index += 1) {
      const managementId = ParticipantManagementIdSchema.parse(
        `management_m1_emulator_active_${pad(index)}`
      );
      const participantId = ParticipantIdSchema.parse(`participant_m1_emulator_active_${pad(index)}`);
      writes.push([
        `participant_management/${managementId}`,
        {
          participantManagementId: managementId,
          accountId,
          participantId,
          role: 'owner',
          authority: 'parent_guardian',
          status: 'active',
          ...metadata,
        },
      ]);
      writes.push([
        `participants/${participantId}`,
        {
          participantId,
          displayName: `Emulator Active ${index}`,
          age: { kind: 'age_years', years: 12 },
          skillLevel: 'beginner',
          discipline: 'ski',
          management: { kind: 'managed', participantManagementId: managementId },
          lifecycle: { status: 'active' },
          ...metadata,
        },
      ]);
    }
    await commitInBatches(firestore, writes);

    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement).toHaveLength(activeCount);
    expect(auth.participants).toHaveLength(activeCount);
  });
});
