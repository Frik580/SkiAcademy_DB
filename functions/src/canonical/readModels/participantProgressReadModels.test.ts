import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  attendanceIdFromBookingIdentity,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  ParticipantProgressReadDeniedError,
  queryParticipantProgressReadModels,
} from './participantProgressReadModels';

const accountId = AccountIdSchema.parse('account_progress_read_01');
const otherAccountId = AccountIdSchema.parse('account_progress_read_02');
const instructorAccountId = AccountIdSchema.parse('account_progress_read_instructor');
const selfParticipantId = ParticipantIdSchema.parse('participant_progress_read_self');
const childParticipantId = ParticipantIdSchema.parse('participant_progress_read_child');
const otherParticipantId = ParticipantIdSchema.parse('participant_progress_read_other');
const selfManagementId = ParticipantManagementIdSchema.parse('management_progress_read_self');
const childManagementId = ParticipantManagementIdSchema.parse('management_progress_read_child');
const otherManagementId = ParticipantManagementIdSchema.parse('management_progress_read_other');
const instructorId = InstructorIdSchema.parse('instructor_progress_read_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_progress_read_02');
const relationshipId = instructorRelationshipIdFromPair({
  participantId: selfParticipantId,
  instructorId,
});
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_progress_read_fixture',
    lastChangedByCommandId: 'command_progress_read_fixture',
    correlationId: 'correlation_progress_read_fixture',
  },
};

function createFixtureFirestore(
  options: Readonly<{
    omitProgress?: boolean;
    leftoverUserProgress?: boolean;
    bookedChildAttendance?: 'present' | 'absent' | 'missing';
    bookedChildStartsAt?: ReturnType<typeof timestampFromDate>;
    bookedChildInstructorId?: typeof instructorId;
    bookedChildStatus?: 'confirmed' | 'completed' | 'cancelled';
    extraInvalidBookings?: number;
  }> = {}
): Firestore {
  const leftoverProgress = options.leftoverUserProgress
    ? {
        level: 3,
        skillScores: { carving: 99 },
        skillComments: { carving: 'Legacy leftover' },
      }
    : {};
  const docs = new Map<string, Record<string, unknown>>([
    [
      `users/${accountId}`,
      { accountId, lifecycle: { status: 'active' }, ...metadata, ...leftoverProgress },
    ],
    [
      `users/${otherAccountId}`,
      { accountId: otherAccountId, lifecycle: { status: 'active' }, ...metadata },
    ],
    [
      `users/${instructorAccountId}`,
      {
        accountId: instructorAccountId,
        lifecycle: { status: 'active' },
        instructorId,
        ...metadata,
      },
    ],
    [
      `participants/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        displayName: 'Self',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${childParticipantId}`,
      {
        participantId: childParticipantId,
        displayName: 'Child',
        age: { kind: 'age_years', years: 8 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: childManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${otherParticipantId}`,
      {
        participantId: otherParticipantId,
        displayName: 'Other',
        age: { kind: 'age_years', years: 22 },
        skillLevel: 'advanced',
        discipline: 'snowboard',
        management: { kind: 'managed', participantManagementId: otherManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participant_management/${selfManagementId}`,
      {
        participantManagementId: selfManagementId,
        accountId,
        participantId: selfParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${childManagementId}`,
      {
        participantManagementId: childManagementId,
        accountId,
        participantId: childParticipantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${otherManagementId}`,
      {
        participantManagementId: otherManagementId,
        accountId: otherAccountId,
        participantId: otherParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_progress/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        level: 3,
        skillScores: { carving: 12 },
        skillComments: { carving: 'Self note' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
    [
      `participant_progress/${childParticipantId}`,
      {
        participantId: childParticipantId,
        level: 2,
        skillScores: { skating: 6 },
        skillComments: {},
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: metadata.audit,
      },
    ],
    [
      `instructor_relationships/${relationshipId}`,
      {
        instructorRelationshipId: relationshipId,
        participantId: selfParticipantId,
        instructorId,
        basis: {
          kind: 'guardian_permission',
          participantManagementId: selfManagementId,
          grantedByAccountId: accountId,
        },
        validFrom: decidedAt,
        expiresAt: instructorRelationshipExpiresAt(decidedAt),
        status: 'active',
        ...metadata,
      },
    ],
  ]);

  if (options.omitProgress) {
    docs.delete(`participant_progress/${selfParticipantId}`);
    docs.delete(`participant_progress/${childParticipantId}`);
  }

  if (options.bookedChildAttendance) {
    const bookingId = BookingIdSchema.parse('booking_progress_read_child');
    const occurrenceId = OccurrenceIdSchema.parse('occurrence_progress_read_child');
    const startsAt =
      options.bookedChildStartsAt ?? timestampFromDate(new Date('2026-01-02T09:00:00.000Z'));
    const endsAt = timestampFromDate(new Date(startsAt.seconds * 1_000 + 60 * 60_000));
    docs.set(`bookings/${bookingId}`, {
      bookingId,
      attribution: {
        bookingOrigin: 'admin',
        bookedBy: { kind: 'account', accountId },
      },
      party: { kind: 'individual', participantIds: [childParticipantId] },
      occurrence: {
        occurrenceId,
        instructorId: options.bookedChildInstructorId ?? instructorId,
        interval: { startsAt, endsAt },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [childParticipantId], frozenAt: startsAt },
      },
      lifecycle:
        options.bookedChildStatus === 'cancelled'
          ? { status: 'cancelled', cancelledAt: endsAt, reasonCode: 'account_owner_cancelled' }
          : options.bookedChildStatus === 'completed'
            ? { status: 'completed', completedAt: endsAt }
            : { status: 'confirmed' },
      paymentId: paymentIdFromBookingId(bookingId),
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: metadata.audit,
    });
    const validBooking = docs.get(`bookings/${bookingId}`)!;
    for (let index = 0; index < (options.extraInvalidBookings ?? 0); index += 1) {
      const otherBookingId = BookingIdSchema.parse(`booking_progress_read_other_${index}`);
      const otherOccurrenceId = OccurrenceIdSchema.parse(`occurrence_progress_read_other_${index}`);
      const earlierStart = timestampFromDate(new Date('2026-01-01T09:00:00.000Z'));
      docs.set(`bookings/${otherBookingId}`, {
        ...validBooking,
        bookingId: otherBookingId,
        paymentId: paymentIdFromBookingId(otherBookingId),
        occurrence: {
          ...(validBooking.occurrence as Record<string, unknown>),
          occurrenceId: otherOccurrenceId,
          instructorId,
          interval: {
            startsAt: earlierStart,
            endsAt: timestampFromDate(new Date('2026-01-01T10:00:00.000Z')),
          },
          serviceParty: { participantIds: [childParticipantId], frozenAt: earlierStart },
        },
        archival: { isDeleted: true, deletedAt: decidedAt },
      });
    }
    if (options.bookedChildAttendance !== 'missing') {
      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId,
        participantId: childParticipantId,
      });
      docs.set(`attendance/${attendanceId}`, {
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId: childParticipantId,
        },
        attendanceStatus: options.bookedChildAttendance,
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: endsAt,
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: endsAt,
        revision: 1,
        correlationId: metadata.audit.correlationId,
      });
    }
  }

  const documentRef = (path: string) => ({
    get: async () => {
      const data = docs.get(path);
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
  });

  return {
    getAll: async (...documentRefs: Array<{ get: () => Promise<unknown> }>) =>
      Promise.all(documentRefs.map((documentRefItem) => documentRefItem.get())),
    doc: (path: string) => documentRef(path),
    collection: (name: string) => {
      type Row = { path: string; data: Record<string, unknown> };
      const valueAt = (data: Record<string, unknown>, field: string): unknown =>
        field.split('.').reduce<unknown>((current, part) => {
          if (!current || typeof current !== 'object') return undefined;
          return (current as Record<string, unknown>)[part];
        }, data);
      const query = (
        filters: Array<(row: Row) => boolean> = [],
        orderField?: string,
        afterPath?: string,
        pageSize = Infinity
      ) => ({
        where: (field: string, op: string, value: unknown) =>
          query(
            [
              ...filters,
              (row) => {
                const fieldValue = valueAt(row.data, field);
                return op === 'array-contains'
                  ? Array.isArray(fieldValue) && fieldValue.includes(value)
                  : op === 'in'
                    ? Array.isArray(value) && value.includes(fieldValue)
                    : op === '<='
                      ? typeof fieldValue === 'number' && fieldValue <= Number(value)
                      : fieldValue === value;
              },
            ],
            orderField,
            afterPath,
            pageSize
          ),
        orderBy: (field: string) => query(filters, field, afterPath, pageSize),
        startAfter: (snapshot: { path: string }) =>
          query(filters, orderField, snapshot.path, pageSize),
        limit: (size: number) => query(filters, orderField, afterPath, size),
        get: async () => {
          const rows = [...docs.entries()]
            .filter(([path]) => path.startsWith(`${name}/`))
            .map(([path, data]) => ({ path, data }))
            .filter((row) => filters.every((filter) => filter(row)));
          if (orderField) {
            rows.sort(
              (left, right) =>
                Number(valueAt(left.data, orderField)) - Number(valueAt(right.data, orderField)) ||
                left.path.localeCompare(right.path)
            );
          }
          const afterIndex = afterPath ? rows.findIndex((row) => row.path === afterPath) + 1 : 0;
          return {
            docs: rows.slice(afterIndex, afterIndex + pageSize).map((row) => ({
              path: row.path,
              data: () => row.data,
            })),
          };
        },
      });
      return { doc: (id: string) => documentRef(`${name}/${id}`), ...query() };
    },
  } as unknown as Firestore;
}

describe('participant progress read models', () => {
  it('returns self Participant progress for the managing Account', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'managed', participantIds: [selfParticipantId] },
      { accountId }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      participantId: selfParticipantId,
      level: 3,
      skillScores: { carving: 12 },
    });
  });

  it('returns child Participant progress to the guardian Account separately from self', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'managed' },
      { accountId }
    );
    expect(result.items.map((item) => item.participantId).sort()).toEqual(
      [childParticipantId, selfParticipantId].sort()
    );
    const self = result.items.find((item) => item.participantId === selfParticipantId);
    const child = result.items.find((item) => item.participantId === childParticipantId);
    expect(self?.level).toBe(3);
    expect(child?.level).toBe(2);
    expect(self?.skillScores).not.toEqual(child?.skillScores);
  });

  it('denies an unrelated Account', async () => {
    await expect(
      queryParticipantProgressReadModels(
        createFixtureFirestore(),
        { scope: 'managed', participantIds: [selfParticipantId] },
        { accountId: otherAccountId }
      )
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
  });

  it('lets an instructor with relationship authority read only that Participant', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore(),
      { scope: 'instructor', participantIds: [selfParticipantId, childParticipantId] },
      { accountId: instructorAccountId, instructorId }
    );
    expect(result.items.map((item) => item.participantId)).toEqual([selfParticipantId]);
    expect(result.items[0]?.level).toBe(3);
  });

  it('denies an instructor-supplied unrelated Participant ID', async () => {
    await expect(
      queryParticipantProgressReadModels(
        createFixtureFirestore(),
        { scope: 'instructor', participantIds: [childParticipantId] },
        { accountId: instructorAccountId, instructorId }
      )
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
  });

  it('allows started booked progress with present or missing Attendance', async () => {
    const requested = { scope: 'instructor' as const, participantIds: [childParticipantId] };
    const actor = {
      accountId: instructorAccountId,
      instructorId,
      now: () => new Date('2026-01-02T09:00:00.000Z'),
    };
    const allowed = await queryParticipantProgressReadModels(
      createFixtureFirestore({ bookedChildAttendance: 'present' }),
      requested,
      actor
    );
    expect(allowed.items.map((item) => item.participantId)).toEqual([childParticipantId]);
    const missing = await queryParticipantProgressReadModels(
      createFixtureFirestore({ bookedChildAttendance: 'missing' }),
      requested,
      actor
    );
    expect(missing.items.map((item) => item.participantId)).toEqual([childParticipantId]);
  });

  it('denies before start and allows at start and long after it', async () => {
    const firestore = createFixtureFirestore({ bookedChildAttendance: 'missing' });
    const input = { scope: 'instructor' as const, participantIds: [childParticipantId] };
    const actor = { accountId: instructorAccountId, instructorId };
    await expect(
      queryParticipantProgressReadModels(firestore, input, {
        ...actor,
        now: () => new Date('2026-01-02T08:59:59.999Z'),
      })
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
    for (const date of ['2026-01-02T09:00:00.000Z', '2030-01-01T00:00:00.000Z']) {
      const result = await queryParticipantProgressReadModels(firestore, input, {
        ...actor,
        now: () => new Date(date),
      });
      expect(result.items.map((item) => item.participantId)).toEqual([childParticipantId]);
    }
  });

  it('denies a different instructor, unrelated Participant and cancelled lesson', async () => {
    const input = { scope: 'instructor' as const, participantIds: [childParticipantId] };
    const actor = {
      accountId: instructorAccountId,
      instructorId,
      now: () => new Date('2026-01-02T09:00:00.000Z'),
    };
    for (const firestore of [
      createFixtureFirestore({
        bookedChildAttendance: 'missing',
        bookedChildInstructorId: otherInstructorId,
      }),
      createFixtureFirestore({ bookedChildAttendance: 'missing', bookedChildStatus: 'cancelled' }),
    ]) {
      await expect(
        queryParticipantProgressReadModels(firestore, input, actor)
      ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
    }
    await expect(
      queryParticipantProgressReadModels(
        createFixtureFirestore({ bookedChildAttendance: 'missing' }),
        { scope: 'instructor', participantIds: [otherParticipantId] },
        actor
      )
    ).rejects.toBeInstanceOf(ParticipantProgressReadDeniedError);
  });

  it('finds assigned evidence beyond the first 50 unrelated bookings', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore({ bookedChildAttendance: 'missing', extraInvalidBookings: 50 }),
      { scope: 'instructor', participantIds: [childParticipantId] },
      {
        accountId: instructorAccountId,
        instructorId,
        now: () => new Date('2026-01-02T09:00:00.000Z'),
      }
    );
    expect(result.items.map((item) => item.participantId)).toEqual([childParticipantId]);
  });

  it('projects missing canonical docs as empty start and ignores leftover /users progress', async () => {
    const result = await queryParticipantProgressReadModels(
      createFixtureFirestore({ omitProgress: true, leftoverUserProgress: true }),
      { scope: 'managed' },
      { accountId }
    );
    const self = result.items.find((item) => item.participantId === selfParticipantId);
    const child = result.items.find((item) => item.participantId === childParticipantId);
    expect(self).toMatchObject({
      participantId: selfParticipantId,
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 0,
    });
    expect(child).toMatchObject({
      participantId: childParticipantId,
      level: 1,
      skillScores: {},
      skillComments: {},
      revision: 0,
    });
    expect(self?.level).not.toBe(3);
    expect(self?.skillScores).not.toEqual({ carving: 99 });
    expect(child?.skillComments).not.toEqual({ carving: 'Legacy leftover' });
  });
});
