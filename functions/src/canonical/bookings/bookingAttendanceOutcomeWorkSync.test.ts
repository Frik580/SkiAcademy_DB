import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  addMillisecondsToCanonicalTimestamp,
  timestampFromDate,
  type Booking,
} from '@ski-academy/shared-domain';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';
import {
  completeBookingAttendanceOutcomeWork,
  parseBookingAttendanceOutcomeWork,
  pendingBookingAttendanceOutcomeWork,
} from './bookingAttendanceOutcomeWork';
import {
  bookingWriteRequiresAttendanceOutcomeWorkReconciliation,
  syncLessonBookingAttendanceOutcomeWorkForBookingWrite,
} from './bookingAttendanceOutcomeWorkSync';

const booking = canonicalBookingCollaborationFixtures.individualBooking;

function raw(value: Booking): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function withRevision(value: Booking, revision: number): Booking {
  return {
    ...value,
    revision,
    updatedAt: timestampFromDate(new Date(Date.UTC(2026, 0, 1, 0, 0, revision))),
  } as Booking;
}

function createFirestoreHarness(initial: Readonly<Record<string, Record<string, unknown>>>) {
  const documents = new Map(Object.entries(initial));
  const operations = { reads: 0, writes: 0 };
  type Ref = Readonly<{ path: string }>;
  type Snapshot = Readonly<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  type Transaction = Readonly<{
    get: (ref: Ref) => Promise<Snapshot>;
    set: (ref: Ref, value: Record<string, unknown>) => void;
    delete: (ref: Ref) => void;
  }>;
  const firestore = {
    doc(path: string): Ref {
      return { path };
    },
    async runTransaction<T>(handler: (transaction: Transaction) => Promise<T>): Promise<T> {
      return handler({
        async get(ref) {
          operations.reads += 1;
          const value = documents.get(ref.path);
          return { exists: value !== undefined, data: () => value };
        },
        set(ref, value) {
          operations.writes += 1;
          documents.set(ref.path, value);
        },
        delete(ref) {
          operations.writes += 1;
          documents.delete(ref.path);
        },
      });
    },
  } as unknown as Firestore;

  return {
    documents,
    firestore,
    operations,
    resetOperations() {
      operations.reads = 0;
      operations.writes = 0;
    },
  };
}

describe('Booking attendance outcome trigger scheduling guard', () => {
  it('skips an unrelated Booking update without touching Firestore', async () => {
    const before = withRevision(booking, 1);
    const after = {
      ...withRevision(booking, 2),
      notes: 'metadata-only change',
    } as Booking;
    const firestore = new Proxy(
      {},
      {
        get() {
          throw new Error('Firestore must not be accessed for scheduling-equivalent updates.');
        },
      }
    ) as Firestore;

    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(before),
        afterData: raw(after),
      })
    ).resolves.toBe('skipped');
  });

  it('treats endsAt, schedule revision, occurrence, and confirmed eligibility as relevant', () => {
    const before = withRevision(booking, 1);
    const changedEndsAt = {
      ...withRevision(booking, 2),
      occurrence: {
        ...booking.occurrence,
        interval: {
          ...booking.occurrence.interval,
          endsAt: timestampFromDate(new Date('2026-01-15T12:30:00.000Z')),
        },
      },
    } as Booking;
    const changedScheduleRevision = {
      ...withRevision(booking, 2),
      occurrence: { ...booking.occurrence, scheduleRevision: 2 },
    } as Booking;
    const changedOccurrence = {
      ...withRevision(booking, 2),
      occurrence: {
        ...booking.occurrence,
        occurrenceId: `${booking.occurrence.occurrenceId}_next`,
      },
    } as Booking;
    const terminal = {
      ...withRevision(booking, 2),
      lifecycle: {
        status: 'completed',
        completedAt: timestampFromDate(new Date('2026-01-01T00:00:02.000Z')),
      },
    } as Booking;
    const noShow = {
      ...withRevision(booking, 2),
      lifecycle: {
        status: 'no_show',
        noShowAt: timestampFromDate(new Date('2026-01-01T00:00:02.000Z')),
      },
    } as Booking;
    const cancelled = {
      ...withRevision(booking, 2),
      lifecycle: {
        status: 'cancelled',
        cancelledAt: timestampFromDate(new Date('2026-01-01T00:00:02.000Z')),
        reasonCode: 'administrator_cancelled',
      },
    } as Booking;
    const pendingCancellation = {
      ...withRevision(booking, 2),
      lifecycle: {
        status: 'pending_cancellation',
        requestedAt: timestampFromDate(new Date('2026-01-01T00:00:02.000Z')),
      },
    } as Booking;

    for (const after of [
      changedEndsAt,
      changedScheduleRevision,
      changedOccurrence,
      terminal,
      noShow,
      cancelled,
      pendingCancellation,
    ]) {
      expect(
        bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
          rawBookingId: booking.bookingId,
          beforeData: raw(before),
          afterData: raw(after),
        })
      ).toBe(true);
    }
  });

  it('treats all ineligible lifecycle states as scheduling-equivalent', () => {
    const cancelled = {
      ...withRevision(booking, 2),
      lifecycle: {
        status: 'cancelled',
        cancelledAt: timestampFromDate(new Date('2026-01-01T00:00:02.000Z')),
        reasonCode: 'administrator_cancelled',
      },
    } as Booking;
    const completed = {
      ...withRevision(booking, 3),
      occurrence: {
        ...booking.occurrence,
        occurrenceId: `${booking.occurrence.occurrenceId}_ignored_while_ineligible`,
        scheduleRevision: 99,
        interval: {
          ...booking.occurrence.interval,
          endsAt: addMillisecondsToCanonicalTimestamp(
            booking.occurrence.interval.endsAt,
            60 * 60 * 1_000
          ),
        },
      },
      lifecycle: {
        status: 'completed',
        completedAt: timestampFromDate(new Date('2026-01-01T00:00:03.000Z')),
      },
    } as Booking;

    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: booking.bookingId,
        beforeData: raw(cancelled),
        afterData: raw(completed),
      })
    ).toBe(false);
    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: booking.bookingId,
        beforeData: raw(completed),
        afterData: raw(withRevision(booking, 4)),
      })
    ).toBe(true);
  });

  it('never skips create, delete, invalid snapshots, or a path identity mismatch', () => {
    const data = raw(withRevision(booking, 1));

    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: booking.bookingId,
        afterData: data,
      })
    ).toBe(true);
    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: booking.bookingId,
        beforeData: data,
      })
    ).toBe(true);
    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: booking.bookingId,
        beforeData: data,
        afterData: { invalid: true },
      })
    ).toBe(true);
    expect(
      bookingWriteRequiresAttendanceOutcomeWorkReconciliation({
        rawBookingId: 'booking_different',
        beforeData: data,
        afterData: data,
      })
    ).toBe(true);
  });

  it('keeps rev 12 projection authoritative when rev 10 and rev 11 events arrive late', async () => {
    const rev10 = withRevision(booking, 10);
    const rev11 = {
      ...withRevision(booking, 11),
      notes: 'metadata-only rev 11',
    } as Booking;
    const rev12 = {
      ...withRevision(booking, 12),
      occurrence: {
        ...booking.occurrence,
        occurrenceId: `${booking.occurrence.occurrenceId}_rev_12`,
        scheduleRevision: 12,
        interval: {
          ...booking.occurrence.interval,
          endsAt: addMillisecondsToCanonicalTimestamp(
            booking.occurrence.interval.endsAt,
            60 * 60 * 1_000
          ),
        },
      },
    } as Booking;
    const initialWork = pendingBookingAttendanceOutcomeWork(rev10, {
      deadlineId: 'outcome',
      workRevision: 1,
      updatedAt: rev10.updatedAt,
    });
    const bookingPath = `bookings/${booking.bookingId}`;
    const workPath = `booking_attendance_outcome_work/${booking.bookingId}`;
    const harness = createFirestoreHarness({
      [bookingPath]: raw(rev12),
      [workPath]: initialWork as unknown as Record<string, unknown>,
    });

    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(rev11),
        afterData: raw(rev12),
        now: new Date('2026-01-01T00:01:00.000Z'),
      })
    ).resolves.toBe('updated');
    expect(harness.operations).toEqual({ reads: 2, writes: 1 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      sourceBookingRevision: 12,
      sourceScheduleRevision: 12,
      sourceEndsAt: rev12.occurrence.interval.endsAt,
    });

    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(rev11),
        afterData: raw(rev12),
        now: new Date('2026-01-01T00:01:00.000Z'),
      })
    ).resolves.toBe('unchanged');
    expect(harness.operations).toEqual({ reads: 2, writes: 0 });

    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(withRevision({ ...booking, occurrence: rev12.occurrence } as Booking, 9)),
        afterData: raw(rev10),
        now: new Date('2026-01-01T00:01:01.000Z'),
      })
    ).resolves.toBe('unchanged');
    expect(harness.operations).toEqual({ reads: 2, writes: 0 });

    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(rev10),
        afterData: raw(rev11),
      })
    ).resolves.toBe('skipped');
    expect(harness.operations).toEqual({ reads: 0, writes: 0 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      sourceBookingRevision: 12,
      sourceScheduleRevision: 12,
    });
  });

  it('converges for delivery order rev 11 -> rev 12 -> rev 10', async () => {
    const rev10 = withRevision(booking, 10);
    const rev11 = {
      ...withRevision(booking, 11),
      notes: 'metadata-only rev 11',
    } as Booking;
    const rev12 = {
      ...withRevision(booking, 12),
      occurrence: {
        ...booking.occurrence,
        occurrenceId: `${booking.occurrence.occurrenceId}_rev_12_second_order`,
        scheduleRevision: 12,
        interval: {
          ...booking.occurrence.interval,
          endsAt: addMillisecondsToCanonicalTimestamp(
            booking.occurrence.interval.endsAt,
            2 * 60 * 60 * 1_000
          ),
        },
      },
    } as Booking;
    const bookingPath = `bookings/${booking.bookingId}`;
    const workPath = `booking_attendance_outcome_work/${booking.bookingId}`;
    const harness = createFirestoreHarness({
      [bookingPath]: raw(rev12),
      [workPath]: pendingBookingAttendanceOutcomeWork(rev10, {
        deadlineId: 'outcome',
        workRevision: 1,
        updatedAt: rev10.updatedAt,
      }) as unknown as Record<string, unknown>,
    });

    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(rev10),
        afterData: raw(rev11),
      })
    ).resolves.toBe('skipped');
    expect(harness.operations).toEqual({ reads: 0, writes: 0 });

    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(rev11),
        afterData: raw(rev12),
        now: new Date('2026-01-01T00:01:00.000Z'),
      })
    ).resolves.toBe('updated');
    expect(harness.operations).toEqual({ reads: 2, writes: 1 });

    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw({ ...rev10, occurrence: rev12.occurrence } as Booking),
        afterData: raw(rev10),
        now: new Date('2026-01-01T00:01:01.000Z'),
      })
    ).resolves.toBe('unchanged');
    expect(harness.operations).toEqual({ reads: 2, writes: 0 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      sourceBookingRevision: 12,
      sourceScheduleRevision: 12,
      sourceEndsAt: rev12.occurrence.interval.endsAt,
    });
  });

  it.each([
    {
      name: 'completed',
      lifecycle: {
        status: 'completed',
        completedAt: timestampFromDate(new Date('2026-01-01T00:00:31.000Z')),
      },
    },
    {
      name: 'no_show',
      lifecycle: {
        status: 'no_show',
        noShowAt: timestampFromDate(new Date('2026-01-01T00:00:31.000Z')),
      },
    },
    {
      name: 'cancelled',
      lifecycle: {
        status: 'cancelled',
        cancelledAt: timestampFromDate(new Date('2026-01-01T00:00:31.000Z')),
        reasonCode: 'administrator_cancelled',
      },
    },
    {
      name: 'pending_cancellation',
      lifecycle: {
        status: 'pending_cancellation',
        requestedAt: timestampFromDate(new Date('2026-01-01T00:00:31.000Z')),
      },
    },
  ])('completes stale pending work on confirmed -> $name', async ({ lifecycle }) => {
    const confirmed = withRevision(booking, 30);
    const ineligible = { ...withRevision(booking, 31), lifecycle } as Booking;
    const pending = pendingBookingAttendanceOutcomeWork(confirmed, {
      deadlineId: 'outcome',
      workRevision: 1,
      updatedAt: confirmed.updatedAt,
    });
    const bookingPath = `bookings/${booking.bookingId}`;
    const workPath = `booking_attendance_outcome_work/${booking.bookingId}`;
    const harness = createFirestoreHarness({
      [bookingPath]: raw(ineligible),
      [workPath]: pending as unknown as Record<string, unknown>,
    });

    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(confirmed),
        afterData: raw(ineligible),
        now: new Date('2026-01-01T00:00:31.000Z'),
      })
    ).resolves.toBe('updated');
    expect(harness.operations).toEqual({ reads: 2, writes: 1 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      status: 'complete',
      completedReason: 'lifecycle_ineligible',
      sourceBookingRevision: 31,
    });
  });

  it('clears terminal work, recreates it on confirmed re-entry, and deduplicates command follow-up', async () => {
    const confirmed = withRevision(booking, 20);
    const terminal = {
      ...withRevision(booking, 21),
      lifecycle: {
        status: 'completed',
        completedAt: timestampFromDate(new Date('2026-01-01T00:00:21.000Z')),
      },
    } as Booking;
    const pending = pendingBookingAttendanceOutcomeWork(confirmed, {
      deadlineId: 'outcome',
      workRevision: 1,
      updatedAt: confirmed.updatedAt,
    });
    const bookingPath = `bookings/${booking.bookingId}`;
    const workPath = `booking_attendance_outcome_work/${booking.bookingId}`;
    const harness = createFirestoreHarness({
      [bookingPath]: raw(terminal),
      [workPath]: pending as unknown as Record<string, unknown>,
    });

    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(confirmed),
        afterData: raw(terminal),
        now: new Date('2026-01-01T00:00:21.000Z'),
      })
    ).resolves.toBe('updated');
    expect(harness.operations).toEqual({ reads: 2, writes: 1 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      status: 'complete',
      completedReason: 'lifecycle_ineligible',
      sourceBookingRevision: 21,
    });

    const reentered = withRevision(booking, 22);
    harness.documents.set(bookingPath, raw(reentered));
    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(terminal),
        afterData: raw(reentered),
        now: new Date('2026-01-01T00:00:22.000Z'),
      })
    ).resolves.toBe('updated');
    expect(harness.operations).toEqual({ reads: 2, writes: 1 });
    expect(parseBookingAttendanceOutcomeWork(harness.documents.get(workPath))).toMatchObject({
      status: 'pending',
      sourceBookingRevision: 22,
    });

    const commandTerminal = {
      ...withRevision(booking, 23),
      lifecycle: {
        status: 'completed',
        completedAt: timestampFromDate(new Date('2026-01-01T00:00:23.000Z')),
      },
    } as Booking;
    const commandWork = completeBookingAttendanceOutcomeWork(commandTerminal, {
      completedReason: 'deadline_processed',
      workRevision: 4,
      updatedAt: commandTerminal.updatedAt,
    });
    harness.documents.set(bookingPath, raw(commandTerminal));
    harness.documents.set(workPath, commandWork as unknown as Record<string, unknown>);
    harness.resetOperations();
    await expect(
      syncLessonBookingAttendanceOutcomeWorkForBookingWrite(harness.firestore, {
        rawBookingId: booking.bookingId,
        beforeData: raw(reentered),
        afterData: raw(commandTerminal),
        now: new Date('2026-01-01T00:00:24.000Z'),
      })
    ).resolves.toBe('unchanged');
    expect(harness.operations).toEqual({ reads: 2, writes: 0 });
    expect(harness.documents.get(workPath)).toEqual(commandWork);
  });
});
