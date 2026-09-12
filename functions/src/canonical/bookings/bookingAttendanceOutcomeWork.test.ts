import { describe, expect, it } from 'vitest';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';
import {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  completePendingBookingAttendanceOutcomeWork,
  pendingBookingAttendanceOutcomeWork,
  resolveLessonBookingAttendanceEnvelope,
} from './bookingAttendanceOutcomeWork';

describe('lesson booking attendance outcome work', () => {
  const booking = canonicalBookingCollaborationFixtures.individualBooking;
  const updatedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

  it('projects outcome at endsAt and instructor_window exactly 24h later', () => {
    const outcome = pendingBookingAttendanceOutcomeWork(booking, {
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      workRevision: 1,
      updatedAt,
    });
    const instructorWindow = pendingBookingAttendanceOutcomeWork(booking, {
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
      workRevision: 2,
      updatedAt,
    });

    expect(outcome.dueAt).toEqual(booking.occurrence.interval.endsAt);
    expect(instructorWindow.dueAt.seconds - outcome.dueAt.seconds).toBe(24 * 60 * 60);
    expect(instructorWindow.dueAt.nanoseconds).toBe(outcome.dueAt.nanoseconds);
  });

  it('uses distinct deterministic keys for the two deadlines', () => {
    const base = {
      bookingId: booking.bookingId,
      occurrenceId: booking.occurrence.occurrenceId,
    };
    const outcome = resolveLessonBookingAttendanceEnvelope({
      ...base,
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
    });
    const instructorWindow = resolveLessonBookingAttendanceEnvelope({
      ...base,
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
    });

    expect(outcome.context.idempotencyKey).not.toBe(instructorWindow.context.idempotencyKey);
    expect(outcome.context.correlationId).not.toBe(instructorWindow.context.correlationId);
  });

  it('removes completed work from the pending query shape', () => {
    const pending = pendingBookingAttendanceOutcomeWork(booking, {
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome,
      workRevision: 1,
      updatedAt,
    });
    const complete = completePendingBookingAttendanceOutcomeWork(pending, {
      completedReason: 'deadline_processed',
      updatedAt,
    });

    expect(complete.status).toBe('complete');
    expect(complete.workRevision).toBe(2);
    expect('dueAt' in complete).toBe(false);
  });
});
