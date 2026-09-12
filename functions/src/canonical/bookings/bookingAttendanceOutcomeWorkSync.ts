import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingIdSchema,
  addMillisecondsToCanonicalTimestamp,
  attendanceIdFromBookingIdentity,
  compareCanonicalTimestamps,
  frozenServiceParticipantIds,
  missingAttendanceParticipantIds,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type Booking,
  type BookingId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { attendancePath, parseAttendance } from './attendanceStore';
import { parseBooking } from './bookingStore';
import {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  BookingAttendanceOutcomeWorkSchema,
  bookingAttendanceOutcomeDueAt,
  bookingAttendanceOutcomeWorkPath,
  completeBookingAttendanceOutcomeWork,
  parseBookingAttendanceOutcomeWork,
  pendingBookingAttendanceOutcomeWork,
  resolveLessonBookingAttendanceEnvelope,
  type BookingAttendanceOutcomeSweepDeadline,
  type BookingAttendanceOutcomeWork,
} from './bookingAttendanceOutcomeWork';

export const BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;
export const BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH =
  'system_migrations/booking_attendance_outcome_work_v1';

export type BookingAttendanceOutcomeWorkSyncOutcome =
  'created' | 'updated' | 'unchanged' | 'deleted' | 'blocked';

export type BookingAttendanceOutcomeWorkTriggerSyncOutcome =
  BookingAttendanceOutcomeWorkSyncOutcome | 'skipped';

export type AttendanceSchedulerRelevantState =
  | Readonly<{
      bookingId: BookingId;
      lifecycleEligible: false;
    }>
  | Readonly<{
      bookingId: BookingId;
      lifecycleEligible: true;
      occurrenceId: Booking['occurrence']['occurrenceId'];
      scheduleRevision: Booking['occurrence']['scheduleRevision'];
      endsAt: Booking['occurrence']['interval']['endsAt'];
    }>;

export interface BookingAttendanceOutcomeWorkBackfillResult {
  readonly scannedBookings: number;
  readonly outcomes: Readonly<Record<BookingAttendanceOutcomeWorkSyncOutcome, number>>;
  readonly cursor?: string;
  readonly truncated: boolean;
}

function sameTimestamp(
  left: Booking['occurrence']['interval']['endsAt'],
  right: Booking['occurrence']['interval']['endsAt']
): boolean {
  return left.seconds === right.seconds && left.nanoseconds === right.nanoseconds;
}

export function attendanceSchedulerRelevantState(
  booking: Booking
): AttendanceSchedulerRelevantState {
  if (booking.lifecycle.status !== 'confirmed') {
    return {
      bookingId: booking.bookingId,
      lifecycleEligible: false,
    };
  }

  return {
    bookingId: booking.bookingId,
    lifecycleEligible: true,
    occurrenceId: booking.occurrence.occurrenceId,
    scheduleRevision: booking.occurrence.scheduleRevision,
    endsAt: booking.occurrence.interval.endsAt,
  };
}

export function sameAttendanceSchedulerRelevantState(
  left: AttendanceSchedulerRelevantState,
  right: AttendanceSchedulerRelevantState
): boolean {
  if (left.bookingId !== right.bookingId) return false;
  if (!left.lifecycleEligible) return !right.lifecycleEligible;
  if (!right.lifecycleEligible) return false;
  return (
    left.occurrenceId === right.occurrenceId &&
    left.scheduleRevision === right.scheduleRevision &&
    sameTimestamp(left.endsAt, right.endsAt)
  );
}

export function bookingWriteRequiresAttendanceOutcomeWorkReconciliation(input: {
  readonly rawBookingId: string;
  readonly beforeData?: Record<string, unknown>;
  readonly afterData?: Record<string, unknown>;
}): boolean {
  if (!input.beforeData || !input.afterData) return true;

  const parsedBookingId = BookingIdSchema.safeParse(input.rawBookingId);
  const before = parseBooking(input.beforeData);
  const after = parseBooking(input.afterData);
  if (
    !parsedBookingId.success ||
    !before ||
    !after ||
    before.bookingId !== parsedBookingId.data ||
    after.bookingId !== parsedBookingId.data
  ) {
    return true;
  }

  return !sameAttendanceSchedulerRelevantState(
    attendanceSchedulerRelevantState(before),
    attendanceSchedulerRelevantState(after)
  );
}

function sameOccurrenceSchedule(work: BookingAttendanceOutcomeWork, booking: Booking): boolean {
  return (
    work.occurrenceId === booking.occurrence.occurrenceId &&
    work.sourceScheduleRevision === booking.occurrence.scheduleRevision &&
    sameTimestamp(work.sourceEndsAt, booking.occurrence.interval.endsAt)
  );
}

function nextWorkRevision(existing: BookingAttendanceOutcomeWork | undefined): number {
  return (existing?.workRevision ?? 0) + 1;
}

async function missingFrozenAttendanceParticipantIdsForWork(
  firestore: Firestore,
  transaction: FirebaseFirestore.Transaction,
  booking: Booking
): Promise<readonly ParticipantId[]> {
  const targetIds = frozenServiceParticipantIds(booking);
  if (!targetIds) return [];
  const facts = new Map<ParticipantId, { attendanceStatus: 'present' | 'absent' }>();
  for (const participantId of targetIds) {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: booking.occurrence.occurrenceId,
      participantId,
    });
    const snapshot = await transaction.get(firestore.doc(attendancePath(attendanceId)));
    const attendance = parseAttendance(
      snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
    );
    if (attendance) {
      facts.set(participantId, { attendanceStatus: attendance.attendanceStatus });
    }
  }
  return missingAttendanceParticipantIds(booking, facts);
}

function idempotencyPath(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: Booking['occurrence']['occurrenceId'];
  readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
}): string {
  const identity = resolveCommandIdempotencyIdentity(resolveLessonBookingAttendanceEnvelope(input));
  return identity.recordPath.startsWith('/') ? identity.recordPath.slice(1) : identity.recordPath;
}

async function chooseInitialWork(
  firestore: Firestore,
  transaction: FirebaseFirestore.Transaction,
  booking: Booking,
  existing: BookingAttendanceOutcomeWork | undefined,
  nowDate: Date,
  minimumEndsAt?: Booking['occurrence']['interval']['endsAt']
): Promise<BookingAttendanceOutcomeWork> {
  const now = timestampFromDate(nowDate);
  const workRevision = nextWorkRevision(existing);
  const endsAt = booking.occurrence.interval.endsAt;
  const instructorWindowEnd = bookingAttendanceOutcomeDueAt(
    booking,
    BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow
  );

  if (minimumEndsAt && compareCanonicalTimestamps(endsAt, minimumEndsAt) < 0) {
    return completeBookingAttendanceOutcomeWork(booking, {
      completedReason: 'legacy_lookback_expired',
      workRevision,
      updatedAt: now,
    });
  }

  if (compareCanonicalTimestamps(now, endsAt) < 0) {
    return pendingBookingAttendanceOutcomeWork(booking, {
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      workRevision,
      updatedAt: now,
    });
  }

  if (compareCanonicalTimestamps(now, instructorWindowEnd) >= 0) {
    const instructorIdempotency = await transaction.get(
      firestore.doc(
        idempotencyPath({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
          deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
        })
      )
    );
    return instructorIdempotency.exists
      ? completeBookingAttendanceOutcomeWork(booking, {
          completedReason: 'deadline_processed',
          workRevision,
          updatedAt: now,
        })
      : pendingBookingAttendanceOutcomeWork(booking, {
          deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
          workRevision,
          updatedAt: now,
        });
  }

  const outcomeIdempotency = await transaction.get(
    firestore.doc(
      idempotencyPath({
        bookingId: booking.bookingId,
        occurrenceId: booking.occurrence.occurrenceId,
        deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      })
    )
  );
  return outcomeIdempotency.exists
    ? pendingBookingAttendanceOutcomeWork(booking, {
        deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
        workRevision,
        updatedAt: now,
      })
    : pendingBookingAttendanceOutcomeWork(booking, {
        deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
        workRevision,
        updatedAt: now,
      });
}

export async function reconcileLessonBookingAttendanceOutcomeWork(
  firestore: Firestore,
  rawBookingId: string,
  nowDate: Date = new Date(),
  options: {
    readonly minimumEndsAt?: Booking['occurrence']['interval']['endsAt'];
  } = {}
): Promise<BookingAttendanceOutcomeWorkSyncOutcome> {
  const parsedBookingId = BookingIdSchema.safeParse(rawBookingId);
  if (!parsedBookingId.success) {
    return 'blocked';
  }
  const bookingId = parsedBookingId.data;
  const bookingRef = firestore.doc(`bookings/${bookingId}`);
  const workRef = firestore.doc(bookingAttendanceOutcomeWorkPath(bookingId));

  return firestore.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef);
    const workSnapshot = await transaction.get(workRef);
    const existing = parseBookingAttendanceOutcomeWork(
      workSnapshot.exists ? (workSnapshot.data() as Record<string, unknown>) : undefined
    );

    if (!bookingSnapshot.exists) {
      if (workSnapshot.exists) transaction.delete(workRef);
      return workSnapshot.exists ? 'deleted' : 'unchanged';
    }

    const booking = parseBooking(bookingSnapshot.data() as Record<string, unknown> | undefined);
    if (!booking || booking.bookingId !== bookingId) {
      const now = timestampFromDate(nowDate);
      transaction.set(workRef, {
        bookingId,
        status: 'blocked',
        blockedReason: 'invalid_booking',
        workRevision: (existing?.workRevision ?? 0) + 1,
        updatedAt: now,
      });
      return 'blocked';
    }

    const migrationExpired =
      booking.lifecycle.status === 'confirmed' &&
      options.minimumEndsAt !== undefined &&
      compareCanonicalTimestamps(booking.occurrence.interval.endsAt, options.minimumEndsAt) < 0;

    if (
      existing &&
      existing.sourceBookingRevision >= booking.revision &&
      (!migrationExpired ||
        (existing.status === 'complete' && existing.completedReason === 'legacy_lookback_expired'))
    ) {
      return 'unchanged';
    }

    const now = timestampFromDate(nowDate);
    let next: BookingAttendanceOutcomeWork;
    const terminalWithPendingWork =
      (booking.lifecycle.status === 'completed' || booking.lifecycle.status === 'no_show') &&
      existing?.status === 'pending';
    if (terminalWithPendingWork) {
      const missingParticipantIds = await missingFrozenAttendanceParticipantIdsForWork(
        firestore,
        transaction,
        booking
      );
      next =
        missingParticipantIds.length > 0
          ? pendingBookingAttendanceOutcomeWork(booking, {
              deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
              workRevision: nextWorkRevision(existing),
              updatedAt: now,
              attemptCount: existing.attemptCount,
            })
          : completeBookingAttendanceOutcomeWork(booking, {
              completedReason: 'lifecycle_ineligible',
              workRevision: nextWorkRevision(existing),
              updatedAt: now,
            });
    } else if (booking.lifecycle.status !== 'confirmed') {
      next = completeBookingAttendanceOutcomeWork(booking, {
        completedReason: 'lifecycle_ineligible',
        workRevision: nextWorkRevision(existing),
        updatedAt: now,
      });
    } else if (migrationExpired) {
      next = completeBookingAttendanceOutcomeWork(booking, {
        completedReason: 'legacy_lookback_expired',
        workRevision: nextWorkRevision(existing),
        updatedAt: now,
      });
    } else if (
      existing &&
      existing.sourceLifecycleStatus === 'confirmed' &&
      sameOccurrenceSchedule(existing, booking)
    ) {
      next = BookingAttendanceOutcomeWorkSchema.parse({
        ...existing,
        sourceBookingRevision: booking.revision,
        sourceLifecycleStatus: booking.lifecycle.status,
        workRevision: nextWorkRevision(existing),
        updatedAt: now,
      });
    } else {
      next = await chooseInitialWork(
        firestore,
        transaction,
        booking,
        existing,
        nowDate,
        options.minimumEndsAt
      );
    }

    transaction.set(workRef, next as Record<string, unknown>);
    return existing ? 'updated' : 'created';
  });
}

export async function syncLessonBookingAttendanceOutcomeWorkForBookingWrite(
  firestore: Firestore,
  input: {
    readonly rawBookingId: string;
    readonly beforeData?: Record<string, unknown>;
    readonly afterData?: Record<string, unknown>;
    readonly now?: Date;
  }
): Promise<BookingAttendanceOutcomeWorkTriggerSyncOutcome> {
  if (!bookingWriteRequiresAttendanceOutcomeWorkReconciliation(input)) {
    return 'skipped';
  }

  return reconcileLessonBookingAttendanceOutcomeWork(firestore, input.rawBookingId, input.now);
}

export async function backfillLessonBookingAttendanceOutcomeWork(
  firestore: Firestore,
  options: {
    readonly maxBookings?: number;
    readonly startAfterBookingId?: string;
    readonly now?: Date;
  } = {}
): Promise<BookingAttendanceOutcomeWorkBackfillResult> {
  const maxBookings = Math.max(1, options.maxBookings ?? 100);
  const nowDate = options.now ?? new Date();
  const minimumEndsAt = addMillisecondsToCanonicalTimestamp(
    timestampFromDate(nowDate),
    -BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_LOOKBACK_MS
  );
  let query: Query = firestore
    .collection('bookings')
    .orderBy('bookingId', 'asc')
    .limit(maxBookings);
  if (options.startAfterBookingId) {
    query = query.startAfter(options.startAfterBookingId);
  }
  const snapshot = await query.get();
  const outcomes: Record<BookingAttendanceOutcomeWorkSyncOutcome, number> = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    blocked: 0,
  };

  for (const document of snapshot.docs) {
    const outcome = await reconcileLessonBookingAttendanceOutcomeWork(
      firestore,
      document.id,
      nowDate,
      { minimumEndsAt }
    );
    outcomes[outcome] += 1;
  }

  const lastDocument = snapshot.docs.at(-1);
  const lastBookingId = lastDocument?.get('bookingId');
  const cursor = typeof lastBookingId === 'string' ? lastBookingId : lastDocument?.id;
  return {
    scannedBookings: snapshot.size,
    outcomes,
    ...(cursor ? { cursor } : {}),
    truncated: snapshot.size >= maxBookings,
  };
}

export async function isLessonBookingAttendanceOutcomeWorkMigrationReady(
  firestore: Firestore
): Promise<boolean> {
  const snapshot = await firestore.doc(BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH).get();
  return snapshot.exists && snapshot.get('status') === 'ready';
}

export async function markLessonBookingAttendanceOutcomeWorkMigrationReady(
  firestore: Firestore,
  completedAt: Date = new Date()
): Promise<void> {
  await firestore.doc(BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH).set({
    status: 'ready',
    completedAt: timestampFromDate(completedAt),
    lookbackMs: BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_LOOKBACK_MS,
  });
}
