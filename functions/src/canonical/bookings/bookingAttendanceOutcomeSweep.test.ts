import { describe, expect, it } from 'vitest';
import {
  CanonicalCommandError,
  commandErrorResult,
  commandSuccessResult,
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS,
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES,
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE,
  classifyResolveAttendanceOutcomeCommandResult,
  resolveLessonBookingAttendanceSweepDeadline,
} from './bookingAttendanceOutcomeSweep';

const correlationId = CorrelationIdSchema.parse('correlation_attendance_outcome_sweep_unit_01');

function errorResult(
  error: CanonicalCommandError
): ReturnType<typeof commandErrorResult<'resolve_attendance_outcome'>> {
  return commandErrorResult('resolve_attendance_outcome', correlationId, error.toTransport());
}

describe('lesson booking attendance outcome sweep mapping', () => {
  it('keeps discovery bounded and shorter than an unbounded history drain', () => {
    expect(BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE).toBe(25);
    expect(BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES).toBe(100);
    expect(BOOKING_ATTENDANCE_OUTCOME_SWEEP_LOOKBACK_MS).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(BOOKING_ATTENDANCE_OUTCOME_SWEEP_MAX_CANDIDATES).toBeGreaterThanOrEqual(
      BOOKING_ATTENDANCE_OUTCOME_SWEEP_PAGE_SIZE
    );
  });

  it('uses endsAt for deterministic resolution and +24h only for missing-attendance fallback', () => {
    const endsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));
    expect(
      resolveLessonBookingAttendanceSweepDeadline({
        now: endsAt,
        endsAt,
      })
    ).toBe(BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome);
    expect(
      resolveLessonBookingAttendanceSweepDeadline({
        now: timestampFromDate(new Date('2026-01-16T10:00:00.000Z')),
        endsAt,
      })
    ).toBe(BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow);
  });

  it('maps command results without duplicating attendance outcome policy', () => {
    expect(
      classifyResolveAttendanceOutcomeCommandResult(
        commandSuccessResult('resolve_attendance_outcome', correlationId)
      )
    ).toBe('applied');
    expect(
      classifyResolveAttendanceOutcomeCommandResult(
        errorResult(new CanonicalCommandError('stale_version', { correlationId }))
      )
    ).toBe('stale');
    expect(
      classifyResolveAttendanceOutcomeCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { resourceKind: 'booking', reason: 'unsupported' },
          })
        )
      )
    ).toBe('already_ineligible');
    expect(
      classifyResolveAttendanceOutcomeCommandResult(
        errorResult(
          new CanonicalCommandError('validation', {
            correlationId,
            details: { field: 'subjectId', reason: 'conflict' },
          })
        )
      )
    ).toBe('invalid_integrity');
    expect(
      classifyResolveAttendanceOutcomeCommandResult(
        errorResult(new CanonicalCommandError('internal', { correlationId }))
      )
    ).toBe('failed');
  });
});
