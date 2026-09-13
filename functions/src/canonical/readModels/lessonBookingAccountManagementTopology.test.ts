import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
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
import {
  ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE,
  createReadModelRequestContext,
} from './readModelRequestContext';

const accountId = AccountIdSchema.parse('account_m1_topology_01');
const otherAccountId = AccountIdSchema.parse('account_m1_topology_02');
const instructorId = InstructorIdSchema.parse('instructor_m1_topology_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const historyNow = new Date('2026-06-01T00:00:00.000Z');
const hotNow = new Date('2026-03-01T08:00:00.000Z');
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_m1_topology',
    lastChangedByCommandId: 'command_m1_topology',
    correlationId: 'correlation_m1_topology',
  },
};

type ManagementSeed = Readonly<{
  readonly managementId: string;
  readonly participantId: string;
  readonly status: 'active' | 'ended';
  readonly accountId?: string;
  readonly authority?: 'self' | 'parent_guardian';
}>;

type ParticipantSeed = Readonly<{
  readonly participantId: string;
  readonly managementId?: string;
  readonly lifecycle?: 'active' | 'archived';
  readonly displayName?: string;
}>;

type BookingSeed = Readonly<{
  readonly bookingId: string;
  readonly participantIds: readonly string[];
  readonly lifecycleStatus?: 'confirmed' | 'completed';
  readonly startsAt?: { readonly seconds: number; readonly nanoseconds: number };
  readonly endsAt?: { readonly seconds: number; readonly nanoseconds: number };
  readonly updatedAt?: { readonly seconds: number; readonly nanoseconds: number };
  readonly partyKind?: 'individual' | 'family_group';
}>;

function pad(index: number): string {
  return String(index).padStart(3, '0');
}

function historyId(index: number) {
  return ParticipantManagementIdSchema.parse(`management_m1_hist_${pad(index)}`);
}

function historyParticipantId(index: number) {
  return ParticipantIdSchema.parse(`participant_m1_hist_${pad(index)}`);
}

function activeManagementId(index: number) {
  return ParticipantManagementIdSchema.parse(`management_m1_active_${pad(index)}`);
}

function activeParticipantId(index: number) {
  return ParticipantIdSchema.parse(`participant_m1_active_${pad(index)}`);
}

function createTopologyFirestore(input: {
  readonly accountLifecycle?: 'active' | 'disabled' | 'missing';
  readonly management?: readonly ManagementSeed[];
  readonly participants?: readonly ParticipantSeed[];
  readonly bookings?: readonly BookingSeed[];
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
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    name: 'M1 Coach',
    pricePerHourKZT: 10_000,
  });

  for (const row of input.management ?? []) {
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

  for (const booking of input.bookings ?? []) {
    const bookingId = BookingIdSchema.parse(booking.bookingId);
    const startsAt =
      booking.startsAt ?? timestampFromDate(new Date('2026-02-01T09:00:00.000Z'));
    const endsAt = booking.endsAt ?? timestampFromDate(new Date('2026-02-01T10:00:00.000Z'));
    const updatedAt = booking.updatedAt ?? endsAt;
    const lifecycleStatus = booking.lifecycleStatus ?? 'completed';
    const partyKind =
      booking.partyKind ?? (booking.participantIds.length > 1 ? 'family_group' : 'individual');
    seed(`bookings/${bookingId}`, {
      bookingId,
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId },
      },
      party: { kind: partyKind, participantIds: booking.participantIds },
      occurrence: {
        occurrenceId: OccurrenceIdSchema.parse(
          `occurrence_${booking.bookingId.replace(/^booking_/, '')}`
        ),
        instructorId,
        interval: { startsAt, endsAt },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: booking.participantIds, frozenAt: startsAt },
      },
      lifecycle:
        lifecycleStatus === 'completed'
          ? { status: 'completed', completedAt: endsAt }
          : { status: 'confirmed' },
      paymentId: paymentIdFromBookingId(bookingId),
      payerAccountId: accountId,
      revision: 1,
      createdAt: decidedAt,
      updatedAt,
      audit: metadata.audit,
    });
  }

  const getNestedField = (data: Record<string, unknown>, field: string): unknown => {
    let current: unknown = data;
    for (const part of field.split('.')) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  type FixtureDocument = { id: string; data: Record<string, unknown> };
  const query = (
    collectionName: string,
    documents: readonly FixtureDocument[],
    maximum?: number
  ): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) =>
      query(
        collectionName,
        documents.filter(({ data }) => {
          if (op === 'array-contains-any' && Array.isArray(value)) {
            const arrayField = getNestedField(data, field) as unknown[] | undefined;
            return arrayField?.some((entry) => value.includes(entry));
          }
          if (op !== '==') throw new Error(`Unsupported fixture operator: ${op}`);
          return getNestedField(data, field) === value;
        }),
        maximum
      ),
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

function activeManaged(count: number, startIndex = 0): {
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
    participants.push({ participantId, managementId, displayName: `Active ${index}` });
  }
  return { management, participants };
}

describe('T32.9R.M1 lesson-booking account management topology', () => {
  it('A. 60 ended rows plus one active target still authorize that Participant', async () => {
    const target = activeManaged(1);
    const { firestore, reads } = createTopologyFirestore({
      management: [...endedHistory(60), ...target.management],
      participants: target.participants,
      bookings: [{ bookingId: 'booking_m1_starvation_active', participantIds: [activeParticipantId(0)] }],
    });

    const readContext = createReadModelRequestContext(firestore);
    const auth = await loadLessonBookingReadAuthorizationContext(
      firestore,
      accountId,
      readContext
    );
    expect(auth.participantManagement.map((row) => row.participantId)).toEqual([
      activeParticipantId(0),
    ]);

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow, readContext }
    );
    expect(history.items.map((item) => item.bookingId)).toEqual(['booking_m1_starvation_active']);
    expect(reads.get('queryDocsTotal:participant_management')).toBe(1);
    expect(reads.get(`doc:participants/${activeParticipantId(0)}`)).toBe(1);
    for (let index = 0; index < 60; index += 1) {
      expect(reads.has(`doc:participant_management/${historyId(index)}`)).toBe(false);
    }
  });

  it('B. 60 ended rows and no active rows authorize nobody', async () => {
    const { firestore, reads } = createTopologyFirestore({
      management: endedHistory(60),
      bookings: [{ bookingId: 'booking_m1_starvation_none', participantIds: [historyParticipantId(0)] }],
    });

    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement).toEqual([]);
    expect(auth.participants).toEqual([]);

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow }
    );
    expect(history.items).toEqual([]);
    expect(reads.get('queryDocsTotal:participant_management') ?? 0).toBe(0);
  });

  it('C. multiple active rows plus many ended rows include every active Participant', async () => {
    const active = activeManaged(3);
    const { firestore } = createTopologyFirestore({
      management: [...endedHistory(40), ...active.management],
      participants: active.participants,
      bookings: [
        { bookingId: 'booking_m1_multi_a', participantIds: [activeParticipantId(0)] },
        { bookingId: 'booking_m1_multi_b', participantIds: [activeParticipantId(1)] },
        { bookingId: 'booking_m1_multi_c', participantIds: [activeParticipantId(2)] },
      ],
    });

    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement.map((row) => row.participantId).sort()).toEqual(
      [activeParticipantId(0), activeParticipantId(1), activeParticipantId(2)].sort()
    );

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 25 },
      { accountId, now: historyNow }
    );
    expect(history.items.map((item) => item.bookingId).sort()).toEqual([
      'booking_m1_multi_a',
      'booking_m1_multi_b',
      'booking_m1_multi_c',
    ]);
  });

  it('D. exactly 50 active rows has no special boundary behavior', async () => {
    const active = activeManaged(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
    const { firestore, reads } = createTopologyFirestore({
      management: active.management,
      participants: active.participants,
    });
    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement).toHaveLength(ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE);
    expect(reads.get('query:participant_management')).toBe(2);
  });

  it('E. more than 50 active rows pages to completeness', async () => {
    const activeCount = ACTIVE_ACCOUNT_MANAGEMENT_QUERY_PAGE_SIZE + 3;
    const active = activeManaged(activeCount);
    const { firestore, reads } = createTopologyFirestore({
      management: [...endedHistory(20), ...active.management],
      participants: active.participants,
      bookings: [
        {
          bookingId: 'booking_m1_page_last',
          participantIds: [activeParticipantId(activeCount - 1)],
        },
      ],
    });

    const auth = await loadLessonBookingReadAuthorizationContext(firestore, accountId);
    expect(auth.participantManagement).toHaveLength(activeCount);
    expect(auth.participants).toHaveLength(activeCount);
    expect(reads.get('query:participant_management')).toBe(2);
    expect(reads.get('queryDocsTotal:participant_management')).toBe(activeCount);

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow }
    );
    expect(history.items.map((item) => item.bookingId)).toEqual(['booking_m1_page_last']);
  });

  it('inactive, missing, and pointer-mismatch Participants do not authorize', async () => {
    const activeId = ParticipantManagementIdSchema.parse('management_m1_edge_ok');
    const staleId = ParticipantManagementIdSchema.parse('management_m1_edge_stale');
    const archivedId = ParticipantManagementIdSchema.parse('management_m1_edge_archived');
    const missingParticipantManagementId = ParticipantManagementIdSchema.parse(
      'management_m1_edge_missing_p'
    );
    const wrongAccountId = ParticipantManagementIdSchema.parse('management_m1_edge_wrong_acct');
    const okParticipant = ParticipantIdSchema.parse('participant_m1_edge_ok');
    const staleParticipant = ParticipantIdSchema.parse('participant_m1_edge_stale');
    const archivedParticipant = ParticipantIdSchema.parse('participant_m1_edge_archived');
    const missingParticipant = ParticipantIdSchema.parse('participant_m1_edge_missing');
    const wrongAccountParticipant = ParticipantIdSchema.parse('participant_m1_edge_wrong_acct');

    const { firestore } = createTopologyFirestore({
      management: [
        { managementId: activeId, participantId: okParticipant, status: 'active' },
        { managementId: staleId, participantId: staleParticipant, status: 'active' },
        { managementId: archivedId, participantId: archivedParticipant, status: 'active' },
        {
          managementId: missingParticipantManagementId,
          participantId: missingParticipant,
          status: 'active',
        },
        {
          managementId: wrongAccountId,
          participantId: wrongAccountParticipant,
          status: 'active',
          accountId: otherAccountId,
        },
      ],
      participants: [
        { participantId: okParticipant, managementId: activeId },
        {
          participantId: staleParticipant,
          managementId: ParticipantManagementIdSchema.parse('management_m1_edge_other_pointer'),
        },
        { participantId: archivedParticipant, managementId: archivedId, lifecycle: 'archived' },
      ],
      bookings: [
        { bookingId: 'booking_m1_edge_ok', participantIds: [okParticipant] },
        { bookingId: 'booking_m1_edge_stale', participantIds: [staleParticipant] },
        { bookingId: 'booking_m1_edge_archived', participantIds: [archivedParticipant] },
        { bookingId: 'booking_m1_edge_missing', participantIds: [missingParticipant] },
        { bookingId: 'booking_m1_edge_wrong_acct', participantIds: [wrongAccountParticipant] },
      ],
    });

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 25 },
      { accountId, now: historyNow }
    );
    expect(history.items.map((item) => item.bookingId)).toEqual(['booking_m1_edge_ok']);
  });

  it('missing or disabled Account cannot view managed Bookings', async () => {
    const active = activeManaged(1);
    const bookings = [
      { bookingId: 'booking_m1_edge_account', participantIds: [activeParticipantId(0)] },
    ];

    const missing = createTopologyFirestore({
      accountLifecycle: 'missing',
      management: active.management,
      participants: active.participants,
      bookings,
    });
    const disabled = createTopologyFirestore({
      accountLifecycle: 'disabled',
      management: active.management,
      participants: active.participants,
      bookings,
    });

    const missingResult = await queryLessonBookingReadModels(
      missing.firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow }
    );
    const disabledResult = await queryLessonBookingReadModels(
      disabled.firestore,
      { scope: 'account_history' },
      { accountId, now: historyNow }
    );
    expect(missingResult.items).toEqual([]);
    expect(disabledResult.items).toEqual([]);
  });

  it('family OR visibility remains; whole-party actions stay off unless every party member is managed', async () => {
    const managedA = ParticipantIdSchema.parse('participant_m1_family_a');
    const managedB = ParticipantIdSchema.parse('participant_m1_family_b');
    const unmanagedC = ParticipantIdSchema.parse('participant_m1_family_c');
    const managementA = ParticipantManagementIdSchema.parse('management_m1_family_a');
    const managementB = ParticipantManagementIdSchema.parse('management_m1_family_b');
    const hotStarts = timestampFromDate(new Date('2026-03-01T09:00:00.000Z'));
    const hotEnds = timestampFromDate(new Date('2026-03-01T10:00:00.000Z'));

    const { firestore } = createTopologyFirestore({
      management: [
        { managementId: managementA, participantId: managedA, status: 'active', authority: 'self' },
        {
          managementId: managementB,
          participantId: managedB,
          status: 'active',
          authority: 'parent_guardian',
        },
      ],
      participants: [
        { participantId: managedA, managementId: managementA, displayName: 'A' },
        { participantId: managedB, managementId: managementB, displayName: 'B' },
        { participantId: unmanagedC, displayName: 'C' },
      ],
      bookings: [
        {
          bookingId: 'booking_m1_family_partial',
          participantIds: [managedA, unmanagedC],
          lifecycleStatus: 'confirmed',
          startsAt: hotStarts,
          endsAt: hotEnds,
          updatedAt: hotStarts,
        },
        {
          bookingId: 'booking_m1_family_whole',
          participantIds: [managedA, managedB],
          lifecycleStatus: 'confirmed',
          startsAt: hotStarts,
          endsAt: hotEnds,
          updatedAt: timestampFromDate(new Date('2026-03-01T09:30:00.000Z')),
        },
      ],
    });

    const hot = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_hot', pageSize: 10 },
      { accountId, now: hotNow }
    );
    expect(hot.items.map((item) => item.bookingId).sort()).toEqual([
      'booking_m1_family_partial',
      'booking_m1_family_whole',
    ]);

    const partial = hot.items.find((item) => item.bookingId === 'booking_m1_family_partial');
    const whole = hot.items.find((item) => item.bookingId === 'booking_m1_family_whole');
    expect(partial?.authorizedActions).toEqual({
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    });
    expect(whole?.authorizedActions.canRequestCancellation).toBe(true);
    expect(whole?.clientExercisedCapability).toBe('parent_guardian');

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: hotNow }
    );
    expect(history.items).toEqual([]);
  });

  it('account_hot / account_history membership is unchanged for valid active management', async () => {
    const active = activeManaged(1);
    const hotStarts = timestampFromDate(new Date('2026-03-01T09:00:00.000Z'));
    const hotEnds = timestampFromDate(new Date('2026-03-01T10:00:00.000Z'));
    const historyStarts = timestampFromDate(new Date('2026-02-01T09:00:00.000Z'));
    const historyEnds = timestampFromDate(new Date('2026-02-01T10:00:00.000Z'));
    const { firestore } = createTopologyFirestore({
      management: active.management,
      participants: active.participants,
      bookings: [
        {
          bookingId: 'booking_m1_hot',
          participantIds: [activeParticipantId(0)],
          lifecycleStatus: 'confirmed',
          startsAt: hotStarts,
          endsAt: hotEnds,
          updatedAt: hotStarts,
        },
        {
          bookingId: 'booking_m1_history',
          participantIds: [activeParticipantId(0)],
          lifecycleStatus: 'completed',
          startsAt: historyStarts,
          endsAt: historyEnds,
          updatedAt: historyEnds,
        },
      ],
    });

    const hot = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_hot' },
      { accountId, now: hotNow }
    );
    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId, now: hotNow }
    );
    expect(hot.items.map((item) => item.bookingId)).toEqual(['booking_m1_hot']);
    expect(history.items.map((item) => item.bookingId)).toEqual(['booking_m1_history']);
  });

  it('does not re-get authorization Participants while building the returned page', async () => {
    const active = activeManaged(1);
    const { firestore, reads } = createTopologyFirestore({
      management: active.management,
      participants: active.participants,
      bookings: [
        { bookingId: 'booking_m1_reuse_a', participantIds: [activeParticipantId(0)] },
        { bookingId: 'booking_m1_reuse_b', participantIds: [activeParticipantId(0)] },
      ],
    });

    const readContext = createReadModelRequestContext(firestore);
    const result = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 10 },
      { accountId, now: historyNow, readContext }
    );
    expect(result.items).toHaveLength(2);
    expect(reads.get(`doc:participants/${activeParticipantId(0)}`)).toBe(1);
  });
});
