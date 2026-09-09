import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  BookingIdSchema,
  CorrelationIdSchema,
  SystemActorIdSchema,
  bookingInstructorAttendanceWindowEnd,
  buildScheduledCommandIdempotencyKey,
  canonicalDeterministicHash,
  compareCanonicalTimestamps,
  systemCommandActor,
  timestampFromDate,
  type BookingId,
  type CommandEnvelope,
  type CommandResult,
  type OccurrenceId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { parseBooking } from './bookingStore';

export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE = 25;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES = 100;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;
export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_SYSTEM_ACTOR_ID = SystemActorIdSchema.parse(
  'system_actor_resolve_lesson_booking_attendance_outcome'
);

export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE = {
  outcome: 'outcome',
  instructorWindow: 'instructor_window',
} as const;

export type BookingAttendanceOutcomeSweepDeadline =
  (typeof BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE)[keyof typeof BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE];

export type BookingAttendanceOutcomeSweepOutcome =
  | 'applied'
  | 'already_ineligible'
  | 'stale'
  | 'invalid_integrity'
  | 'failed';

export interface BookingAttendanceOutcomeSweepCursor {
  readonly endsAtSeconds: number;
  readonly bookingId: string;
}

export interface BookingAttendanceOutcomeSweepCandidateResult {
  readonly bookingId: string;
  readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
  readonly outcome: BookingAttendanceOutcomeSweepOutcome;
}

export interface BookingAttendanceOutcomeSweepResult {
  readonly scannedCandidates: number;
  readonly outcomes: readonly BookingAttendanceOutcomeSweepCandidateResult[];
  readonly cursor?: BookingAttendanceOutcomeSweepCursor;
  readonly truncated: boolean;
}

export interface SweepLessonBookingAttendanceOutcomesOptions {
  readonly now?: Date;
  readonly pageSize?: number;
  readonly maxCandidates?: number;
  readonly startAfter?: BookingAttendanceOutcomeSweepCursor;
}

function readCursorFromSnapshot(
  snapshot: QueryDocumentSnapshot
): BookingAttendanceOutcomeSweepCursor | undefined {
  const endsAtSeconds = snapshot.get('occurrence.interval.endsAt.seconds');
  const bookingId = snapshot.get('bookingId');
  if (typeof endsAtSeconds !== 'number' || typeof bookingId !== 'string') {
    return undefined;
  }
  return { endsAtSeconds, bookingId };
}

export function classifyResolveAttendanceOutcomeCommandResult(
  result: CommandResult<'resolve_attendance_outcome'>
): BookingAttendanceOutcomeSweepOutcome {
  if (result.status === 'success') {
    return 'applied';
  }
  const { code, details } = result.error;
  if (code === 'stale_version') {
    return 'stale';
  }
  if (code === 'invalid_transition') {
    return 'already_ineligible';
  }
  if (code === 'validation') {
    return 'invalid_integrity';
  }
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

function resolveEnvelope(booking: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
  readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
}): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor(BOOKING_ATTENDANCE_OUTCOME_SWEEP_SYSTEM_ACTOR_ID),
      exercisedCapability: 'system',
      idempotencyKey: buildScheduledCommandIdempotencyKey({
        systemActorId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_SYSTEM_ACTOR_ID,
        commandKind: 'resolve_attendance_outcome',
        subjectId: booking.bookingId,
        occurrenceId: booking.occurrenceId,
        deadlineId: booking.deadlineId,
      }),
      correlationId: CorrelationIdSchema.parse(
        canonicalDeterministicHash([
          'resolve-lesson-booking-attendance-outcome-sweep:v1',
          booking.bookingId,
          booking.occurrenceId,
          booking.deadlineId,
        ])
      ),
      source: 'scheduler',
    },
    intent: { subjectKind: 'booking', subjectId: booking.bookingId },
  };
}

async function processCandidate(
  snapshot: QueryDocumentSnapshot,
  now: ReturnType<typeof timestampFromDate>,
  execute: (
    envelope: CommandEnvelope<'resolve_attendance_outcome'>
  ) => Promise<CommandResult<'resolve_attendance_outcome'>>
): Promise<BookingAttendanceOutcomeSweepCandidateResult> {
  const parsedBookingId = BookingIdSchema.safeParse(snapshot.id);
  const bookingId = parsedBookingId.success ? parsedBookingId.data : snapshot.id;
  const booking = parseBooking(snapshot.data());
  if (!booking || booking.bookingId !== snapshot.id) {
    return {
      bookingId,
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      outcome: 'invalid_integrity',
    };
  }
  const deadlineId = resolveLessonBookingAttendanceSweepDeadline({
    now,
    endsAt: booking.occurrence.interval.endsAt,
  });
  try {
    const result = await execute(
      resolveEnvelope({
        bookingId: booking.bookingId,
        occurrenceId: booking.occurrence.occurrenceId,
        deadlineId,
      })
    );
    return {
      bookingId: booking.bookingId,
      deadlineId,
      outcome: classifyResolveAttendanceOutcomeCommandResult(result),
    };
  } catch {
    return { bookingId: booking.bookingId, deadlineId, outcome: 'failed' };
  }
}

export async function sweepLessonBookingAttendanceOutcomes(
  firestore: Firestore,
  options: SweepLessonBookingAttendanceOutcomesOptions = {}
): Promise<BookingAttendanceOutcomeSweepResult> {
  const nowDate = options.now ?? new Date();
  const now = timestampFromDate(nowDate);
  const pageSize = Math.max(
    1,
    options.pageSize ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE
  );
  const maxCandidates = Math.max(
    1,
    options.maxCandidates ?? BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES
  );
  const lookbackSeconds = Math.max(
    0,
    now.seconds - Math.floor(BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS / 1_000)
  );
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(nowDate) },
    createFirestoreCanonicalTransactionExecutor(firestore)
  );

  const outcomes: BookingAttendanceOutcomeSweepCandidateResult[] = [];
  let cursor = options.startAfter;
  let truncated = false;

  while (outcomes.length < maxCandidates) {
    const remaining = maxCandidates - outcomes.length;
    const limit = Math.min(pageSize, remaining);
    let query: Query = firestore
      .collection('bookings')
      .where('lifecycle.status', '==', 'confirmed')
      .where('occurrence.interval.endsAt.seconds', '<=', now.seconds)
      .where('occurrence.interval.endsAt.seconds', '>=', lookbackSeconds)
      .orderBy('occurrence.interval.endsAt.seconds', 'desc')
      .orderBy('bookingId', 'asc')
      .limit(limit);
    if (cursor) {
      query = query.startAfter(cursor.endsAtSeconds, cursor.bookingId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const document of snapshot.docs) {
      outcomes.push(
        await processCandidate(document, now, (envelope) => commands.execute(envelope))
      );
      const nextCursor = readCursorFromSnapshot(document);
      if (nextCursor) {
        cursor = nextCursor;
      }
    }

    if (snapshot.size < limit) {
      break;
    }
    if (outcomes.length >= maxCandidates) {
      truncated = true;
      break;
    }
  }

  return {
    scannedCandidates: outcomes.length,
    outcomes,
    ...(cursor ? { cursor } : {}),
    truncated,
  };
}
