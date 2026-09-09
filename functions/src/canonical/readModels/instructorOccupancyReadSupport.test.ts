import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
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
import { readRepoFile } from '../../../../tests/helpers/readRepoFile';
import { queryInstructorOccupancyReadModels } from './instructorOccupancyReadModels';
import {
  instructorOccupancyWindow,
  loadInstructorOccupancyItems,
} from './instructorOccupancyReadSupport';

const instructorA = InstructorIdSchema.parse('instructor_occupancy_a');
const instructorB = InstructorIdSchema.parse('instructor_occupancy_b');
const bookingA = BookingIdSchema.parse('booking_occupancy_a');
const bookingB = BookingIdSchema.parse('booking_occupancy_b');
const blockId = AdministrativeAvailabilityBlockIdSchema.parse('block_occupancy_a');
const participantId = ParticipantIdSchema.parse('participant_occupancy_a');
const participantTwoId = ParticipantIdSchema.parse('participant_occupancy_b');
const correlationId = CorrelationIdSchema.parse('correlation_occupancy_support');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const lessonStart = timestampFromDate(new Date('2026-09-10T04:00:00.000Z'));
const lessonEnd = timestampFromDate(new Date('2026-09-10T05:00:00.000Z'));
const localDate = '2026-09-10';
const timeZone = 'Asia/Almaty';

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
  const equalityFilters: Array<{ field: string; value: unknown }> = [];
  const arrayContainsFilters: Array<{ field: string; value: unknown }> = [];
  const chain = {
    where: (field: string, operator: string, value: unknown) => {
      if (field === rangeField) {
        if (operator === '>=') rangeStart = value as number;
        if (operator === '<') rangeEnd = value as number;
      } else if (operator === '==') {
        equalityFilters.push({ field, value });
      } else if (operator === 'array-contains') {
        arrayContainsFilters.push({ field, value });
      }
      return chain;
    },
    orderBy: () => chain,
    limit: () => ({
      get: async () =>
        snapshot(
          entries().filter(([, data]) => {
            const seconds = nestedValue(data, rangeField);
            const inRange =
              typeof seconds === 'number' && seconds >= rangeStart && seconds < rangeEnd;
            const matchesEquality = equalityFilters.every(({ field, value }) =>
              Object.is(nestedValue(data, field), value)
            );
            const matchesArrayContains = arrayContainsFilters.every(({ field, value }) => {
              const actual = nestedValue(data, field);
              return Array.isArray(actual) && actual.includes(value);
            });
            return inRange && matchesEquality && matchesArrayContains;
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
      path === 'bookings' ? 'occurrence.interval.startsAt.seconds' : 'interval.startsAt.seconds';
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

function bookingForInstructor(
  bookingId: typeof bookingA,
  instructorId: typeof instructorA,
  lifecycleStatus: 'confirmed' | 'completed' | 'no_show' | 'cancelled' = 'confirmed'
) {
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: 'account_occupancy_support' },
    },
    party: {
      kind: 'individual',
      participantIds: [participantId],
    },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse(`occurrence_${bookingId}`),
      instructorId,
      interval: {
        startsAt: lessonStart,
        endsAt: lessonEnd,
      },
      timeZone,
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle:
      lifecycleStatus === 'completed'
        ? { status: 'completed', completedAt: createdAt }
        : lifecycleStatus === 'no_show'
          ? { status: 'no_show', noShowAt: createdAt }
          : lifecycleStatus === 'cancelled'
            ? {
                status: 'cancelled',
                cancelledAt: createdAt,
                reasonCode: 'administrator_cancelled',
              }
            : { status: lifecycleStatus },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: 'account_occupancy_support',
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  }) as unknown as Record<string, unknown>;
}

describe('instructorOccupancyReadSupport', () => {
  it('pushes instructorId into Firestore occupancy queries', () => {
    const source = readRepoFile(
      'functions/src/canonical/readModels/instructorOccupancyReadSupport.ts'
    );
    expect(source).toMatch(
      /\.where\(\s*['"]occurrence\.instructorId['"]\s*,\s*['"]==['"]\s*,\s*input\.instructorId/
    );
    expect(source).toMatch(
      /\.where\(\s*['"]instructorId['"]\s*,\s*['"]==['"]\s*,\s*input\.instructorId/
    );
    expect(source).toMatch(
      /\.where\(\s*['"]actualInstructorIds['"]\s*,\s*['"]array-contains['"]\s*,\s*input\.instructorId/
    );
  });

  it('filters occupancy to the requested instructor in memory', async () => {
    const firestore = fakeFirestore({
      [`bookings/${bookingA}`]: bookingForInstructor(bookingA, instructorA),
      [`bookings/${bookingB}`]: bookingForInstructor(bookingB, instructorB),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Anna',
      },
    });
    const window = instructorOccupancyWindow(localDate, timeZone, 1);
    const loaded = await loadInstructorOccupancyItems(firestore, {
      window,
      instructorId: instructorA,
    });
    expect(loaded.occupancy.map((item) => item.occupancyId)).toEqual([bookingA]);
  });

  it('hydrates every party participant into one instructor occupancy item', async () => {
    const multi = bookingForInstructor(bookingA, instructorA);
    const booking = multi as {
      party: { kind: string; participantIds: string[] };
      occurrence: { serviceParty: { participantIds: string[] } };
    };
    booking.party = {
      kind: 'family_group',
      participantIds: [participantId, participantTwoId],
    };
    booking.occurrence.serviceParty.participantIds = [participantId, participantTwoId];
    const firestore = fakeFirestore({
      [`bookings/${bookingA}`]: multi,
      [`participants/${participantId}`]: { participantId, displayName: 'Anna' },
      [`participants/${participantTwoId}`]: {
        participantId: participantTwoId,
        displayName: 'Boris',
      },
    });
    const loaded = await loadInstructorOccupancyItems(firestore, {
      window: instructorOccupancyWindow(localDate, timeZone, 1),
      instructorId: instructorA,
    });
    expect(loaded.occupancy).toHaveLength(1);
    expect(loaded.occupancy[0]).toMatchObject({
      displayTitle: 'Anna, Boris',
      participantIds: [participantId, participantTwoId],
      participantNames: ['Anna', 'Boris'],
    });
  });

  it('returns sanitized public occupancy for unauthenticated day scope', async () => {
    const firestore = fakeFirestore({
      [`instructors/${instructorA}`]: {
        id: instructorA,
        name: 'Coach A',
        pricePerHourKZT: 12_000,
        isAvailable: true,
      },
      [`bookings/${bookingA}`]: {
        ...bookingForInstructor(bookingA, instructorA),
        difficulty: 'intermediate',
        notes: 'private',
      },
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Anna Smith',
      },
      [`administrative_availability_blocks/${blockId}`]:
        AdministrativeAvailabilityBlockSchema.parse({
          blockId,
          instructorId: instructorA,
          kind: 'break',
          interval: {
            startsAt: timestampFromDate(new Date('2026-09-10T06:00:00.000Z')),
            endsAt: timestampFromDate(new Date('2026-09-10T07:00:00.000Z')),
          },
          timeZone,
          notes: 'admin only',
          lifecycle: 'active',
          scheduleRevision: 1,
          revision: 1,
          createdAt,
          updatedAt: createdAt,
        }) as unknown as Record<string, unknown>,
    });

    const result = await queryInstructorOccupancyReadModels(firestore, {
      scope: 'public_instructor_day',
      instructorId: instructorA,
      localDate,
      timeZone,
    });

    expect(result.scope).toBe('public_instructor_day');
    expect(result.item.occupancy.length).toBe(2);
    const lesson = result.item.occupancy.find((item) => item.occupancyKind === 'lesson_booking');
    expect(lesson?.displayTitle).toBe('Booked');
    expect(lesson?.participantId).toBeUndefined();
    expect(lesson?.participantIds).toBeUndefined();
    expect(lesson?.participantNames).toBeUndefined();
    expect(lesson?.payerAccountId).toBeUndefined();
    expect(lesson?.difficulty).toBeUndefined();
    expect(lesson?.notes).toBeUndefined();
    const block = result.item.occupancy.find((item) => item.occupancyKind === 'availability_block');
    expect(block?.displayTitle).toBe('Break');
    expect(block?.notes).toBeUndefined();
  });

  it('uses a single-day window for public instructor day scope', async () => {
    const firestore = fakeFirestore({
      [`instructors/${instructorA}`]: {
        id: instructorA,
        name: 'Coach A',
        pricePerHourKZT: 12_000,
        isAvailable: true,
      },
    });

    const result = await queryInstructorOccupancyReadModels(firestore, {
      scope: 'public_instructor_day',
      instructorId: instructorA,
      localDate,
      timeZone,
      windowDays: 7,
    });

    const windowSeconds = result.item.window.endsAt.seconds - result.item.window.startsAt.seconds;
    expect(windowSeconds).toBe(24 * 60 * 60);
  });

  it('includes completed and no_show only for admin planner visualization scope', async () => {
    const completed = bookingForInstructor(bookingA, instructorA, 'completed');
    const noShow = bookingForInstructor(bookingB, instructorA, 'no_show');
    const cancelled = bookingForInstructor(
      BookingIdSchema.parse('booking_occupancy_cancelled'),
      instructorA,
      'cancelled'
    );
    const firestore = fakeFirestore({
      [`bookings/${bookingA}`]: completed,
      [`bookings/${bookingB}`]: noShow,
      [`bookings/booking_occupancy_cancelled`]: cancelled,
      [`participants/${participantId}`]: { participantId, displayName: 'Anna' },
    });
    const window = instructorOccupancyWindow(localDate, timeZone, 1);

    const capacityOnly = await loadInstructorOccupancyItems(firestore, { window, instructorId: instructorA });
    expect(capacityOnly.occupancy).toHaveLength(0);

    const plannerView = await loadInstructorOccupancyItems(firestore, {
      window,
      instructorId: instructorA,
      bookingScope: 'admin_planner_visualization',
    });
    expect(plannerView.occupancy.map((item) => item.bookingId)).toEqual([bookingA, bookingB]);
    expect(plannerView.occupancy.map((item) => item.lifecycleStatus)).toEqual(['completed', 'no_show']);
  });

  it('accepts legacy bookings without difficulty or notes', async () => {
    const firestore = fakeFirestore({
      [`instructors/${instructorA}`]: {
        id: instructorA,
        name: 'Coach A',
        pricePerHourKZT: 12_000,
        isAvailable: true,
      },
      [`bookings/${bookingA}`]: bookingForInstructor(bookingA, instructorA),
      [`participants/${participantId}`]: {
        participantId,
        displayName: 'Anna',
      },
    });

    const result = await queryInstructorOccupancyReadModels(firestore, {
      scope: 'public_instructor_day',
      instructorId: instructorA,
      localDate,
      timeZone,
    });
    expect(result.item.occupancy.length).toBe(1);
  });
});
