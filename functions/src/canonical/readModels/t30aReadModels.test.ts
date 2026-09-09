import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import {
  queryBookingChangeRequestReadModels,
  BookingChangeRequestAdminReadForbiddenError,
} from './bookingChangeRequestReadModels';
import { queryBookingProposalReadModels } from './bookingProposalReadModels';
import { queryParticipantInstructorAccessReadModels } from './participantInstructorAccessReadModels';
import { parseBooking } from '../bookings/bookingStore';
import {
  buildInstructorLessonBookingReadModel,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';

const accountId = AccountIdSchema.parse('account_t30a_read_01');
const otherAccountId = AccountIdSchema.parse('account_t30a_read_02');
const instructorAccountId = AccountIdSchema.parse('account_t30a_instructor_01');
const participantId = ParticipantIdSchema.parse('participant_t30a_read_01');
const otherParticipantId = ParticipantIdSchema.parse('participant_t30a_read_02');
const managementId = ParticipantManagementIdSchema.parse('management_t30a_read_01');
const instructorId = InstructorIdSchema.parse('instructor_t30a_read_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_t30a_read_02');
const bookingId = BookingIdSchema.parse('booking_t30a_read_01');
const familyParticipantId = ParticipantIdSchema.parse('participant_t30a_family_01');
const familyManagementId = ParticipantManagementIdSchema.parse('management_t30a_family_01');
const f3InstructorId = InstructorIdSchema.parse('instructor_t30a_f3_01');
const f3SingleBookingId = BookingIdSchema.parse('booking_t30a_f3_single_01');
const f3MultiBookingId = BookingIdSchema.parse('booking_t30a_f3_multi_01');
const proposalId = BookingProposalIdSchema.parse('booking_proposal_t30a_01');
const otherProposalId = BookingProposalIdSchema.parse('booking_proposal_t30a_02');
const changeRequestId = BookingChangeRequestIdSchema.parse('booking_change_request_t30a_01');
const familyChangeRequestId = BookingChangeRequestIdSchema.parse(
  'booking_change_request_t30a_family_01'
);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const serviceStart = timestampFromDate(new Date('2026-06-15T09:00:00.000Z'));
const serviceEnd = timestampFromDate(new Date('2026-06-15T10:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_t30a_fixture',
    lastChangedByCommandId: 'command_t30a_fixture',
    correlationId: 'correlation_t30a_fixture',
  },
};

function createT30aFirestore(): Firestore {
  const docs = new Map<string, Record<string, unknown>>();

  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  seed(`users/${accountId}`, { accountId, lifecycle: { status: 'active' }, ...metadata });
  seed(`users/${otherAccountId}`, {
    accountId: otherAccountId,
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`users/${instructorAccountId}`, {
    accountId: instructorAccountId,
    lifecycle: { status: 'active' },
    instructorId,
    isInstructor: true,
    ...metadata,
  });
  seed(`participant_management/${managementId}`, {
    participantManagementId: managementId,
    accountId,
    participantId,
    role: 'owner',
    authority: 'parent_guardian',
    status: 'active',
    ...metadata,
  });
  seed(`participants/${participantId}`, {
    participantId,
    displayName: 'T30A Student',
    age: { kind: 'age_years', years: 12 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`participants/${otherParticipantId}`, {
    participantId: otherParticipantId,
    displayName: 'Other Student',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'advanced',
    discipline: 'snowboard',
    management: { kind: 'managed', participantManagementId: 'management_other' },
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    name: 'T30A Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });
  seed(`instructors/${otherInstructorId}`, {
    id: otherInstructorId,
    name: 'Other Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });
  seed(`bookings/${bookingId}`, {
    bookingId,
    attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_t30a_read_01'),
      instructorId,
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: accountId,
    ...metadata,
  });
  seed(`payments/${paymentIdFromBookingId(bookingId)}`, {
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: accountId,
    paymentStatus: 'paid',
    ...metadata,
  });
  seed(`participant_management/${familyManagementId}`, {
    participantManagementId: familyManagementId,
    accountId,
    participantId: familyParticipantId,
    role: 'owner',
    authority: 'parent_guardian',
    status: 'active',
    ...metadata,
  });
  seed(`participants/${familyParticipantId}`, {
    participantId: familyParticipantId,
    displayName: 'T30A Family Student',
    age: { kind: 'age_years', years: 10 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: familyManagementId },
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`instructors/${f3InstructorId}`, {
    id: f3InstructorId,
    name: 'T30A F3 Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  const f3SnapshotBase = {
    strategyVersion: 'lesson_party:v1' as const,
    baseLessonPriceKzt: 12_000,
    additionalParticipantSurchargePerHourKzt: 5_000,
    settingsRevision: 1,
    lessonDurationMinutes: 60,
  };
  seed(`bookings/${f3SingleBookingId}`, {
    bookingId: f3SingleBookingId,
    attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_t30a_f3_single_01'),
      instructorId: f3InstructorId,
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(f3SingleBookingId),
    payerAccountId: accountId,
    pricingSnapshot: { ...f3SnapshotBase, participantCount: 1, totalPriceKzt: 12_000 },
    ...metadata,
  });
  seed(`payments/${paymentIdFromBookingId(f3SingleBookingId)}`, {
    paymentId: paymentIdFromBookingId(f3SingleBookingId),
    payerAccountId: accountId,
    paymentStatus: 'paid',
    ...metadata,
  });
  seed(`bookings/${f3MultiBookingId}`, {
    bookingId: f3MultiBookingId,
    attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    party: { kind: 'family_group', participantIds: [participantId, familyParticipantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_t30a_f3_multi_01'),
      instructorId: f3InstructorId,
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId, familyParticipantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(f3MultiBookingId),
    payerAccountId: accountId,
    pricingSnapshot: { ...f3SnapshotBase, participantCount: 2, totalPriceKzt: 17_000 },
    ...metadata,
  });
  seed(`payments/${paymentIdFromBookingId(f3MultiBookingId)}`, {
    paymentId: paymentIdFromBookingId(f3MultiBookingId),
    payerAccountId: accountId,
    paymentStatus: 'paid',
    ...metadata,
  });
  seed(`booking_proposals/${proposalId}`, {
    proposalId,
    participantId,
    instructorId,
    proposedService: {
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
    },
    lifecycle: { status: 'open' },
    ...metadata,
  });
  seed(`booking_proposals/${otherProposalId}`, {
    proposalId: otherProposalId,
    participantId: otherParticipantId,
    instructorId: otherInstructorId,
    proposedService: {
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
    },
    lifecycle: { status: 'open' },
    ...metadata,
  });
  seed(`booking_change_requests/${changeRequestId}`, {
    requestId: changeRequestId,
    bookingId,
    requestType: 'instructor_unavailable',
    reason: 'Need substitute',
    lifecycle: { status: 'open' },
    ...metadata,
  });
  seed(`booking_change_requests/${familyChangeRequestId}`, {
    requestId: familyChangeRequestId,
    bookingId: f3MultiBookingId,
    requestType: 'instructor_unavailable',
    reason: 'Family lesson needs a substitute',
    lifecycle: { status: 'open' },
    ...metadata,
  });

  const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
  seed(`instructor_relationships/${relationshipId}`, {
    instructorRelationshipId: relationshipId,
    participantId,
    instructorId,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: managementId,
      grantedByAccountId: accountId,
    },
    validFrom: decidedAt,
    expiresAt: timestampFromDate(new Date('2027-01-01T00:00:00.000Z')),
    status: 'active',
    ...metadata,
  });

  const managerBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind: 'participant_manager',
  });
  seed(`participant_blocks/${managerBlockId}`, {
    participantBlockId: managerBlockId,
    participantId,
    instructorId,
    createdBy: {
      kind: 'participant_manager',
      accountId,
      participantManagementId: managementId,
    },
    reason: 'Manager block reason',
    status: 'removed',
    ...metadata,
  });

  const getNestedField = (data: Record<string, unknown>, field: string): unknown => {
    if (field in data) {
      return data[field];
    }
    const parts = field.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  const getDoc = async (path: string) => {
    const data = docs.get(path);
    return {
      exists: data !== undefined,
      data: () => data,
    };
  };

  type FixtureDocument = { id: string; data: Record<string, unknown> };
  type Order = { field: string; direction: 'asc' | 'desc' };
  const query = (
    documents: readonly FixtureDocument[],
    orders: readonly Order[] = [],
    cursor?: readonly unknown[],
    maximum?: number
  ): Record<string, unknown> => {
    const compare = (left: readonly unknown[], right: readonly unknown[]) => {
      for (let index = 0; index < orders.length; index += 1) {
        const a = left[index] as number | string;
        const b = right[index] as number | string;
        const difference = a === b ? 0 : a < b ? -1 : 1;
        if (difference) return orders[index].direction === 'desc' ? -difference : difference;
      }
      return 0;
    };
    const values = (document: FixtureDocument) =>
      orders.map(({ field }) => getNestedField(document.data, field));
    return {
      where: (field: string, op: string, value: unknown) =>
        query(
          documents.filter(({ data }) => {
            if (op === 'array-contains-any' && Array.isArray(value)) {
              const arrayField = getNestedField(data, field) as unknown[] | undefined;
              return arrayField?.some((entry) => value.includes(entry));
            }
            if (op !== '==') throw new Error(`Unsupported fixture operator: ${op}`);
            return getNestedField(data, field) === value;
          }),
          orders,
          cursor,
          maximum
        ),
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
        query(documents, [...orders, { field, direction }], cursor, maximum),
      startAfter: (...nextCursor: unknown[]) => query(documents, orders, nextCursor, maximum),
      limit: (value: number) => query(documents, orders, cursor, value),
      get: async () => ({
        docs: [...documents]
          .sort((left, right) => compare(values(left), values(right)))
          .filter((document) => !cursor || compare(values(document), cursor) > 0)
          .slice(0, maximum)
          .map(({ id, data }) => ({ id, data: () => data })),
      }),
    };
  };

  return {
    collection: (name: string) => ({
      ...query(
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
  } as unknown as Firestore;
}

describe('T30A canonical read models', () => {
  it('loads authorized account bookings from fixture data', async () => {
    const { loadAuthorizedAccountBookings } = await import('./lessonBookingReadModels');
    const bookings = await loadAuthorizedAccountBookings(createT30aFirestore(), accountId);
    expect(bookings.length).toBeGreaterThan(0);
  });

  it('returns account-open proposals only for managed participants with accept/decline actions', async () => {
    const result = await queryBookingProposalReadModels(
      createT30aFirestore(),
      { scope: 'account_open' },
      { accountId, now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.proposalId).toBe(proposalId);
    expect(result.items[0]?.authorizedActions).toEqual({
      canAccept: true,
      canDecline: true,
      canWithdraw: false,
    });
    expect(result.items[0]?.clientExercisedCapability).toBe('parent_guardian');
  });

  it('returns instructor-open proposals only in instructor scope with withdraw action', async () => {
    const result = await queryBookingProposalReadModels(
      createT30aFirestore(),
      { scope: 'instructor_open' },
      { accountId: instructorAccountId, instructorId, now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.proposalId).toBe(proposalId);
    expect(result.items[0]?.authorizedActions).toEqual({
      canAccept: false,
      canDecline: false,
      canWithdraw: true,
    });
    expect(result.items[0]?.clientExercisedCapability).toBeUndefined();
  });

  it('exposes open change requests to account viewers without withdraw and to instructor with withdraw', async () => {
    const accountResult = await queryBookingChangeRequestReadModels(
      createT30aFirestore(),
      { scope: 'account_open' },
      { accountId, now: new Date('2026-01-01T00:00:00.000Z') }
    );
    expect(accountResult.items).toHaveLength(2);
    expect(accountResult.items.map((item) => item.requestId).sort()).toEqual(
      [changeRequestId, familyChangeRequestId].sort()
    );
    expect(accountResult.items.every((item) => item.authorizedActions.canWithdraw === false)).toBe(
      true
    );

    const instructorResult = await queryBookingChangeRequestReadModels(
      createT30aFirestore(),
      { scope: 'instructor_open' },
      {
        accountId: instructorAccountId,
        instructorId,
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(instructorResult.items).toHaveLength(1);
    expect(instructorResult.items[0]?.authorizedActions).toEqual({ canWithdraw: true });
  });

  it('projects open change requests into the administrator attention inbox', async () => {
    const adminAccountId = AccountIdSchema.parse('account_t30a_admin_01');
    const result = await queryBookingChangeRequestReadModels(
      createT30aFirestore(),
      { scope: 'admin_open' },
      {
        accountId: adminAccountId,
        administratorActor: { kind: 'administrator', accountId: adminAccountId },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );

    expect(result.scope).toBe('admin_open');
    expect(result.items.map((item) => item.requestId).sort()).toEqual(
      [changeRequestId, familyChangeRequestId].sort()
    );
    const familyItem = result.items.find((item) => item.requestId === familyChangeRequestId);
    expect(familyItem?.sourceRef).toEqual({
      sourceKind: 'booking_change_request',
      bookingChangeRequestId: familyChangeRequestId,
    });
    expect(familyItem?.participants.map((participant) => participant.participantId)).toEqual([
      participantId,
      familyParticipantId,
    ]);
    expect(familyItem?.reason).toBe('Family lesson needs a substitute');
    expect(familyItem?.authorizedActions).toEqual({
      canResolveRescheduled: true,
      canResolveBookingCancelled: true,
      canResolveNoChange: true,
    });
  });

  it('omits resolved change requests from the administrator attention inbox', async () => {
    const firestore = createT30aFirestore();
    const adminAccountId = AccountIdSchema.parse('account_t30a_admin_01');
    const snapshot = await firestore.collection('booking_change_requests').doc(changeRequestId).get();
    const current = snapshot.data() as Record<string, unknown>;
    Object.assign(current, {
      lifecycle: {
        status: 'resolved',
        resolution: 'no_change',
        resolvedAt: decidedAt,
      },
    });

    const result = await queryBookingChangeRequestReadModels(
      firestore,
      { scope: 'admin_open' },
      {
        accountId: adminAccountId,
        administratorActor: { kind: 'administrator', accountId: adminAccountId },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(result.items.some((item) => item.requestId === changeRequestId)).toBe(false);
    expect(result.items.some((item) => item.requestId === familyChangeRequestId)).toBe(true);
  });

  it('forbids administrator attention projection without an administrator actor', async () => {
    await expect(
      queryBookingChangeRequestReadModels(
        createT30aFirestore(),
        { scope: 'admin_open' },
        { accountId, now: new Date('2026-01-01T00:00:00.000Z') }
      )
    ).rejects.toBeInstanceOf(BookingChangeRequestAdminReadForbiddenError);
  });

  it('returns participant instructor access for authorized account manager', async () => {
    const result = await queryParticipantInstructorAccessReadModels(
      createT30aFirestore(),
      { scope: 'account_manager', participantId, instructorId },
      { accountId, now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(result.item?.relationship?.status).toBe('active');
    expect(result.item?.authorizedActions.canCreateRelationship).toBe(false);
    expect(result.item?.authorizedActions.canRevokeRelationship).toBe(true);
  });

  it('denies instructor access read model when instructorId does not match auth instructor', async () => {
    const result = await queryParticipantInstructorAccessReadModels(
      createT30aFirestore(),
      { scope: 'instructor', participantId, instructorId: otherInstructorId },
      { accountId: instructorAccountId, instructorId, now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(result.item).toBeUndefined();
  });

  it('builds instructor lesson projection without payment presentation', async () => {
    const firestore = createT30aFirestore();
    const bookingSnap = await firestore.collection('bookings').doc(bookingId).get();
    const booking = parseBooking(bookingSnap.data() as Record<string, unknown> | undefined);
    expect(booking).toBeDefined();

    const readModel = await buildInstructorLessonBookingReadModel(
      firestore,
      instructorId,
      booking!
    );

    expect(readModel).toBeDefined();
    expect(readModel).not.toHaveProperty('paymentPresentation');
    expect(readModel?.authorizedActions).toEqual({
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: true,
    });
  });

  it('returns instructor_hot lessons without payer financial fields', async () => {
    const result = await queryLessonBookingReadModels(
      createT30aFirestore(),
      // Fill the scan batch so the query must use startAfter to establish exhaustion.
      { scope: 'instructor_hot', pageSize: 1 },
      {
        accountId: instructorAccountId,
        instructorId,
        now: new Date('2026-06-15T08:00:00.000Z'),
      }
    );

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.items.some((item) => item.bookingId === bookingId)).toBe(true);
    const item = result.items.find((entry) => entry.bookingId === bookingId);
    expect(item).not.toHaveProperty('paymentPresentation');
    expect(item?.authorizedActions.canReschedule).toBe(false);
  });

  it('returns empty account_hot results for accounts without authorized bookings', async () => {
    const result = await queryLessonBookingReadModels(
      createT30aFirestore(),
      { scope: 'account_hot' },
      { accountId: otherAccountId, now: new Date('2026-06-15T08:00:00.000Z') }
    );
    expect(result.items).toHaveLength(0);
  });

  it('returns pre-F3 and F3 single/multi-participant lesson Bookings in account_hot', async () => {
    const result = await queryLessonBookingReadModels(
      createT30aFirestore(),
      { scope: 'account_hot', pageSize: 20 },
      { accountId, now: new Date('2026-06-15T08:00:00.000Z') }
    );
    expect(result.items.map((item) => item.bookingId).sort()).toEqual(
      [bookingId, f3SingleBookingId, f3MultiBookingId].sort()
    );
    const multi = result.items.find((item) => item.bookingId === f3MultiBookingId);
    expect(multi?.participantIds).toEqual([participantId, familyParticipantId]);
    expect(multi?.participants.map((participant) => participant.participantId)).toEqual([
      participantId,
      familyParticipantId,
    ]);
  });
});
