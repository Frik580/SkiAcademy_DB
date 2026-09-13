import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  QueryManagedParticipantPickerReadModelsInputSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { queryManagedParticipantPickerReadModels } from './managedParticipantPickerReadModels';
import {
  ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE,
  createReadModelRequestContext,
} from './readModelRequestContext';

const accountId = AccountIdSchema.parse('account_picker_owner_01');
const otherAccountId = AccountIdSchema.parse('account_picker_other_01');
const participantId = ParticipantIdSchema.parse('participant_picker_01');
const otherParticipantId = ParticipantIdSchema.parse('participant_picker_02');
const managementId = ParticipantManagementIdSchema.parse('management_picker_01');
const otherManagementId = ParticipantManagementIdSchema.parse('management_picker_02');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_picker_fixture',
    lastChangedByCommandId: 'command_picker_fixture',
    correlationId: 'correlation_picker_fixture',
  },
};

type ManagementSeed = Readonly<{
  readonly managementId: string;
  readonly participantId: string;
  readonly status: 'active' | 'ended';
  readonly accountId?: string;
  readonly authority?: 'self' | 'parent_guardian';
  readonly malformed?: boolean;
}>;

type ParticipantSeed = Readonly<{
  readonly participantId: string;
  readonly managementId?: string;
  readonly lifecycle?: 'active' | 'archived';
  readonly displayName?: string;
  readonly authority?: 'self' | 'parent_guardian';
  readonly missing?: boolean;
}>;

function pad(index: number): string {
  return String(index).padStart(3, '0');
}

function historyId(index: number) {
  return ParticipantManagementIdSchema.parse(`management_picker_hist_${pad(index)}`);
}

function historyParticipantId(index: number) {
  return ParticipantIdSchema.parse(`participant_picker_hist_${pad(index)}`);
}

function activeManagementId(index: number) {
  return ParticipantManagementIdSchema.parse(`management_picker_active_${pad(index)}`);
}

function activeParticipantId(index: number) {
  return ParticipantIdSchema.parse(`participant_picker_active_${pad(index)}`);
}

function createPickerFirestore(input: {
  readonly accountLifecycle?: 'active' | 'disabled' | 'missing';
  readonly management?: readonly ManagementSeed[];
  readonly participants?: readonly ParticipantSeed[];
}): {
  readonly firestore: Firestore;
  readonly reads: Map<string, number>;
} {
  const docs = new Map<string, Record<string, unknown>>();
  const reads = new Map<string, number>();
  const count = (key: string) => reads.set(key, (reads.get(key) ?? 0) + 1);

  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  if (input.accountLifecycle !== 'missing') {
    seed(`users/${accountId}`, {
      accountId,
      lifecycle:
        input.accountLifecycle === 'disabled'
          ? { status: 'disabled', disabledAt: decidedAt }
          : { status: 'active' },
      ...metadata,
    });
  }
  seed(`users/${otherAccountId}`, {
    accountId: otherAccountId,
    lifecycle: { status: 'active' },
    ...metadata,
  });

  for (const row of input.management ?? []) {
    if (row.malformed) {
      seed(`participant_management/${row.managementId}`, {
        participantManagementId: row.managementId,
        status: 'active',
      });
      continue;
    }
    seed(`participant_management/${row.managementId}`, {
      participantManagementId: row.managementId,
      accountId: row.accountId ?? accountId,
      participantId: row.participantId,
      role: 'owner',
      authority: row.authority ?? 'parent_guardian',
      status: row.status,
      ...(row.status === 'ended' ? { endedAt: decidedAt } : {}),
      ...metadata,
    });
  }

  for (const row of input.participants ?? []) {
    if (row.missing) continue;
    seed(`participants/${row.participantId}`, {
      participantId: row.participantId,
      displayName: row.displayName ?? 'Managed Student',
      age: { kind: 'age_years', years: 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: row.managementId
        ? { kind: 'managed', participantManagementId: row.managementId }
        : { kind: 'unmanaged_guest' },
      lifecycle:
        row.lifecycle === 'archived'
          ? { status: 'archived', archivedAt: decidedAt }
          : { status: 'active' },
      ...metadata,
    });
  }

  type FixtureDocument = { id: string; data: Record<string, unknown> };
  const query = (
    collectionName: string,
    documents: readonly FixtureDocument[],
    maximum?: number
  ): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==') throw new Error(`Unsupported fixture operator: ${op}`);
      return query(
        collectionName,
        documents.filter(({ data }) => data[field] === value),
        maximum
      );
    },
    orderBy: (field?: string) => {
      if (field !== 'participantManagementId') {
        return query(collectionName, documents, maximum);
      }
      return query(
        collectionName,
        [...documents].sort((left, right) =>
          String(left.data.participantManagementId ?? left.id).localeCompare(
            String(right.data.participantManagementId ?? right.id)
          )
        ),
        maximum
      );
    },
    startAfter: (cursor?: { id?: string } | string) => {
      const cursorId = typeof cursor === 'string' ? cursor : cursor?.id;
      if (!cursorId) return query(collectionName, documents, maximum);
      const index = documents.findIndex(
        (doc) => doc.id === cursorId || doc.data.participantManagementId === cursorId
      );
      return query(
        collectionName,
        index >= 0 ? documents.slice(index + 1) : [],
        maximum
      );
    },
    limit: (value: number) => query(collectionName, documents, value),
    get: async () => {
      count(`query:${collectionName}`);
      const sliced = documents.slice(0, maximum);
      count(`queryDocs:${collectionName}:${sliced.length}`);
      reads.set(
        `queryDocsTotal:${collectionName}`,
        (reads.get(`queryDocsTotal:${collectionName}`) ?? 0) + sliced.length
      );
      return {
        docs: sliced.map(({ id, data }) => ({
          id,
          data: () => data,
          get: (field: string) => data[field],
        })),
      };
    },
  });

  const getDoc = async (path: string) => {
    count(`doc:${path}`);
    const data = docs.get(path);
    return {
      id: path.split('/').at(-1) ?? path,
      exists: data !== undefined,
      data: () => data,
    };
  };

  return {
    reads,
    firestore: {
      collection: (name: string) => ({
        ...query(
          name,
          [...docs.entries()]
            .filter(([path]) => path.startsWith(`${name}/`))
            .map(([path, data]) => ({ id: path.slice(name.length + 1), data }))
        ),
        doc: (id: string) => ({
          get: async () => getDoc(`${name}/${id}`),
        }),
      }),
      doc: (path: string) => ({
        get: async () => getDoc(path.startsWith('/') ? path.slice(1) : path),
      }),
      getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) =>
        Promise.all(refs.map((ref) => ref.get())),
    } as unknown as Firestore,
  };
}

function endedHistory(count: number): ManagementSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    managementId: historyId(index),
    participantId: historyParticipantId(index),
    status: 'ended' as const,
  }));
}

function activeManaged(
  count: number,
  startIndex = 0
): {
  readonly management: ManagementSeed[];
  readonly participants: ParticipantSeed[];
} {
  const management: ManagementSeed[] = [];
  const participants: ParticipantSeed[] = [];
  for (let index = 0; index < count; index += 1) {
    const managementId = activeManagementId(startIndex + index);
    const participantId = activeParticipantId(startIndex + index);
    management.push({
      managementId,
      participantId,
      status: 'active',
      authority: index === 0 ? 'self' : 'parent_guardian',
    });
    participants.push({
      participantId,
      managementId,
      displayName: `Active ${pad(startIndex + index)}`,
    });
  }
  return { management, participants };
}

function createLegacyAccountIsolationFirestore(): Firestore {
  return createPickerFirestore({
    management: [
      {
        managementId,
        participantId,
        status: 'active',
        authority: 'parent_guardian',
      },
      {
        managementId: otherManagementId,
        participantId: otherParticipantId,
        status: 'active',
        accountId: otherAccountId,
        authority: 'self',
      },
    ],
    participants: [
      {
        participantId,
        managementId,
        displayName: 'Picker Child',
      },
      {
        participantId: otherParticipantId,
        managementId: otherManagementId,
        displayName: 'Other Account Participant',
      },
    ],
  }).firestore;
}

describe('managed participant picker read models', () => {
  it('accepts callable transport idempotency keys on the read-model input seam', () => {
    const parsed = QueryManagedParticipantPickerReadModelsInputSchema.safeParse({
      idempotencyKey: 'read:managed_participant_picker',
    });
    expect(parsed.success).toBe(true);
  });

  it('returns only participants managed by the authenticated account', async () => {
    const result = await queryManagedParticipantPickerReadModels(
      createLegacyAccountIsolationFirestore(),
      accountId
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      participantId,
      participantManagementId: managementId,
      displayName: 'Picker Child',
      discipline: 'ski',
      skillLevel: 'beginner',
      age: { kind: 'age_years', years: 12 },
      authority: 'parent_guardian',
      revision: 1,
    });
  });

  it('does not enumerate another account managed participants', async () => {
    const result = await queryManagedParticipantPickerReadModels(
      createLegacyAccountIsolationFirestore(),
      otherAccountId
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.participantId).toBe(otherParticipantId);
    expect(result.items.some((item) => item.participantId === participantId)).toBe(false);
  });

  it('A. 60 ended rows plus one active participant still return that participant', async () => {
    const target = activeManaged(1);
    const { firestore, reads } = createPickerFirestore({
      management: [...endedHistory(60), ...target.management],
      participants: target.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.participantId)).toEqual([activeParticipantId(0)]);
    expect(reads.get('queryDocsTotal:participant_management')).toBe(1);
    expect(reads.get(`doc:participants/${activeParticipantId(0)}`)).toBe(1);
    for (let index = 0; index < 60; index += 1) {
      expect(reads.has(`doc:participant_management/${historyId(index)}`)).toBe(false);
      expect(reads.has(`doc:participants/${historyParticipantId(index)}`)).toBe(false);
    }
  });

  it('B. 60 ended rows and no active rows return an empty picker', async () => {
    const { firestore, reads } = createPickerFirestore({
      management: endedHistory(60),
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toEqual([]);
    expect(reads.get('queryDocsTotal:participant_management') ?? 0).toBe(0);
  });

  it('C. 52 active rows are complete, unique, and paged', async () => {
    const activeCount = ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE + 2;
    const active = activeManaged(activeCount);
    const { firestore, reads } = createPickerFirestore({
      management: [...endedHistory(20), ...active.management],
      participants: active.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toHaveLength(activeCount);
    expect(new Set(result.items.map((item) => item.participantId)).size).toBe(activeCount);
    expect(reads.get('query:participant_management')).toBe(2);
    expect(reads.get('queryDocsTotal:participant_management')).toBe(activeCount);
  });

  it('D. exactly 50 active rows has no special boundary behavior', async () => {
    const active = activeManaged(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
    const { firestore, reads } = createPickerFirestore({
      management: active.management,
      participants: active.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toHaveLength(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
    expect(reads.get('query:participant_management')).toBe(2);
  });

  it('E. 51 active rows uses a second page for the final row', async () => {
    const activeCount = ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE + 1;
    const active = activeManaged(activeCount);
    const { firestore, reads } = createPickerFirestore({
      management: active.management,
      participants: active.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toHaveLength(activeCount);
    expect(result.items.map((item) => item.participantId).sort()).toEqual(
      Array.from({ length: activeCount }, (_, index) => activeParticipantId(index)).sort()
    );
    expect(reads.get('query:participant_management')).toBe(2);
    expect(reads.get('queryDocsTotal:participant_management')).toBe(activeCount);
  });

  it('F. missing participant documents are skipped without failing the request', async () => {
    const ok = activeManaged(1);
    const missingParticipant = ParticipantIdSchema.parse('participant_picker_missing');
    const missingManagement = ParticipantManagementIdSchema.parse('management_picker_missing');
    const { firestore } = createPickerFirestore({
      management: [
        ...ok.management,
        { managementId: missingManagement, participantId: missingParticipant, status: 'active' },
      ],
      participants: [...ok.participants, { participantId: missingParticipant, missing: true }],
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.participantId)).toEqual([activeParticipantId(0)]);
  });

  it('G. inactive participant behind active management is not exposed', async () => {
    const archivedId = ParticipantIdSchema.parse('participant_picker_archived');
    const archivedManagement = ParticipantManagementIdSchema.parse('management_picker_archived');
    const ok = activeManaged(1);
    const { firestore } = createPickerFirestore({
      management: [
        ...ok.management,
        { managementId: archivedManagement, participantId: archivedId, status: 'active' },
      ],
      participants: [
        ...ok.participants,
        { participantId: archivedId, managementId: archivedManagement, lifecycle: 'archived' },
      ],
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.participantId)).toEqual([activeParticipantId(0)]);
  });

  it('H. management pointer mismatch is not authorized', async () => {
    const staleParticipant = ParticipantIdSchema.parse('participant_picker_stale');
    const staleManagement = ParticipantManagementIdSchema.parse('management_picker_stale');
    const otherPointer = ParticipantManagementIdSchema.parse('management_picker_other_pointer');
    const ok = activeManaged(1);
    const { firestore } = createPickerFirestore({
      management: [
        ...ok.management,
        { managementId: staleManagement, participantId: staleParticipant, status: 'active' },
      ],
      participants: [
        ...ok.participants,
        { participantId: staleParticipant, managementId: otherPointer },
      ],
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.participantId)).toEqual([activeParticipantId(0)]);
  });

  it('I. a single active participant returns the sole auto-select item', async () => {
    const { firestore } = createPickerFirestore({
      management: [
        {
          managementId,
          participantId,
          status: 'active',
          authority: 'self',
        },
      ],
      participants: [
        {
          participantId,
          managementId,
          displayName: 'Sole Client',
        },
      ],
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      participantId,
      participantManagementId: managementId,
      displayName: 'Sole Client',
      discipline: 'ski',
      skillLevel: 'beginner',
      age: { kind: 'age_years', years: 12 },
      authority: 'self',
      revision: 1,
    });
  });

  it('J. multi-participant picker returns the complete unique set', async () => {
    const active = activeManaged(3);
    const { firestore } = createPickerFirestore({
      management: active.management,
      participants: active.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map((item) => item.participantId)).size).toBe(3);
    expect(result.items.map((item) => item.participantId).sort()).toEqual(
      [activeParticipantId(0), activeParticipantId(1), activeParticipantId(2)].sort()
    );
    expect(result.items.some((item) => item.authority === 'self')).toBe(true);
    expect(result.items.some((item) => item.authority === 'parent_guardian')).toBe(true);
  });

  it('K. public picker order remains displayName localeCompare, not management pagination order', async () => {
    const charlie = ParticipantIdSchema.parse('participant_picker_order_c');
    const alice = ParticipantIdSchema.parse('participant_picker_order_a');
    const bob = ParticipantIdSchema.parse('participant_picker_order_b');
    const charlieManagement = ParticipantManagementIdSchema.parse('management_picker_order_01');
    const aliceManagement = ParticipantManagementIdSchema.parse('management_picker_order_02');
    const bobManagement = ParticipantManagementIdSchema.parse('management_picker_order_03');
    const { firestore } = createPickerFirestore({
      management: [
        { managementId: charlieManagement, participantId: charlie, status: 'active' },
        { managementId: aliceManagement, participantId: alice, status: 'active' },
        { managementId: bobManagement, participantId: bob, status: 'active' },
      ],
      participants: [
        { participantId: charlie, managementId: charlieManagement, displayName: 'Charlie' },
        { participantId: alice, managementId: aliceManagement, displayName: 'Alice' },
        { participantId: bob, managementId: bobManagement, displayName: 'Bob' },
      ],
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.displayName)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('L. malformed management rows are skipped and a stuck cursor cannot loop forever', async () => {
    const ok = activeManaged(1);
    const malformedId = ParticipantManagementIdSchema.parse('management_picker_malformed');
    const { firestore } = createPickerFirestore({
      management: [
        ...ok.management,
        {
          managementId: malformedId,
          participantId: ParticipantIdSchema.parse('participant_picker_malformed'),
          status: 'active',
          malformed: true,
        },
      ],
      participants: ok.participants,
    });

    const result = await queryManagedParticipantPickerReadModels(firestore, accountId);
    expect(result.items.map((item) => item.participantId)).toEqual([activeParticipantId(0)]);

    let queries = 0;
    const stuckPage = Array.from({ length: ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE }, (_, index) => ({
      id: `management_stuck_${pad(index)}`,
      get: (field: string) =>
        field === 'participantManagementId' ? 'management_stuck_repeated' : undefined,
      data: () => ({}),
    }));
    const stuckFirestore = {
      collection: () => ({
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        startAfter() {
          return this;
        },
        limit() {
          return this;
        },
        get: async () => {
          queries += 1;
          if (queries > 8) {
            throw new Error('stuck cursor pagination did not terminate');
          }
          return { docs: stuckPage };
        },
      }),
    } as unknown as Firestore;

    const docs = await createReadModelRequestContext(stuckFirestore).allActiveManagementForAccount(
      accountId
    );
    expect(queries).toBe(2);
    expect(docs).toHaveLength(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE * 2);
  });
});
