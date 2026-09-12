import type {
  DocumentSnapshot,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
  BookingIdSchema,
  addMillisecondsToCanonicalTimestamp,
  bookingInstructorAttendanceWindowEnd,
  compareCanonicalTimestamps,
  timestampFromDate,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { createBookingAttendanceCommandHandlers } from './bookingAttendanceCommands';
import { parseBooking } from './bookingStore';
import {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION,
  BookingAttendanceOutcomeWorkSchema,
  blockPendingBookingAttendanceOutcomeWork,
  completePendingBookingAttendanceOutcomeWork,
  parseBookingAttendanceOutcomeWork,
  resolveLessonBookingAttendanceEnvelope,
  type PendingBookingAttendanceOutcomeWork,
} from './bookingAttendanceOutcomeWork';
import { isLessonBookingAttendanceOutcomeWorkMigrationReady } from './bookingAttendanceOutcomeWorkSync';

export {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_SYSTEM_ACTOR_ID,
  type BookingAttendanceOutcomeSweepDeadline,
} from './bookingAttendanceOutcomeWork';
import type { BookingAttendanceOutcomeSweepDeadline } from './bookingAttendanceOutcomeWork';

export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE = 25;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES = 100;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_DOCS = 400;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_RETRY_BASE_MS = 5 * 60 * 1_000;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_RETRY_MAX_MS = 60 * 60 * 1_000;

export type BookingAttendanceOutcomeSweepOutcome =
  'applied' | 'already_ineligible' | 'stale' | 'invalid_integrity' | 'failed' | 'future_skipped';

export interface BookingAttendanceOutcomeSweepCursor {
  readonly dueAtSeconds: number;
  readonly bookingId: string;
}

export interface BookingAttendanceOutcomeSweepCandidateResult {
  readonly bookingId: string;
  readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
  readonly outcome: BookingAttendanceOutcomeSweepOutcome;
}

export interface BookingAttendanceOutcomeSweepResult {
  readonly candidateSource: 'projection' | 'legacy_cutover';
  readonly scannedCandidates: number;
  readonly candidateDocsRead: number;
  readonly workCandidatesSelected: number;
  readonly idempotencyHits: number;
  readonly idempotencyMisses: number;
  readonly outcomeDeadlineCandidates: number;
  readonly instructorWindowCandidates: number;
  readonly resolved: number;
  readonly issuesOpened: number;
  readonly futureCandidatesSkipped: number;
  readonly pages: number;
  readonly outcomes: readonly BookingAttendanceOutcomeSweepCandidateResult[];
  readonly cursor?: BookingAttendanceOutcomeSweepCursor;
  readonly truncated: boolean;
}

export interface SweepLessonBookingAttendanceOutcomesOptions {
  readonly now?: Date;
  readonly pageSize?: number;
  readonly maxCandidates?: number;
  readonly maxCandidateDocs?: number;
  readonly startAfter?: BookingAttendanceOutcomeSweepCursor;
  /** Test/cutover override. Production reads the migration-ready marker. */
  readonly projectionReady?: boolean;
}

interface BookingAttendanceOutcomeSweepCounters {
  idempotencyHits: number;
  idempotencyMisses: number;
  resolved: number;
  issuesOpened: number;
}

function createSweepCommands(
  firestore: Firestore,
  nowDate: Date,
  counters: BookingAttendanceOutcomeSweepCounters
) {
  const transactionExecutor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createCanonicalCommands(
    createBookingAttendanceCommandHandlers(transactionExecutor, {
      onResolveAttendanceOutcome: (observation) => {
        if (observation.replayed) counters.idempotencyHits += 1;
        else counters.idempotencyMisses += 1;
        if (observation.resolved) counters.resolved += 1;
        counters.issuesOpened += observation.issuesOpened;
      },
    }),
    { clock: createAuthoritativeCommandClock(nowDate) }
  );
}

function readCursorFromSnapshot(
  snapshot: QueryDocumentSnapshot
): BookingAttendanceOutcomeSweepCursor | undefined {
  const dueAtSeconds = snapshot.get('dueAt.seconds');
  const bookingId = snapshot.get('bookingId');
  if (typeof dueAtSeconds !== 'number' || typeof bookingId !== 'string') return undefined;
  return { dueAtSeconds, bookingId };
}

export function classifyResolveAttendanceOutcomeCommandResult(
  result: CommandResult<'resolve_attendance_outcome'>
): BookingAttendanceOutcomeSweepOutcome {
  if (result.status === 'success') return 'applied';
  const { code, details } = result.error;
  if (code === 'stale_version') return 'stale';
  if (code === 'invalid_transition') return 'already_ineligible';
  if (code === 'validation') return 'invalid_integrity';
  if (details?.resourceKind === 'booking' && details.reason === 'unsupported') {
    return 'already_ineligible';
  }
  return 'failed';
}

export function resolveLessonBookingAttendanceSweepDeadline(input: {
  readonly now: ReturnType<typeof timestampFromDate>;
  readonly endsAt: ReturnType<typeof timestampFromDate>;
}): BookingAttendanceOutcomeSweepDeadline {
  const windowEnd = bookingInstructorAttendanceWindowEnd(input.endsAt);
  return compareCanonicalTimestamps(input.now, windowEnd) >= 0
    ? BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow
    : BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome;
}

async function updatePendingWorkIfCurrent(
  firestore: Firestore,
  expected: PendingBookingAttendanceOutcomeWork,
  next:
    | PendingBookingAttendanceOutcomeWork
    | ReturnType<typeof completePendingBookingAttendanceOutcomeWork>
): Promise<void> {
  const ref = firestore.doc(`${BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION}/${expected.bookingId}`);
  await firestore.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(ref);
    const current = parseBookingAttendanceOutcomeWork(
      currentSnapshot.exists ? (currentSnapshot.data() as Record<string, unknown>) : undefined
    );
    if (
      !current ||
      current.status !== 'pending' ||
      current.workRevision !== expected.workRevision
    ) {
      return;
    }
    transaction.set(ref, next as Record<string, unknown>);
  });
}

async function normalizeOverdueDeadline(
  firestore: Firestore,
  work: PendingBookingAttendanceOutcomeWork,
  now: ReturnType<typeof timestampFromDate>
): Promise<PendingBookingAttendanceOutcomeWork> {
  if (work.deadlineId !== BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome) return work;
  const windowEnd = bookingInstructorAttendanceWindowEnd(work.dueAt);
  if (compareCanonicalTimestamps(now, windowEnd) < 0) return work;
  const promoted = BookingAttendanceOutcomeWorkSchema.parse({
    ...work,
    deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
    dueAt: windowEnd,
    attemptCount: 0,
    workRevision: work.workRevision + 1,
    updatedAt: now,
  }) as PendingBookingAttendanceOutcomeWork;
  await updatePendingWorkIfCurrent(firestore, work, promoted);
  return promoted;
}

async function blockInvalidWork(
  firestore: Firestore,
  snapshot: DocumentSnapshot,
  now: Date
): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(snapshot.ref);
    if (
      !current.exists ||
      !current.updateTime ||
      !snapshot.updateTime ||
      !current.updateTime.isEqual(snapshot.updateTime)
    ) {
      return;
    }
    transaction.set(
      snapshot.ref,
      {
        status: 'blocked',
        blockedReason: 'invalid_work',
        updatedAt: timestampFromDate(now),
      },
      { merge: true }
    );
  });
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(
    BOOKING_ATTENDANCE_OUTCOME_SWEEP_RETRY_MAX_MS,
    BOOKING_ATTENDANCE_OUTCOME_SWEEP_RETRY_BASE_MS * 2 ** Math.min(attemptCount, 8)
  );
}

async function rescheduleFailedWork(
  firestore: Firestore,
  work: PendingBookingAttendanceOutcomeWork,
  now: ReturnType<typeof timestampFromDate>
): Promise<void> {
  const next = BookingAttendanceOutcomeWorkSchema.parse({
    ...work,
    dueAt: addMillisecondsToCanonicalTimestamp(now, retryDelayMs(work.attemptCount)),
    attemptCount: work.attemptCount + 1,
    workRevision: work.workRevision + 1,
    updatedAt: now,
  }) as PendingBookingAttendanceOutcomeWork;
  await updatePendingWorkIfCurrent(firestore, work, next);
}

async function processCandidate(
  firestore: Firestore,
  snapshot: DocumentSnapshot,
  nowDate: Date,
  execute: (
    envelope: ReturnType<typeof resolveLessonBookingAttendanceEnvelope>
  ) => Promise<CommandResult<'resolve_attendance_outcome'>>
): Promise<BookingAttendanceOutcomeSweepCandidateResult> {
  const parsedBookingId = BookingIdSchema.safeParse(snapshot.id);
  const bookingId = parsedBookingId.success ? parsedBookingId.data : snapshot.id;
  const parsedWork = parseBookingAttendanceOutcomeWork(snapshot.data());
  if (!parsedWork || parsedWork.status !== 'pending' || parsedWork.bookingId !== snapshot.id) {
    await blockInvalidWork(firestore, snapshot, nowDate);
    return {
      bookingId,
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      outcome: 'invalid_integrity',
    };
  }

  const now = timestampFromDate(nowDate);
  if (compareCanonicalTimestamps(now, parsedWork.dueAt) < 0) {
    return {
      bookingId: parsedWork.bookingId,
      deadlineId: parsedWork.deadlineId,
      outcome: 'future_skipped',
    };
  }

  const work = await normalizeOverdueDeadline(firestore, parsedWork, now);
  try {
    const result = await execute(
      resolveLessonBookingAttendanceEnvelope({
        bookingId: work.bookingId,
        occurrenceId: work.occurrenceId,
        deadlineId: work.deadlineId,
      })
    );
    const outcome = classifyResolveAttendanceOutcomeCommandResult(result);
    if (outcome === 'already_ineligible') {
      await updatePendingWorkIfCurrent(
        firestore,
        work,
        completePendingBookingAttendanceOutcomeWork(work, {
          completedReason: 'lifecycle_ineligible',
          updatedAt: now,
        })
      );
    } else if (outcome === 'invalid_integrity') {
      await updatePendingWorkIfCurrent(
        firestore,
        work,
        blockPendingBookingAttendanceOutcomeWork(work, { updatedAt: now })
      );
    } else if (outcome === 'failed' || outcome === 'stale') {
      await rescheduleFailedWork(firestore, work, now);
    }
    return { bookingId: work.bookingId, deadlineId: work.deadlineId, outcome };
  } catch {
    await rescheduleFailedWork(firestore, work, now);
    return { bookingId: work.bookingId, deadlineId: work.deadlineId, outcome: 'failed' };
  }
}

async function sweepLegacyBookingCandidates(
  firestore: Firestore,
  options: SweepLessonBookingAttendanceOutcomesOptions,
  nowDate: Date
): Promise<BookingAttendanceOutcomeSweepResult> {
  const now = timestampFromDate(nowDate);
  const pageSize = Math.max(1, options.pageSize ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE);
  const maxCandidates = Math.max(
    1,
    options.maxCandidates ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES
  );
  const lookbackSeconds = Math.max(
    0,
    now.seconds - Math.floor(BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS / 1_000)
  );
  const counters = { idempotencyHits: 0, idempotencyMisses: 0, resolved: 0, issuesOpened: 0 };
  const commands = createSweepCommands(firestore, nowDate, counters);
  const outcomes: BookingAttendanceOutcomeSweepCandidateResult[] = [];
  let pages = 0;
  let candidateDocsRead = 0;
  let workCandidatesSelected = 0;
  let outcomeDeadlineCandidates = 0;
  let instructorWindowCandidates = 0;
  let futureCandidatesSkipped = 0;
  let cursor: { endsAtSeconds: number; bookingId: string } | undefined;
  let truncated = false;

  while (outcomes.length < maxCandidates) {
    const limit = Math.min(pageSize, maxCandidates - outcomes.length);
    let query: Query = firestore
      .collection('bookings')
      .where('lifecycle.status', '==', 'confirmed')
      .where('occurrence.interval.endsAt.seconds', '<=', now.seconds)
      .where('occurrence.interval.endsAt.seconds', '>=', lookbackSeconds)
      .orderBy('occurrence.interval.endsAt.seconds', 'desc')
      .orderBy('bookingId', 'asc')
      .limit(limit);
    if (cursor) query = query.startAfter(cursor.endsAtSeconds, cursor.bookingId);

    const snapshot = await query.get();
    pages += 1;
    if (snapshot.empty) break;
    candidateDocsRead += snapshot.size;

    for (const document of snapshot.docs) {
      const endsAtSeconds = document.get('occurrence.interval.endsAt.seconds');
      const cursorBookingId = document.get('bookingId');
      if (typeof endsAtSeconds === 'number' && typeof cursorBookingId === 'string') {
        cursor = { endsAtSeconds, bookingId: cursorBookingId };
      }
      const parsedBookingId = BookingIdSchema.safeParse(document.id);
      const booking = parseBooking(document.data());
      if (!booking || booking.bookingId !== document.id) {
        outcomes.push({
          bookingId: parsedBookingId.success ? parsedBookingId.data : document.id,
          deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
          outcome: 'invalid_integrity',
        });
        continue;
      }

      const projectedWorkSnapshot = await firestore
        .doc(`${BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION}/${booking.bookingId}`)
        .get();
      const projectedWork = parseBookingAttendanceOutcomeWork(
        projectedWorkSnapshot.exists
          ? (projectedWorkSnapshot.data() as Record<string, unknown>)
          : undefined
      );
      if (projectedWork?.status === 'pending') {
        const candidate = await processCandidate(
          firestore,
          projectedWorkSnapshot,
          nowDate,
          (envelope) => commands.execute(envelope)
        );
        outcomes.push(candidate);
        if (candidate.outcome === 'future_skipped') {
          futureCandidatesSkipped += 1;
        } else {
          workCandidatesSelected += 1;
          if (candidate.deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome) {
            outcomeDeadlineCandidates += 1;
          } else {
            instructorWindowCandidates += 1;
          }
        }
        continue;
      }
      if (projectedWorkSnapshot.exists) {
        outcomes.push({
          bookingId: booking.bookingId,
          deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
          outcome: projectedWork ? 'already_ineligible' : 'invalid_integrity',
        });
        continue;
      }

      const deadlineId = resolveLessonBookingAttendanceSweepDeadline({
        now,
        endsAt: booking.occurrence.interval.endsAt,
      });
      if (deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome) {
        outcomeDeadlineCandidates += 1;
      } else {
        instructorWindowCandidates += 1;
      }
      workCandidatesSelected += 1;
      try {
        const result = await commands.execute(
          resolveLessonBookingAttendanceEnvelope({
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
            deadlineId,
          })
        );
        outcomes.push({
          bookingId: booking.bookingId,
          deadlineId,
          outcome: classifyResolveAttendanceOutcomeCommandResult(result),
        });
      } catch {
        outcomes.push({ bookingId: booking.bookingId, deadlineId, outcome: 'failed' });
      }
    }

    if (snapshot.size < limit) break;
    if (outcomes.length >= maxCandidates) {
      truncated = true;
      break;
    }
  }

  return {
    candidateSource: 'legacy_cutover',
    scannedCandidates: candidateDocsRead,
    candidateDocsRead,
    workCandidatesSelected,
    idempotencyHits: counters.idempotencyHits,
    idempotencyMisses: counters.idempotencyMisses,
    outcomeDeadlineCandidates,
    instructorWindowCandidates,
    resolved: counters.resolved,
    issuesOpened: counters.issuesOpened,
    futureCandidatesSkipped,
    pages,
    outcomes,
    truncated,
  };
}

export async function sweepLessonBookingAttendanceOutcomes(
  firestore: Firestore,
  options: SweepLessonBookingAttendanceOutcomesOptions = {}
): Promise<BookingAttendanceOutcomeSweepResult> {
  const nowDate = options.now ?? new Date();
  const projectionReady =
    options.projectionReady ??
    (await isLessonBookingAttendanceOutcomeWorkMigrationReady(firestore));
  if (!projectionReady) {
    return sweepLegacyBookingCandidates(firestore, options, nowDate);
  }
  const now = timestampFromDate(nowDate);
  const pageSize = Math.max(1, options.pageSize ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE);
  const maxCandidates = Math.max(
    1,
    options.maxCandidates ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES
  );
  const maxCandidateDocs = Math.max(
    maxCandidates,
    options.maxCandidateDocs ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_DOCS
  );
  const counters = { idempotencyHits: 0, idempotencyMisses: 0, resolved: 0, issuesOpened: 0 };
  const commands = createSweepCommands(firestore, nowDate, counters);

  const outcomes: BookingAttendanceOutcomeSweepCandidateResult[] = [];
  let cursor = options.startAfter;
  let candidateDocsRead = 0;
  let workCandidatesSelected = 0;
  let outcomeDeadlineCandidates = 0;
  let instructorWindowCandidates = 0;
  let futureCandidatesSkipped = 0;
  let pages = 0;
  let truncated = false;

  while (workCandidatesSelected < maxCandidates && candidateDocsRead < maxCandidateDocs) {
    const limit = Math.min(pageSize, maxCandidateDocs - candidateDocsRead);
    let query: Query = firestore
      .collection(BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION)
      .where('status', '==', 'pending')
      .where('dueAt.seconds', '<=', now.seconds)
      .orderBy('dueAt.seconds', 'asc')
      .orderBy('bookingId', 'asc')
      .limit(limit);
    if (cursor) query = query.startAfter(cursor.dueAtSeconds, cursor.bookingId);

    const snapshot = await query.get();
    pages += 1;
    if (snapshot.empty) break;
    candidateDocsRead += snapshot.size;

    for (const document of snapshot.docs) {
      const nextCursor = readCursorFromSnapshot(document);
      if (nextCursor) cursor = nextCursor;
      const candidate = await processCandidate(firestore, document, nowDate, (envelope) =>
        commands.execute(envelope)
      );
      outcomes.push(candidate);
      if (candidate.outcome === 'future_skipped') {
        futureCandidatesSkipped += 1;
        continue;
      }
      workCandidatesSelected += 1;
      if (candidate.deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome) {
        outcomeDeadlineCandidates += 1;
      } else {
        instructorWindowCandidates += 1;
      }
      if (workCandidatesSelected >= maxCandidates) break;
    }

    if (snapshot.size < limit) break;
    if (workCandidatesSelected >= maxCandidates || candidateDocsRead >= maxCandidateDocs) {
      truncated = true;
      break;
    }
  }

  return {
    candidateSource: 'projection',
    scannedCandidates: candidateDocsRead,
    candidateDocsRead,
    workCandidatesSelected,
    idempotencyHits: counters.idempotencyHits,
    idempotencyMisses: counters.idempotencyMisses,
    outcomeDeadlineCandidates,
    instructorWindowCandidates,
    resolved: counters.resolved,
    issuesOpened: counters.issuesOpened,
    futureCandidatesSkipped,
    pages,
    outcomes,
    ...(cursor ? { cursor } : {}),
    truncated,
  };
}
