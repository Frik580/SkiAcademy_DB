import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
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
  type CanonicalExecutionScope,
  parsePersistedCanonicalScope,
  assertSameCanonicalScope,
  normalizeFirestoreDocument,
  parseCommandIdempotencyRecord,
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

  try {
    const beforeScope = parsePersistedCanonicalScope(before);
    assertSameCanonicalScope(beforeScope, after);
  } catch {
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
      assertSameCanonicalScope(parsePersistedCanonicalScope(booking), attendance);
      if (
        attendance.subject.subjectKind !== 'booking' ||
        attendance.subject.bookingId !== booking.bookingId ||
        attendance.subject.occurrenceId !== booking.occurrence.occurrenceId ||
        attendance.subject.participantId !== participantId ||
        attendance.attendanceId !== attendanceId
      ) {
        throw new Error('Attendance identity integrity mismatch.');
      }
      facts.set(participantId, { attendanceStatus: attendance.attendanceStatus });
    }
  }
  return missingAttendanceParticipantIds(booking, facts);
}

function idempotencyPath(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: Booking['occurrence']['occurrenceId'];
  readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
  readonly scope: CanonicalExecutionScope;
}): string {
  const identity = resolveCommandIdempotencyIdentity(
    resolveLessonBookingAttendanceEnvelope(input),
    input.scope
  );
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
  const scope = parsePersistedCanonicalScope(booking);
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
          scope,
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
        scope,
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
    readonly preserveHistoricalWork?: boolean;
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
      if (options.preserveHistoricalWork && workSnapshot.exists) return 'blocked';
      if (workSnapshot.exists) transaction.delete(workRef);
      return workSnapshot.exists ? 'deleted' : 'unchanged';
    }

    const booking = parseBooking(bookingSnapshot.data() as Record<string, unknown> | undefined);
    if (!booking || booking.bookingId !== bookingId) {
      if (options.preserveHistoricalWork) return 'blocked';
      if (workSnapshot.exists) transaction.delete(workRef);
      return 'blocked';
    }
    let bookingScope: CanonicalExecutionScope;
    try {
      bookingScope = parsePersistedCanonicalScope(booking);
      if (existing) assertSameCanonicalScope(bookingScope, existing);
    } catch {
      return 'blocked';
    }
    if (options.preserveHistoricalWork && workSnapshot.exists && !existing) return 'blocked';

    const terminalWithPendingWork =
      (booking.lifecycle.status === 'completed' || booking.lifecycle.status === 'no_show') &&
      existing?.status === 'pending';
    if (terminalWithPendingWork && existing.sourceBookingRevision > booking.revision)
      return 'blocked';

    const migrationExpired =
      booking.lifecycle.status === 'confirmed' &&
      options.minimumEndsAt !== undefined &&
      compareCanonicalTimestamps(booking.occurrence.interval.endsAt, options.minimumEndsAt) < 0;

    if (
      existing &&
      !terminalWithPendingWork &&
      existing.sourceBookingRevision >= booking.revision &&
      (!migrationExpired ||
        (existing.status === 'complete' && existing.completedReason === 'legacy_lookback_expired'))
    ) {
      return 'unchanged';
    }

    const now = timestampFromDate(nowDate);
    let next: BookingAttendanceOutcomeWork;
    if (terminalWithPendingWork) {
      if (!frozenServiceParticipantIds(booking)) return 'blocked';
      const missingParticipantIds = await missingFrozenAttendanceParticipantIdsForWork(
        firestore,
        transaction,
        booking
      );
      // A repeated backfill must not churn the revision of unresolved historical work.
      if (
        missingParticipantIds.length > 0 &&
        existing.sourceLifecycleStatus === booking.lifecycle.status &&
        existing.sourceBookingRevision === booking.revision &&
        sameOccurrenceSchedule(existing, booking) &&
        existing.deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow
      )
        return 'unchanged';
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
    .orderBy(FieldPath.documentId(), 'asc')
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
      { minimumEndsAt, preserveHistoricalWork: true }
    );
    outcomes[outcome] += 1;
  }

  const lastDocument = snapshot.docs.at(-1);
  const cursor = lastDocument?.id;
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
  completedAt: Date = new Date(),
  evidence?: BookingAttendanceOutcomeWorkBackfillResult
): Promise<void> {
  if (
    !evidence ||
    evidence.truncated ||
    evidence.outcomes.blocked > 0 ||
    !Number.isSafeInteger(evidence.scannedBookings) ||
    evidence.scannedBookings < 0 ||
    Object.values(evidence.outcomes).some((value) => !Number.isSafeInteger(value) || value < 0) ||
    Object.values(evidence.outcomes).reduce((sum, value) => sum + value, 0) !==
      evidence.scannedBookings
  ) {
    throw new Error('Attendance migration blocked: incomplete or blocked backfill evidence.');
  }
  // One consistent, bounded verification and marker write. Fail closed beyond this cap.
  // Run under a maintenance fence; backfill itself spans multiple transactions.
  const limit = 1_000;
  await firestore.runTransaction(async (transaction) => {
    const bookings = await transaction.get(
      firestore
        .collection('bookings')
        .orderBy(FieldPath.documentId())
        .limit(limit + 1)
    );
    const works = await transaction.get(
      firestore
        .collection('booking_attendance_outcome_work')
        .orderBy(FieldPath.documentId())
        .limit(limit + 1)
    );
    const fail = (reason: string): never => {
      throw new Error(`Attendance migration blocked: ${reason}`);
    };
    if (bookings.size > limit || works.size > limit) fail('verification inventory truncated');
    if (bookings.size !== evidence.scannedBookings) fail('backfill coverage changed');
    const workById = new Map(works.docs.map((document) => [document.id, document]));
    if (works.size !== bookings.size) fail('missing or orphan work');
    const now = timestampFromDate(completedAt);
    const successfulDeadline = async (
      booking: Booking,
      deadlineId: BookingAttendanceOutcomeSweepDeadline
    ) => {
      const identity = resolveCommandIdempotencyIdentity(
        resolveLessonBookingAttendanceEnvelope({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
          deadlineId,
        }),
        parsePersistedCanonicalScope(booking)
      );
      const result = await transaction.get(firestore.doc(identity.recordPath.replace(/^\//, '')));
      const parsed = parseCommandIdempotencyRecord(normalizeFirestoreDocument(result.data()));
      return (
        parsed.success &&
        parsed.data.completionState === 'completed' &&
        parsed.data.commandKind === 'resolve_attendance_outcome' &&
        parsed.data.fingerprint === identity.fingerprint &&
        parsed.data.result.status === 'success'
      );
    };
    for (const document of bookings.docs) {
      const booking = parseBooking(document.data());
      const work = parseBookingAttendanceOutcomeWork(workById.get(document.id)?.data());
      if (
        !booking ||
        booking.bookingId !== document.id ||
        !work ||
        work.bookingId !== document.id
      ) {
        fail(`invalid booking/work ${document.id}`);
      }
      // Explicit narrowing keeps the guard fail-closed on malformed persisted records.
      if (!booking || !work) throw new Error('Unreachable invalid migration record');
      assertSameCanonicalScope(parsePersistedCanonicalScope(booking), work);
      if (
        !sameOccurrenceSchedule(work, booking) ||
        work.sourceLifecycleStatus !== booking.lifecycle.status ||
        work.sourceBookingRevision > booking.revision ||
        work.status === 'blocked'
      )
        fail(`work integrity ${document.id}`);
      if (work.status === 'pending') {
        if (
          booking.lifecycle.status !== 'confirmed' ||
          !sameTimestamp(work.dueAt, bookingAttendanceOutcomeDueAt(booking, work.deadlineId)) ||
          compareCanonicalTimestamps(work.dueAt, now) <= 0
        )
          fail(`unresolved pending ${document.id}`);
        if (
          work.deadlineId === 'instructor_window' &&
          !(await successfulDeadline(booking, 'outcome'))
        ) {
          fail(`unproven outcome ${document.id}`);
        }
      } else if (work.status === 'complete') {
        if (work.completedReason === 'lifecycle_ineligible') {
          if (booking.lifecycle.status === 'confirmed')
            fail(`eligible booking retired ${document.id}`);
          if (
            (booking.lifecycle.status === 'completed' || booking.lifecycle.status === 'no_show') &&
            (!frozenServiceParticipantIds(booking) ||
              (await missingFrozenAttendanceParticipantIdsForWork(firestore, transaction, booking))
                .length > 0)
          )
            fail(`missing Attendance ${document.id}`);
        } else if (work.completedReason === 'legacy_lookback_expired') {
          if (
            booking.lifecycle.status !== 'confirmed' ||
            compareCanonicalTimestamps(
              booking.occurrence.interval.endsAt,
              addMillisecondsToCanonicalTimestamp(
                now,
                -BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_LOOKBACK_MS
              )
            ) >= 0
          )
            fail(`invalid lookback retirement ${document.id}`);
        } else {
          if (!(await successfulDeadline(booking, 'instructor_window')))
            fail(`unproven deadline ${document.id}`);
        }
      }
    }
    transaction.set(firestore.doc(BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH), {
      status: 'ready',
      completedAt: now,
      lookbackMs: BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_LOOKBACK_MS,
      verifiedBookings: bookings.size,
      verifiedWorks: works.size,
    });
  });
}
