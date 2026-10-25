import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryManagedParticipantPickerReadModels } from './managedParticipantPickerReadModels';
import { ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE } from './readModelRequestContext';

const PROJECT_ID = 'ski-academy-picker-mgmt-topology-m2';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

const accountId = AccountIdSchema.parse('account_m2_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_m2_emulator',
    lastChangedByCommandId: 'command_m2_emulator',
    correlationId: 'correlation_m2_emulator',
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
  for (const collection of ['users', 'participants', 'participant_management'] as const) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function activeManagementQuery(database: Firestore) {
  return database
    .collection('participant_management')
    .where('accountId', '==', accountId)
    .where('status', '==', 'active')
    .orderBy('participantManagementId', 'asc')
    .limit(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
}

describeEmulator('T32.9R.M2 managed participant picker on Firestore emulator', () => {
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
  });

  afterAll(async () => {
    if (getApps().length > 0) {
      await deleteApp(app);
    }
  });

  it('does not let 60 ended rows hide the active picker participant', async () => {
    const activeManagementId = ParticipantManagementIdSchema.parse('management_m2_emulator_target');
    const activeParticipantId = ParticipantIdSchema.parse('participant_m2_emulator_target');

    const writes: Array<readonly [string, Record<string, unknown>]> = [];
    for (let index = 0; index < 60; index += 1) {
      const managementId = ParticipantManagementIdSchema.parse(
        `management_m2_emulator_hist_${pad(index)}`
      );
      writes.push([
        `participant_management/${managementId}`,
        {
          participantManagementId: managementId,
          accountId,
          participantId: ParticipantIdSchema.parse(`participant_m2_emulator_hist_${pad(index)}`),
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
    await commitInBatches(firestore, writes);

    const endedQuery = await firestore
      .collection('participant_management')
      .where('accountId', '==', accountId)
      .where('status', '==', 'ended')
      .get();
    expect(endedQuery.size).toBe(60);

    const activeQuery = await activeManagementQuery(firestore).get();
    expect(activeQuery.docs.map((doc) => doc.id)).toEqual([activeManagementId]);

    const picker = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(picker.items).toEqual([
      expect.objectContaining({
        participantId: activeParticipantId,
        participantManagementId: activeManagementId,
        displayName: 'Emulator Target',
        authority: 'self',
      }),
    ]);
  });

  it('pages more than 50 active management rows without omitting or duplicating participants', async () => {
    const activeCount = ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE + 2;
    const writes: Array<readonly [string, Record<string, unknown>]> = [];
    const expectedIds: string[] = [];
    for (let index = 0; index < activeCount; index += 1) {
      const managementId = ParticipantManagementIdSchema.parse(
        `management_m2_emulator_active_${pad(index)}`
      );
      const participantId = ParticipantIdSchema.parse(
        `participant_m2_emulator_active_${pad(index)}`
      );
      expectedIds.push(participantId);
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
          displayName: `Zebra ${pad(activeCount - index)} Active ${pad(index)}`,
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

    const firstPage = await activeManagementQuery(firestore).get();
    expect(firstPage.size).toBe(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
    const cursorId = firstPage.docs.at(-1)?.get('participantManagementId');
    expect(typeof cursorId).toBe('string');
    const secondPage = await activeManagementQuery(firestore).startAfter(cursorId).get();
    expect(secondPage.size).toBe(2);
    const pagedIds = [...firstPage.docs, ...secondPage.docs].map((doc) =>
      String(doc.get('participantId'))
    );
    expect(new Set(pagedIds).size).toBe(activeCount);
    expect(pagedIds.sort()).toEqual([...expectedIds].sort());

    const picker = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(picker.items).toHaveLength(activeCount);
    expect(new Set(picker.items.map((item) => item.participantId)).size).toBe(activeCount);
    expect(picker.items.map((item) => item.displayName)).toEqual(
      [...picker.items.map((item) => item.displayName)].sort((left, right) =>
        left.localeCompare(right)
      )
    );
  });
});
