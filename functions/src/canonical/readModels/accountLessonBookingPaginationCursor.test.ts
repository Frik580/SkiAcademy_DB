import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  encodeLessonBookingReadModelCursor,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import {
  InvalidLessonBookingReadCursorError,
  loadAuthorizedAccountBookings,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';

const accountId = AccountIdSchema.parse('account_cursor_tie_01');
const participantId = ParticipantIdSchema.parse('participant_cursor_tie_01');
const managementId = ParticipantManagementIdSchema.parse('participant_management_cursor_tie_01');
const instructorId = InstructorIdSchema.parse('instructor_cursor_tie_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const historyNow = new Date('2026-06-01T00:00:00.000Z');
const hotNow = new Date('2026-03-01T08:00:00.000Z');
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_cursor_tie',
    lastChangedByCommandId: 'command_cursor_tie',
    correlationId: 'correlation_cursor_tie',
  },
};

type BookingSeed = {
  readonly bookingId: string;
  readonly updatedAt: { readonly seconds: number; readonly nanoseconds: number };
  readonly startsAt: { readonly seconds: number; readonly nanoseconds: number };
  readonly endsAt: { readonly seconds: number; readonly nanoseconds: number };
  readonly lifecycleStatus?: 'completed' | 'confirmed';
};

function historyInterval(index: number): {
  readonly startsAt: { readonly seconds: number; readonly nanoseconds: number };
  readonly endsAt: { readonly seconds: number; readonly nanoseconds: number };
} {
  const startsAt = timestampFromDate(new Date(Date.UTC(2026, 1, 1, 9, 0, index)));
  const endsAt = timestampFromDate(new Date(Date.UTC(2026, 1, 1, 10, 0, index)));
  return { startsAt, endsAt };
}

function createFixtureFirestore(bookings: readonly BookingSeed[]): Firestore {
  const docs = new Map<string, Record<string, unknown>>();
  const seed = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
  };

  seed(`users/${accountId}`, {
    accountId,
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`participant_management/${managementId}`, {
    participantManagementId: managementId,
    accountId,
    participantId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    ...metadata,
  });
  seed(`participants/${participantId}`, {
    participantId,
    displayName: 'Cursor Student',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    ...metadata,
  });
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    name: 'Cursor Coach',
    pricePerHourKZT: 10_000,
  });

  for (const booking of bookings) {
    const bookingId = BookingIdSchema.parse(booking.bookingId);
    const occurrenceId = OccurrenceIdSchema.parse(
      `occurrence_${booking.bookingId.replace(/^booking_/, '')}`
    );
    const lifecycleStatus = booking.lifecycleStatus ?? 'completed';
    seed(`bookings/${bookingId}`, {
      bookingId,
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId },
      },
      party: { kind: 'individual', participantIds: [participantId] },
      occurrence: {
        occurrenceId,
        instructorId,
        interval: { startsAt: booking.startsAt, endsAt: booking.endsAt },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [participantId], frozenAt: booking.startsAt },
      },
      lifecycle:
        lifecycleStatus === 'completed'
          ? { status: 'completed', completedAt: booking.endsAt }
          : { status: 'confirmed' },
      paymentId: paymentIdFromBookingId(bookingId),
      payerAccountId: accountId,
      revision: 1,
      createdAt: decidedAt,
      updatedAt: booking.updatedAt,
      audit: metadata.audit,
    });
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

async function drainAccountHistory(
  firestore: Firestore,
  pageSize: number,
  options: { readonly initialCursor?: string } = {}
): Promise<string[]> {
  const ids: string[] = [];
  let cursor = options.initialCursor;
  for (;;) {
    const page = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'account_history',
        pageSize,
        ...(cursor ? { cursor } : {}),
      },
      { accountId, now: historyNow }
    );
    ids.push(...page.items.map((item) => item.bookingId));
    if (!page.hasMore) {
      expect(page.nextCursor).toBeUndefined();
      break;
    }
    expect(page.nextCursor).toBeTruthy();
    cursor = page.nextCursor;
  }
  return ids;
}

describe('T32.9R.R1A account lesson pagination cursor tie-break', () => {
  it('1. same updatedAt timestamp: pageSize 2 yields A,B then C,D with no dupes/omissions', async () => {
    const sameUpdatedAt = timestampFromDate(new Date('2026-02-15T12:00:00.000Z'));
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_a',
        updatedAt: sameUpdatedAt,
        ...historyInterval(1),
      },
      {
        bookingId: 'booking_b',
        updatedAt: sameUpdatedAt,
        ...historyInterval(2),
      },
      {
        bookingId: 'booking_c',
        updatedAt: sameUpdatedAt,
        ...historyInterval(3),
      },
      {
        bookingId: 'booking_d',
        updatedAt: sameUpdatedAt,
        ...historyInterval(4),
      },
    ]);

    const page1 = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 2 },
      { accountId, now: historyNow }
    );
    expect(page1.items.map((item) => item.bookingId)).toEqual(['booking_a', 'booking_b']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 2, cursor: page1.nextCursor },
      { accountId, now: historyNow }
    );
    expect(page2.items.map((item) => item.bookingId)).toEqual(['booking_c', 'booking_d']);
    expect(page2.hasMore).toBe(false);

    const drained = [...page1.items, ...page2.items].map((item) => item.bookingId);
    expect(new Set(drained).size).toBe(4);
    expect(drained).toEqual(['booking_a', 'booking_b', 'booking_c', 'booking_d']);
  });

  it('2. same seconds, different nanoseconds keep DESC nanos then ASC bookingId', async () => {
    const baseSeconds = timestampFromDate(new Date('2026-02-16T12:00:00.000Z')).seconds;
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_nano_a',
        updatedAt: { seconds: baseSeconds, nanoseconds: 50 },
        ...historyInterval(1),
      },
      {
        bookingId: 'booking_nano_b',
        updatedAt: { seconds: baseSeconds, nanoseconds: 200 },
        ...historyInterval(2),
      },
      {
        bookingId: 'booking_nano_c',
        updatedAt: { seconds: baseSeconds, nanoseconds: 200 },
        ...historyInterval(3),
      },
    ]);

    const drained = await drainAccountHistory(firestore, 1);
    expect(drained).toEqual(['booking_nano_b', 'booking_nano_c', 'booking_nano_a']);
  });

  it('3. different seconds keep updatedAt DESC', async () => {
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_sec_old',
        updatedAt: timestampFromDate(new Date('2026-02-10T12:00:00.000Z')),
        ...historyInterval(1),
      },
      {
        bookingId: 'booking_sec_new',
        updatedAt: timestampFromDate(new Date('2026-02-12T12:00:00.000Z')),
        ...historyInterval(2),
      },
      {
        bookingId: 'booking_sec_mid',
        updatedAt: timestampFromDate(new Date('2026-02-11T12:00:00.000Z')),
        ...historyInterval(3),
      },
    ]);

    const drained = await drainAccountHistory(firestore, 2);
    expect(drained).toEqual(['booking_sec_new', 'booking_sec_mid', 'booking_sec_old']);
  });

  it('4. multi-page drain equals one-shot sorted authorized dataset', async () => {
    const baseUpdatedAt = timestampFromDate(new Date('2026-02-20T12:00:00.000Z'));
    const bookings: BookingSeed[] = [];
    for (let index = 0; index < 7; index += 1) {
      const suffix = String.fromCharCode('a'.charCodeAt(0) + index);
      bookings.push({
        bookingId: `booking_drain_${suffix}`,
        updatedAt: {
          seconds: baseUpdatedAt.seconds - Math.floor(index / 2),
          nanoseconds: index % 2 === 0 ? 500_000_000 : 100_000_000,
        },
        ...historyInterval(index + 1),
      });
    }
    const firestore = createFixtureFirestore(bookings);
    const oneShot = await loadAuthorizedAccountBookings(firestore, accountId);
    const oneShotIds = oneShot.map((booking) => booking.bookingId);
    expect(oneShotIds.length).toBe(7);
    const drained = await drainAccountHistory(firestore, 2);
    expect(drained).toEqual(oneShotIds);
    expect(new Set(drained).size).toBe(drained.length);
  });

  it('5. legacy cursor without scope remains compatible for account_history', async () => {
    const sameUpdatedAt = timestampFromDate(new Date('2026-02-18T12:00:00.000Z'));
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_legacy_a',
        updatedAt: sameUpdatedAt,
        ...historyInterval(1),
      },
      {
        bookingId: 'booking_legacy_b',
        updatedAt: sameUpdatedAt,
        ...historyInterval(2),
      },
      {
        bookingId: 'booking_legacy_c',
        updatedAt: sameUpdatedAt,
        ...historyInterval(3),
      },
    ]);

    const legacyCursor = encodeLessonBookingReadModelCursor({
      updatedAtSeconds: sameUpdatedAt.seconds,
      updatedAtNanoseconds: sameUpdatedAt.nanoseconds,
      bookingId: BookingIdSchema.parse('booking_legacy_a'),
    });

    const page = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 10, cursor: legacyCursor },
      { accountId, now: historyNow }
    );
    expect(page.items.map((item) => item.bookingId)).toEqual([
      'booking_legacy_b',
      'booking_legacy_c',
    ]);
  });

  it('6. account_hot membership / pagination regression unchanged', async () => {
    const hotUpdatedAt = timestampFromDate(new Date('2026-02-20T00:00:00.000Z'));
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_hot_a',
        updatedAt: hotUpdatedAt,
        startsAt: timestampFromDate(new Date('2026-03-01T10:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-03-01T11:00:00.000Z')),
        lifecycleStatus: 'confirmed',
      },
      {
        bookingId: 'booking_hot_b',
        updatedAt: hotUpdatedAt,
        startsAt: timestampFromDate(new Date('2026-03-01T12:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-03-01T13:00:00.000Z')),
        lifecycleStatus: 'confirmed',
      },
      {
        bookingId: 'booking_hist_only',
        updatedAt: hotUpdatedAt,
        startsAt: timestampFromDate(new Date('2026-02-01T10:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-02-01T11:00:00.000Z')),
        lifecycleStatus: 'completed',
      },
    ]);

    const hot = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_hot', pageSize: 1 },
      { accountId, now: hotNow }
    );
    expect(hot.items.map((item) => item.bookingId)).toEqual(['booking_hot_a']);
    expect(hot.hasMore).toBe(true);

    const hotPage2 = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_hot', pageSize: 1, cursor: hot.nextCursor },
      { accountId, now: hotNow }
    );
    expect(hotPage2.items.map((item) => item.bookingId)).toEqual(['booking_hot_b']);
    expect(hotPage2.hasMore).toBe(false);

    const history = await queryLessonBookingReadModels(
      firestore,
      { scope: 'account_history', pageSize: 10 },
      { accountId, now: hotNow }
    );
    expect(history.items.map((item) => item.bookingId)).toEqual(['booking_hist_only']);
  });

  it('7. malformed cursor behavior unchanged', async () => {
    const firestore = createFixtureFirestore([
      {
        bookingId: 'booking_malformed_01',
        updatedAt: timestampFromDate(new Date('2026-02-19T12:00:00.000Z')),
        ...historyInterval(1),
      },
    ]);

    await expect(
      queryLessonBookingReadModels(
        firestore,
        { scope: 'account_history', pageSize: 10, cursor: 'not-a-cursor' },
        { accountId, now: historyNow }
      )
    ).rejects.toBeInstanceOf(InvalidLessonBookingReadCursorError);
  });
});
