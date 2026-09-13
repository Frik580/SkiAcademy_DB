import { describe, expect, it } from 'vitest';
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
import type { Firestore } from 'firebase-admin/firestore';
import { queryLessonBookingReadModels } from './lessonBookingReadModels';

const accountId = AccountIdSchema.parse('account_cal_month_01');
const otherAccountId = AccountIdSchema.parse('account_cal_month_02');
const participantId = ParticipantIdSchema.parse('participant_cal_month_01');
const otherParticipantId = ParticipantIdSchema.parse('participant_cal_month_02');
const managementId = ParticipantManagementIdSchema.parse('management_cal_month_01');
const otherManagementId = ParticipantManagementIdSchema.parse('management_cal_month_02');
const instructorId = InstructorIdSchema.parse('instructor_cal_month_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_cal_month',
    lastChangedByCommandId: 'command_cal_month',
    correlationId: 'correlation_cal_month',
  },
};

const rangeStart = timestampFromDate(new Date('2026-09-01T00:00:00.000Z'));
const rangeEnd = timestampFromDate(new Date('2026-10-01T00:00:00.000Z'));

const bookingIds = {
  aug31: BookingIdSchema.parse('booking_cal_aug31'),
  sepOverlap: BookingIdSchema.parse('booking_cal_sep_overlap'),
  sep1: BookingIdSchema.parse('booking_cal_sep01'),
  sep15: BookingIdSchema.parse('booking_cal_sep15'),
  sep30: BookingIdSchema.parse('booking_cal_sep30'),
  oct1: BookingIdSchema.parse('booking_cal_oct01'),
  completed: BookingIdSchema.parse('booking_cal_sep_completed'),
  noShow: BookingIdSchema.parse('booking_cal_sep_noshow'),
  cancelled: BookingIdSchema.parse('booking_cal_sep_cancelled'),
  otherAccount: BookingIdSchema.parse('booking_cal_sep_other'),
} as const;

function createCalendarMonthFirestore(): {
  firestore: Firestore;
  scannedBookingIds: string[];
} {
  const docs = new Map<string, Record<string, unknown>>();
  const scannedBookingIds: string[] = [];
  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  const seedAccount = (
    nextAccountId: typeof accountId | typeof otherAccountId,
    nextParticipantId: typeof participantId | typeof otherParticipantId,
    nextManagementId: typeof managementId | typeof otherManagementId,
    displayName: string
  ) => {
    seed(`users/${nextAccountId}`, {
      accountId: nextAccountId,
      lifecycle: { status: 'active' },
      ...metadata,
    });
    seed(`participant_management/${nextManagementId}`, {
      participantManagementId: nextManagementId,
      accountId: nextAccountId,
      participantId: nextParticipantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      ...metadata,
    });
    seed(`participants/${nextParticipantId}`, {
      participantId: nextParticipantId,
      displayName,
      age: { kind: 'age_years', years: 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: nextManagementId },
      lifecycle: { status: 'active' },
      ...metadata,
    });
  };

  seedAccount(accountId, participantId, managementId, 'Calendar Student');
  seedAccount(otherAccountId, otherParticipantId, otherManagementId, 'Other Student');
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    name: 'Calendar Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });

  const seedBooking = (input: {
    readonly bookingId: (typeof bookingIds)[keyof typeof bookingIds];
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly lifecycle:
      | { status: 'confirmed' }
      | { status: 'completed'; completedAt: Date }
      | { status: 'no_show'; noShowAt: Date }
      | { status: 'cancelled'; cancelledAt: Date };
    readonly ownerAccountId?: typeof accountId | typeof otherAccountId;
    readonly ownerParticipantId?: typeof participantId | typeof otherParticipantId;
  }) => {
    const startsAt = timestampFromDate(input.startsAt);
    const endsAt = timestampFromDate(input.endsAt);
    const ownerAccountId = input.ownerAccountId ?? accountId;
    const ownerParticipantId = input.ownerParticipantId ?? participantId;
    const lifecycle =
      input.lifecycle.status === 'completed'
          ? {
              status: 'completed' as const,
              completedAt: timestampFromDate(input.lifecycle.completedAt),
            }
          : input.lifecycle.status === 'no_show'
            ? { status: 'no_show' as const, noShowAt: timestampFromDate(input.lifecycle.noShowAt) }
            : input.lifecycle.status === 'cancelled'
              ? {
                  status: 'cancelled' as const,
                  cancelledAt: timestampFromDate(input.lifecycle.cancelledAt),
                  reasonCode: 'account_owner_cancelled' as const,
                }
              : { status: 'confirmed' as const };
    seed(`bookings/${input.bookingId}`, {
      bookingId: input.bookingId,
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: ownerAccountId },
      },
      party: { kind: 'individual', participantIds: [ownerParticipantId] },
      occurrence: {
        occurrenceId: OccurrenceIdSchema.parse(`occurrence_${input.bookingId}`),
        instructorId,
        interval: { startsAt, endsAt },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [ownerParticipantId] },
      },
      lifecycle,
      paymentId: paymentIdFromBookingId(input.bookingId),
      payerAccountId: ownerAccountId,
      ...metadata,
      updatedAt: endsAt,
    });
    seed(`payments/${paymentIdFromBookingId(input.bookingId)}`, {
      paymentId: paymentIdFromBookingId(input.bookingId),
      payerAccountId: ownerAccountId,
      paymentStatus: 'paid',
      ...metadata,
    });
  };

  seedBooking({
    bookingId: bookingIds.aug31,
    startsAt: new Date('2026-08-31T12:00:00.000Z'),
    endsAt: new Date('2026-08-31T13:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.sepOverlap,
    startsAt: new Date('2026-08-31T23:30:00.000Z'),
    endsAt: new Date('2026-09-01T00:30:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.sep1,
    startsAt: new Date('2026-09-01T09:00:00.000Z'),
    endsAt: new Date('2026-09-01T10:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.sep15,
    startsAt: new Date('2026-09-15T09:00:00.000Z'),
    endsAt: new Date('2026-09-15T10:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.sep30,
    startsAt: new Date('2026-09-30T22:00:00.000Z'),
    endsAt: new Date('2026-09-30T23:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.oct1,
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-10-01T01:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
  });
  seedBooking({
    bookingId: bookingIds.completed,
    startsAt: new Date('2026-09-10T09:00:00.000Z'),
    endsAt: new Date('2026-09-10T10:00:00.000Z'),
    lifecycle: { status: 'completed', completedAt: new Date('2026-09-10T10:00:00.000Z') },
  });
  seedBooking({
    bookingId: bookingIds.noShow,
    startsAt: new Date('2026-09-12T09:00:00.000Z'),
    endsAt: new Date('2026-09-12T10:00:00.000Z'),
    lifecycle: { status: 'no_show', noShowAt: new Date('2026-09-12T10:00:00.000Z') },
  });
  seedBooking({
    bookingId: bookingIds.cancelled,
    startsAt: new Date('2026-09-20T09:00:00.000Z'),
    endsAt: new Date('2026-09-20T10:00:00.000Z'),
    lifecycle: { status: 'cancelled', cancelledAt: new Date('2026-09-19T09:00:00.000Z') },
  });
  seedBooking({
    bookingId: bookingIds.otherAccount,
    startsAt: new Date('2026-09-18T09:00:00.000Z'),
    endsAt: new Date('2026-09-18T10:00:00.000Z'),
    lifecycle: { status: 'confirmed' },
    ownerAccountId: otherAccountId,
    ownerParticipantId: otherParticipantId,
  });

  const getNestedField = (data: Record<string, unknown>, field: string): unknown => {
    let current: unknown = data;
    for (const part of field.split('.')) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  const matches = (data: Record<string, unknown>, field: string, op: string, value: unknown) => {
    const fieldValue = getNestedField(data, field);
    if (op === 'array-contains') {
      return Array.isArray(fieldValue) && fieldValue.includes(value);
    }
    if (op === 'array-contains-any' && Array.isArray(value)) {
      return Array.isArray(fieldValue) && fieldValue.some((entry) => value.includes(entry));
    }
    if (op === '==') return fieldValue === value;
    if (typeof fieldValue !== 'number' || typeof value !== 'number') {
      throw new Error(`Unsupported fixture operator: ${op}`);
    }
    if (op === '>=') return fieldValue >= value;
    if (op === '>') return fieldValue > value;
    if (op === '<=') return fieldValue <= value;
    if (op === '<') return fieldValue < value;
    throw new Error(`Unsupported fixture operator: ${op}`);
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
        documents.filter(({ data }) => matches(data, field, op, value)),
        maximum
      ),
    limit: (value: number) => query(collectionName, documents, value),
    get: async () => {
      const sliced = documents.slice(0, maximum);
      if (collectionName === 'bookings') {
        for (const document of sliced) {
          scannedBookingIds.push(document.id);
        }
      }
      return {
        docs: sliced.map(({ id, data }) => ({ id, data: () => data })),
      };
    },
  });

  const getDoc = async (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').at(-1) ?? path,
      exists: data !== undefined,
      data: () => data,
    };
  };

  const firestore = {
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
  } as unknown as Firestore;

  return { firestore, scannedBookingIds };
}

describe('account_calendar_month lesson booking read model', () => {
  it('returns authorized September/intersecting bookings and skips other-month and other-account rows', async () => {
    const { firestore, scannedBookingIds } = createCalendarMonthFirestore();
    const result = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'account_calendar_month',
        rangeStart,
        rangeEnd,
      },
      { accountId, now: new Date('2026-09-20T00:00:00.000Z') }
    );

    expect(result.scope).toBe('account_calendar_month');
    expect(result.hasMore).toBe(false);
    expect(result.items.map((item) => item.bookingId).sort()).toEqual(
      [
        bookingIds.sepOverlap,
        bookingIds.sep1,
        bookingIds.sep15,
        bookingIds.completed,
        bookingIds.noShow,
        bookingIds.cancelled,
        bookingIds.sep30,
      ].sort()
    );
    expect(result.items.some((item) => item.bookingId === bookingIds.aug31)).toBe(false);
    expect(result.items.some((item) => item.bookingId === bookingIds.oct1)).toBe(false);
    expect(result.items.some((item) => item.bookingId === bookingIds.otherAccount)).toBe(false);
    expect(scannedBookingIds).not.toContain(bookingIds.oct1);
    expect(scannedBookingIds).not.toContain(bookingIds.otherAccount);

    const statuses = new Map(result.items.map((item) => [item.bookingId, item.lifecycle.status]));
    expect(statuses.get(bookingIds.sep1)).toBe('confirmed');
    expect(statuses.get(bookingIds.completed)).toBe('completed');
    expect(statuses.get(bookingIds.noShow)).toBe('no_show');
    expect(statuses.get(bookingIds.cancelled)).toBe('cancelled');
  });

  it('does not return another account calendar month for a different authorized account', async () => {
    const { firestore } = createCalendarMonthFirestore();
    const result = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'account_calendar_month',
        rangeStart,
        rangeEnd,
      },
      { accountId: otherAccountId, now: new Date('2026-09-20T00:00:00.000Z') }
    );
    expect(result.items.map((item) => item.bookingId)).toEqual([bookingIds.otherAccount]);
  });
});
