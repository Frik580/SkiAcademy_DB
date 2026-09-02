import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AdministrativeAvailabilityBlockIdSchema,
  AdministrativeAvailabilityBlockSchema,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryAdminPlannerReadModelsHandler } from './queryAdminPlannerReadModelsCallable';

const adminId = AccountIdSchema.parse('account_admin_planner_read_01');
const userId = AccountIdSchema.parse('account_user_planner_read_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_planner_01');
const badAvatarInstructorId = InstructorIdSchema.parse('instructor_admin_planner_bad_avatar');
const bookingId = BookingIdSchema.parse('booking_admin_planner_bad_avatar');
const blockId = AdministrativeAvailabilityBlockIdSchema.parse('block_admin_planner_read_01');
const participantId = ParticipantIdSchema.parse('participant_admin_planner_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_planner_read_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const bookingStart = timestampFromDate(new Date('2026-09-01T04:00:00.000Z'));
const bookingEnd = timestampFromDate(new Date('2026-09-01T05:00:00.000Z'));

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      data
    );
}

function createWindowQuery(
  entries: () => Array<[string, Record<string, unknown>]>,
  rangeField: string
) {
  let rangeStart = 0;
  let rangeEnd = Number.MAX_SAFE_INTEGER;
  const chain = {
    where: (field: string, operator: string, value: unknown) => {
      if (field === rangeField) {
        if (operator === '>=') rangeStart = value as number;
        if (operator === '<') rangeEnd = value as number;
      }
      return chain;
    },
    orderBy: () => chain,
    limit: () => ({
      get: async () =>
        snapshot(
          entries().filter(([, data]) => {
            const seconds = nestedValue(data, rangeField);
            return typeof seconds === 'number' && seconds >= rangeStart && seconds < rangeEnd;
          })
        ),
      startAfter: () => ({
        limit: () => ({
          get: async () => ({
            docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
          }),
        }),
      }),
    }),
    startAfter: () => ({
      limit: () => ({
        get: async () => ({
          docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
        }),
      }),
    }),
  };
  return chain;
}

function snapshot(entries: Array<[string, Record<string, unknown>]>) {
  return {
    empty: entries.length === 0,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1)!,
      data: () => data,
    })),
  };
}

function fakeFirestore(seed: Record<string, Record<string, unknown>>): Firestore {
  const collection = (path: string) => {
    const entries = () =>
      Object.entries(seed).filter(([key]) => {
        if (!key.startsWith(`${path}/`)) return false;
        return key.slice(path.length + 1).split('/').length === 1;
      });
    const rangeField =
      path === 'bookings'
        ? 'occurrence.interval.startsAt.seconds'
        : path === 'administrative_availability_blocks'
          ? 'interval.startsAt.seconds'
          : 'interval.startsAt.seconds';
    const windowQuery = createWindowQuery(entries, rangeField);
    return {
      ...windowQuery,
      doc: (id: string) => ({
        get: async () => {
          const data = seed[`${path}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
      get: async () => snapshot(entries()),
      limit: (count: number) => ({ get: async () => snapshot(entries().slice(0, count)) }),
      where: (field: string, _op: string, value: unknown) => ({
        ...windowQuery,
        get: async () =>
          snapshot(entries().filter(([, data]) => Object.is(nestedValue(data, field), value))),
      }),
    };
  };
  return {
    collection,
    collectionGroup: (name: string) =>
      createWindowQuery(
        () =>
          Object.entries(seed).filter(([key]) => {
            const suffix = `/${name}/`;
            return (
              key.includes(suffix) &&
              key.slice(key.indexOf(suffix) + suffix.length).split('/').length === 1
            );
          }),
        'interval.startsAt.seconds'
      ),
  } as unknown as Firestore;
}

function seed() {
  const account = (accountId: typeof adminId | typeof userId, role: 'admin' | 'user') => ({
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    role,
  });
  return {
    [`users/${adminId}`]: account(adminId, 'admin'),
    [`users/${userId}`]: account(userId, 'user'),
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Safe Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
  };
}

function seedWithBadAvatarInstructor() {
  const data = seed();
  data[`instructors/${badAvatarInstructorId}`] = {
    id: badAvatarInstructorId,
    name: 'Legacy Avatar Coach',
    avatarUrl: `https://example.com/${'x'.repeat(2_001)}`,
    pricePerHourKZT: 12_000,
    isAvailable: true,
  };
  data[`bookings/${bookingId}`] = BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: adminId },
    },
    party: {
      kind: 'individual',
      participantIds: [participantId],
    },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_admin_planner_bad_avatar'),
      instructorId: badAvatarInstructorId,
      interval: {
        startsAt: bookingStart,
        endsAt: bookingEnd,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: adminId,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  }) as unknown as Record<string, unknown>;
  data[`participants/${participantId}`] = {
    participantId,
    displayName: 'Planner Participant',
  };
  data[`administrative_availability_blocks/${blockId}`] =
    AdministrativeAvailabilityBlockSchema.parse({
      blockId,
      instructorId,
      kind: 'break',
      interval: {
        startsAt: timestampFromDate(new Date('2026-09-01T06:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-09-01T07:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      notes: 'Lunch',
      lifecycle: 'active',
      scheduleRevision: 1,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    }) as unknown as Record<string, unknown>;
  return data;
}

async function queryPlanner(
  handler: ReturnType<typeof createQueryAdminPlannerReadModelsHandler>,
  input: Record<string, unknown>
) {
  return handler({
    auth: { uid: adminId },
    data: input,
  } as never);
}

describe('Admin Planner read-model callable', () => {
  it('rejects non-admin callers', async () => {
    const handler = createQueryAdminPlannerReadModelsHandler(fakeFirestore(seed()));
    await expect(
      handler({
        auth: { uid: userId },
        data: {
          scope: 'admin_planner',
          localDate: '2026-09-01',
          view: 'day',
          timeZone: 'Asia/Almaty',
        },
      } as never)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('returns day and week planner projections for admin callers', async () => {
    const handler = createQueryAdminPlannerReadModelsHandler(fakeFirestore(seed()));
    await expect(
      queryPlanner(handler, {
        scope: 'admin_planner',
        localDate: '2026-09-01',
        view: 'day',
        timeZone: 'Asia/Almaty',
      })
    ).resolves.toMatchObject({
      scope: 'admin_planner',
      item: {
        view: 'day',
        instructors: [{ instructorId, name: 'Safe Coach' }],
      },
    });
    await expect(
      queryPlanner(handler, {
        scope: 'admin_planner',
        localDate: '2026-09-01',
        view: 'week',
        timeZone: 'Asia/Almaty',
        windowDays: 62,
      })
    ).resolves.toMatchObject({
      scope: 'admin_planner',
      item: { view: 'week' },
    });
  });

  it('keeps instructor identity and occupancy when avatarUrl exceeds read-model bounds', async () => {
    const handler = createQueryAdminPlannerReadModelsHandler(
      fakeFirestore(seedWithBadAvatarInstructor())
    );

    const dayResult = await queryPlanner(handler, {
      scope: 'admin_planner',
      localDate: '2026-09-01',
      view: 'day',
      timeZone: 'Asia/Almaty',
    });
    expect(dayResult.scope).toBe('admin_planner');
    expect(dayResult.item.instructors).toHaveLength(2);
    const badAvatarInstructor = dayResult.item.instructors.find(
      (instructor) => instructor.instructorId === badAvatarInstructorId
    );
    expect(badAvatarInstructor).toMatchObject({
      instructorId: badAvatarInstructorId,
      name: 'Legacy Avatar Coach',
      isAvailable: true,
    });
    expect(badAvatarInstructor).not.toHaveProperty('avatarUrl');
    expect(
      dayResult.item.occupancy.some(
        (item) =>
          item.instructorId === badAvatarInstructorId &&
          item.occupancyKind === 'lesson_booking' &&
          item.bookingId === bookingId
      )
    ).toBe(true);
    expect(dayResult.item.occupancy.find((item) => item.bookingId === bookingId)).toMatchObject({
      participantId,
      payerAccountId: adminId,
      displayTitle: 'Planner Participant',
    });
    expect(dayResult.item.occupancy.find((item) => item.blockId === blockId)).toMatchObject({
      occupancyKind: 'availability_block',
      instructorId,
      blockKind: 'break',
      notes: 'Lunch',
    });

    const weekResult = await queryPlanner(handler, {
      scope: 'admin_planner',
      localDate: '2026-09-01',
      view: 'week',
      timeZone: 'Asia/Almaty',
      windowDays: 62,
    });
    expect(weekResult.scope).toBe('admin_planner');
    expect(weekResult.item.instructors).toHaveLength(2);
    expect(
      weekResult.item.instructors.some(
        (instructor) => instructor.instructorId === badAvatarInstructorId
      )
    ).toBe(true);
    expect(
      weekResult.item.occupancy.some((item) => item.instructorId === badAvatarInstructorId)
    ).toBe(true);
  });

  it('returns the same availability block for day and week planner windows', async () => {
    const handler = createQueryAdminPlannerReadModelsHandler(
      fakeFirestore(seedWithBadAvatarInstructor())
    );
    const dayResult = await queryPlanner(handler, {
      scope: 'admin_planner',
      localDate: '2026-09-01',
      view: 'day',
      timeZone: 'Asia/Almaty',
    });
    const weekResult = await queryPlanner(handler, {
      scope: 'admin_planner',
      localDate: '2026-09-01',
      view: 'week',
      timeZone: 'Asia/Almaty',
    });
    const dayBlock = dayResult.item.occupancy.find((item) => item.blockId === blockId);
    const weekBlock = weekResult.item.occupancy.find((item) => item.blockId === blockId);
    expect(dayBlock).toMatchObject({
      occupancyKind: 'availability_block',
      blockKind: 'break',
      instructorId,
      localDate: '2026-09-01',
      localTime: '11:00',
    });
    expect(weekBlock).toEqual(dayBlock);
  });
});
