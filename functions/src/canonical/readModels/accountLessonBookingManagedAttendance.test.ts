import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendanceIdFromBookingIdentity,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import {
  loadAuthorizedAccountBookings,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';

const accountA = AccountIdSchema.parse('account_managed_att_a');
const accountB = AccountIdSchema.parse('account_managed_att_b');
const participantA = ParticipantIdSchema.parse('participant_managed_att_a');
const participantB = ParticipantIdSchema.parse('participant_managed_att_b');
const participantC = ParticipantIdSchema.parse('participant_managed_att_c');
const managementA = ParticipantManagementIdSchema.parse('participant_management_att_a');
const managementB = ParticipantManagementIdSchema.parse('participant_management_att_b');
const instructorId = InstructorIdSchema.parse('instructor_managed_att_01');
const groupBookingId = BookingIdSchema.parse('booking_managed_att_group_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_managed_att_group_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const startsAt = timestampFromDate(new Date('2026-03-01T09:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-03-01T10:30:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_managed_att',
    lastChangedByCommandId: 'command_managed_att',
    correlationId: 'correlation_managed_att',
  },
};

function createFixtureFirestore(extra: Record<string, Record<string, unknown>> = {}): Firestore {
  const docs = new Map<string, Record<string, unknown>>();
  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  const participantDoc = (
    participantId: typeof participantA,
    managementId: string | undefined,
    name: string
  ) => ({
    participantId,
    displayName: name,
    age: { kind: 'age_years', years: 12 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: managementId
      ? { kind: 'managed', participantManagementId: managementId }
      : { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    ...metadata,
  });

  seed(`users/${accountA}`, { accountId: accountA, lifecycle: { status: 'active' }, ...metadata });
  seed(`users/${accountB}`, { accountId: accountB, lifecycle: { status: 'active' }, ...metadata });
  seed(`participant_management/${managementA}`, {
    participantManagementId: managementA,
    accountId: accountA,
    participantId: participantA,
    role: 'owner',
    authority: 'self',
    status: 'active',
    ...metadata,
  });
  seed(`participant_management/${managementB}`, {
    participantManagementId: managementB,
    accountId: accountB,
    participantId: participantB,
    role: 'owner',
    authority: 'parent_guardian',
    status: 'active',
    ...metadata,
  });
  seed(`participants/${participantA}`, participantDoc(participantA, managementA, 'Alice'));
  seed(`participants/${participantB}`, participantDoc(participantB, managementB, 'Bob'));
  seed(`participants/${participantC}`, participantDoc(participantC, undefined, 'Cara'));
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    name: 'Stats Coach',
    pricePerHourKZT: 10_000,
  });
  seed(`bookings/${groupBookingId}`, {
    bookingId: groupBookingId,
    attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId: accountA } },
    party: { kind: 'family_group', participantIds: [participantA, participantB, participantC] },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: { startsAt, endsAt },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: {
        participantIds: [participantA, participantB, participantC],
        frozenAt: startsAt,
      },
    },
    lifecycle: { status: 'completed', completedAt: endsAt },
    paymentId: paymentIdFromBookingId(groupBookingId),
    payerAccountId: accountA,
    revision: 2,
    createdAt: decidedAt,
    updatedAt: endsAt,
    audit: metadata.audit,
  });
  const attendanceAId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: participantA,
  });
  const attendanceBId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: participantB,
  });
  seed(`attendance/${attendanceAId}`, {
    attendanceId: attendanceAId,
    subject: {
      subjectKind: 'booking',
      bookingId: groupBookingId,
      occurrenceId,
      participantId: participantA,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: endsAt,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: endsAt,
    revision: 1,
    correlationId: 'correlation_managed_att',
  });
  seed(`attendance/${attendanceBId}`, {
    attendanceId: attendanceBId,
    subject: {
      subjectKind: 'booking',
      bookingId: groupBookingId,
      occurrenceId,
      participantId: participantB,
    },
    attendanceStatus: 'absent',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: endsAt,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: endsAt,
    revision: 1,
    correlationId: 'correlation_managed_att',
  });
  for (const [path, data] of Object.entries(extra)) {
    seed(path, data);
  }

  const getNestedField = (data: Record<string, unknown>, field: string): unknown => {
    const parts = field.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  type FixtureDocument = { id: string; data: Record<string, unknown> };
  const query = (
    documents: readonly FixtureDocument[],
    maximum?: number
  ): Record<string, unknown> => ({
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
        maximum
      ),
    limit: (value: number) => query(documents, value),
    get: async () => ({
      docs: documents.slice(0, maximum).map(({ id, data }) => ({ id, data: () => data })),
    }),
  });

  return {
    collection: (name: string) => ({
      ...query(
        [...docs.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, data]) => ({ id: path.slice(name.length + 1), data }))
      ),
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return { id, exists: data !== undefined, data: () => data };
        },
      }),
    }),
    doc: (path: string) => ({
      get: async () => {
        const normalized = path.startsWith('/') ? path.slice(1) : path;
        const data = docs.get(normalized);
        return {
          id: normalized.split('/').at(-1) ?? normalized,
          exists: data !== undefined,
          data: () => data,
        };
      },
    }),
  } as unknown as Firestore;
}

describe('account lesson booking managed attendance projection', () => {
  it('1–3. managing Account sees self attendance; guardian sees managed child; dependent works', async () => {
    const firestore = createFixtureFirestore();
    const selfResult = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId: accountA, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    expect(selfResult.items).toHaveLength(1);
    expect(selfResult.items[0]?.managedParticipantAttendance).toEqual([
      { participantId: participantA, attendanceStatus: 'present' },
    ]);

    const guardianResult = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId: accountB, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    expect(guardianResult.items[0]?.managedParticipantAttendance).toEqual([
      { participantId: participantB, attendanceStatus: 'absent' },
    ]);
    expect(guardianResult.items[0]?.serviceParticipantIds).toEqual([
      participantA,
      participantB,
      participantC,
    ]);
  });

  it('4–6. Account does not receive unrelated group participant attendance', async () => {
    const firestore = createFixtureFirestore();
    const result = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId: accountA, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    const rows = result.items[0]?.managedParticipantAttendance ?? [];
    expect(rows.map((row) => row.participantId)).toEqual([participantA]);
    expect(JSON.stringify(rows)).not.toContain(participantB);
    expect(JSON.stringify(rows)).not.toContain('absent');
    expect(rows.some((row) => row.participantId === participantC)).toBe(false);
  });

  it('7–8. projection does not include booking.userId or participants[0] fallback fields', async () => {
    const firestore = createFixtureFirestore();
    const result = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history' },
      { accountId: accountA, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    expect(result.items[0]).not.toHaveProperty('userId');
    expect(result.items[0]?.managedParticipantAttendance?.[0]?.participantId).toBe(participantA);
    expect(result.items[0]?.participants[0]?.participantId).toBe(participantA);
    expect(result.items[0]?.managedParticipantAttendance?.[0]?.participantId).not.toBe(
      result.items[0]?.participants[1]?.participantId
    );
  });

  it('loads more than one history page after removing the previous 100-doc cap', async () => {
    const extra: Record<string, Record<string, unknown>> = {};
    for (let index = 1; index <= 30; index += 1) {
      const bookingId = BookingIdSchema.parse(`booking_managed_att_hist_${String(index).padStart(2, '0')}`);
      const occurrence = OccurrenceIdSchema.parse(
        `occurrence_managed_att_hist_${String(index).padStart(2, '0')}`
      );
      const starts = timestampFromDate(new Date(Date.UTC(2026, 1, 1, 0, 0, index)));
      const ends = timestampFromDate(new Date(Date.UTC(2026, 1, 1, 1, 0, index)));
      extra[`bookings/${bookingId}`] = {
        bookingId,
        attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId: accountA } },
        party: { kind: 'individual', participantIds: [participantA] },
        occurrence: {
          occurrenceId: occurrence,
          instructorId,
          interval: { startsAt: starts, endsAt: ends },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [participantA], frozenAt: starts },
        },
        lifecycle: { status: 'completed', completedAt: ends },
        paymentId: paymentIdFromBookingId(bookingId),
        payerAccountId: accountA,
        revision: 1,
        createdAt: decidedAt,
        updatedAt: ends,
        audit: metadata.audit,
      };
    }
    const firestore = createFixtureFirestore(extra);
    const loaded = await loadAuthorizedAccountBookings(firestore, accountA);
    expect(loaded.length).toBeGreaterThan(25);
    const first = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 25 },
      { accountId: accountA, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    expect(first.items).toHaveLength(25);
    expect(first.hasMore).toBe(true);
    const second = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 25, cursor: first.nextCursor },
      { accountId: accountA, now: new Date('2026-03-02T00:00:00.000Z') }
    );
    const ids = new Set([
      ...first.items.map((item) => item.bookingId),
      ...second.items.map((item) => item.bookingId),
    ]);
    expect(ids.size).toBe(first.items.length + second.items.length);
    expect(ids.size).toBeGreaterThan(25);
  });
});
