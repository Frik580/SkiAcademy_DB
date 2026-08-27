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
import { queryBookingChangeRequestReadModels } from './bookingChangeRequestReadModels';
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
const proposalId = BookingProposalIdSchema.parse('booking_proposal_t30a_01');
const otherProposalId = BookingProposalIdSchema.parse('booking_proposal_t30a_02');
const changeRequestId = BookingChangeRequestIdSchema.parse('booking_change_request_t30a_01');
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
  seed(`users/${otherAccountId}`, { accountId: otherAccountId, lifecycle: { status: 'active' }, ...metadata });
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

  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => getDoc(`${name}/${id}`),
      }),
      where: (field: string, op: string, value: unknown) => ({
        limit: () => ({
          get: async () => {
            const matched = [...docs.entries()]
              .filter(([path]) => path.startsWith(`${name}/`))
              .map(([, data]) => data)
              .filter((data) => {
                if (op === 'array-contains-any' && Array.isArray(value)) {
                  const arrayField = getNestedField(data, field) as unknown[] | undefined;
                  return arrayField?.some((entry) => value.includes(entry));
                }
                return getNestedField(data, field) === value;
              });
            return {
              docs: matched.map((data) => ({ data: () => data })),
            };
          },
        }),
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
  });

  it('exposes open change requests to account viewers without withdraw and to instructor with withdraw', async () => {
    const accountResult = await queryBookingChangeRequestReadModels(
      createT30aFirestore(),
      { scope: 'account_open' },
      { accountId, now: new Date('2026-01-01T00:00:00.000Z') }
    );
    expect(accountResult.items).toHaveLength(1);
    expect(accountResult.items[0]?.authorizedActions).toEqual({ canWithdraw: false });

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
    });
  });

  it('returns instructor_hot lessons without payer financial fields', async () => {
    const result = await queryLessonBookingReadModels(
      createT30aFirestore(),
      { scope: 'instructor_hot' },
      {
        accountId: instructorAccountId,
        instructorId,
        now: new Date('2026-06-15T08:00:00.000Z'),
      }
    );

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
});
