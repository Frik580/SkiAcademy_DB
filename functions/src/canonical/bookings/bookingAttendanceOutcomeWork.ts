import { z } from 'zod';
import {
  BookingIdSchema,
  CanonicalTimestampSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  SystemActorIdSchema,
  bookingInstructorAttendanceWindowEnd,
  buildScheduledCommandIdempotencyKey,
  canonicalDeterministicHash,
  normalizeFirestoreDocument,
  systemCommandActor,
  type Booking,
  type BookingId,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type OccurrenceId,
} from '@ski-academy/shared-domain';

export const BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION = 'booking_attendance_outcome_work';

export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_SYSTEM_ACTOR_ID = SystemActorIdSchema.parse(
  'system_actor_resolve_lesson_booking_attendance_outcome'
);

export const BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE = {
  outcome: 'outcome',
  instructorWindow: 'instructor_window',
} as const;

export type BookingAttendanceOutcomeSweepDeadline =
  (typeof BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE)[keyof typeof BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE];

const BookingAttendanceOutcomeSweepDeadlineSchema = z.enum([
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
]);

const BookingLifecycleStatusSchema = z.enum([
  'pending',
  'confirmed',
  'pending_cancellation',
  'cancelled',
  'completed',
  'no_show',
]);

const BookingAttendanceOutcomeWorkBaseSchema = z.object({
  bookingId: BookingIdSchema,
  occurrenceId: OccurrenceIdSchema,
  sourceScheduleRevision: z.number().int().min(1),
  sourceBookingRevision: z.number().int().min(1),
  sourceLifecycleStatus: BookingLifecycleStatusSchema,
  sourceEndsAt: CanonicalTimestampSchema,
  workRevision: z.number().int().min(1),
  updatedAt: CanonicalTimestampSchema,
});

export const BookingAttendanceOutcomeWorkSchema = z.discriminatedUnion('status', [
  BookingAttendanceOutcomeWorkBaseSchema.extend({
    status: z.literal('pending'),
    deadlineId: BookingAttendanceOutcomeSweepDeadlineSchema,
    dueAt: CanonicalTimestampSchema,
    attemptCount: z.number().int().min(0),
  }).strict(),
  BookingAttendanceOutcomeWorkBaseSchema.extend({
    status: z.literal('complete'),
    completedReason: z.enum([
      'lifecycle_ineligible',
      'deadline_processed',
      'legacy_lookback_expired',
    ]),
  }).strict(),
  BookingAttendanceOutcomeWorkBaseSchema.extend({
    status: z.literal('blocked'),
    blockedReason: z.enum(['invalid_booking', 'invalid_work']),
  }).strict(),
]);

export type BookingAttendanceOutcomeWork = Readonly<
  z.output<typeof BookingAttendanceOutcomeWorkSchema>
>;

export type PendingBookingAttendanceOutcomeWork = Extract<
  BookingAttendanceOutcomeWork,
  { readonly status: 'pending' }
>;

export function bookingAttendanceOutcomeWorkPath(bookingId: BookingId): string {
  return `${BOOKING_ATTENDANCE_OUTCOME_WORK_COLLECTION}/${bookingId}`;
}

export function parseBookingAttendanceOutcomeWork(
  data: Record<string, unknown> | undefined
): BookingAttendanceOutcomeWork | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = BookingAttendanceOutcomeWorkSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function bookingAttendanceOutcomeDueAt(
  booking: Pick<Booking, 'occurrence'>,
  deadlineId: BookingAttendanceOutcomeSweepDeadline
): CanonicalTimestamp {
  return deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome
    ? booking.occurrence.interval.endsAt
    : bookingInstructorAttendanceWindowEnd(booking.occurrence.interval.endsAt);
}

function workBase(
  booking: Booking,
  input: { readonly workRevision: number; readonly updatedAt: CanonicalTimestamp }
) {
  return {
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
    sourceScheduleRevision: booking.occurrence.scheduleRevision,
    sourceBookingRevision: booking.revision,
    sourceLifecycleStatus: booking.lifecycle.status,
    sourceEndsAt: booking.occurrence.interval.endsAt,
    workRevision: input.workRevision,
    updatedAt: input.updatedAt,
  } as const;
}

export function pendingBookingAttendanceOutcomeWork(
  booking: Booking,
  input: {
    readonly deadlineId: BookingAttendanceOutcomeSweepDeadline;
    readonly workRevision: number;
    readonly updatedAt: CanonicalTimestamp;
    readonly attemptCount?: number;
  }
): PendingBookingAttendanceOutcomeWork {
  return BookingAttendanceOutcomeWorkSchema.parse({
    ...workBase(booking, input),
    status: 'pending',
    deadlineId: input.deadlineId,
    dueAt: bookingAttendanceOutcomeDueAt(booking, input.deadlineId),
    attemptCount: input.attemptCount ?? 0,
  }) as PendingBookingAttendanceOutcomeWork;
}

export function completeBookingAttendanceOutcomeWork(
  booking: Booking,
  input: {
    readonly completedReason:
      'lifecycle_ineligible' | 'deadline_processed' | 'legacy_lookback_expired';
    readonly workRevision: number;
    readonly updatedAt: CanonicalTimestamp;
  }
): BookingAttendanceOutcomeWork {
  return BookingAttendanceOutcomeWorkSchema.parse({
    ...workBase(booking, input),
    status: 'complete',
    completedReason: input.completedReason,
  });
}

export function completePendingBookingAttendanceOutcomeWork(
  work: PendingBookingAttendanceOutcomeWork,
  input: {
    readonly completedReason: 'lifecycle_ineligible' | 'deadline_processed';
    readonly updatedAt: CanonicalTimestamp;
  }
): BookingAttendanceOutcomeWork {
  return BookingAttendanceOutcomeWorkSchema.parse({
    bookingId: work.bookingId,
    occurrenceId: work.occurrenceId,
    sourceScheduleRevision: work.sourceScheduleRevision,
    sourceBookingRevision: work.sourceBookingRevision,
    sourceLifecycleStatus: work.sourceLifecycleStatus,
    sourceEndsAt: work.sourceEndsAt,
    workRevision: work.workRevision + 1,
    updatedAt: input.updatedAt,
    status: 'complete',
    completedReason: input.completedReason,
  });
}

export function blockPendingBookingAttendanceOutcomeWork(
  work: PendingBookingAttendanceOutcomeWork,
  input: { readonly updatedAt: CanonicalTimestamp }
): BookingAttendanceOutcomeWork {
  return BookingAttendanceOutcomeWorkSchema.parse({
    bookingId: work.bookingId,
    occurrenceId: work.occurrenceId,
    sourceScheduleRevision: work.sourceScheduleRevision,
    sourceBookingRevision: work.sourceBookingRevision,
    sourceLifecycleStatus: work.sourceLifecycleStatus,
    sourceEndsAt: work.sourceEndsAt,
    workRevision: work.workRevision + 1,
    updatedAt: input.updatedAt,
    status: 'blocked',
    blockedReason: 'invalid_work',
  });
}

export function resolveLessonBookingAttendanceEnvelope(input: {
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
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
        deadlineId: input.deadlineId,
      }),
      correlationId: CorrelationIdSchema.parse(
        canonicalDeterministicHash([
          'resolve-lesson-booking-attendance-outcome-sweep:v1',
          input.bookingId,
          input.occurrenceId,
          input.deadlineId,
        ])
      ),
      source: 'scheduler',
    },
    intent: { subjectKind: 'booking', subjectId: input.bookingId },
  };
}
