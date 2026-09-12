import { describe, expect, it } from 'vitest';
import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  buildScheduledCommandIdempotencyKey,
  commandErrorResult,
  commandSuccessResult,
} from '@ski-academy/shared-domain';
import {
  buildGuestCourseReservationExpiryEnvelope,
  classifyExpireGuestCourseReservationCommandResult,
  GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES,
  GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE,
} from './guestCourseReservationExpirySweep';
import { GUEST_LESSON_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID } from '../bookings/guestLessonReservationExpirySweep';

const correlationId = CorrelationIdSchema.parse('correlation_course_expiry_sweep_unit_01');

function errorResult(error: CanonicalCommandError) {
  return commandErrorResult('expire_guest_reservation', correlationId, error.toTransport());
}

describe('guest course reservation expiry sweep', () => {
  it('keeps discovery bounded', () => {
    expect(GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE).toBe(25);
    expect(GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES).toBe(100);
    expect(GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES).toBeGreaterThanOrEqual(
      GUEST_COURSE_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE
    );
  });

  it('builds stable, enrollment-scoped scheduler identities with expected revision protection', () => {
    const first = buildGuestCourseReservationExpiryEnvelope({
      enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_course_expiry_unit_a'),
      revision: AggregateRevisionSchema.parse(3),
    });
    const replay = buildGuestCourseReservationExpiryEnvelope({
      enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_course_expiry_unit_a'),
      revision: AggregateRevisionSchema.parse(3),
    });
    const second = buildGuestCourseReservationExpiryEnvelope({
      enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_course_expiry_unit_b'),
      revision: AggregateRevisionSchema.parse(3),
    });

    expect(first.context.actor).toEqual(replay.context.actor);
    expect(first.context.idempotencyKey).toBe(replay.context.idempotencyKey);
    expect(first.context.correlationId).toBe(replay.context.correlationId);
    expect(first.context.expectedRevision).toBe(3);
    expect(first.intent).toEqual({
      courseEnrollmentId: 'enrollment_course_expiry_unit_a',
    });
    expect(second.context.idempotencyKey).not.toBe(first.context.idempotencyKey);
    expect(second.context.correlationId).not.toBe(first.context.correlationId);
    expect(first.context.idempotencyKey).not.toBe(
      buildScheduledCommandIdempotencyKey({
        systemActorId: GUEST_LESSON_RESERVATION_EXPIRY_SYSTEM_ACTOR_ID,
        commandKind: 'expire_guest_reservation',
        subjectId: 'enrollment_course_expiry_unit_a',
      })
    );
  });

  it('maps canonical command results without duplicating expiry policy', () => {
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        commandSuccessResult('expire_guest_reservation', correlationId)
      )
    ).toBe('expired');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          })
        )
      )
    ).toBe('fully_funded');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'conflict' },
          })
        )
      )
    ).toBe('already_terminal');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
          })
        )
      )
    ).toBe('already_ineligible');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(
          new CanonicalCommandError('validation', {
            correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
          })
        )
      )
    ).toBe('already_ineligible');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(
          new CanonicalCommandError('validation', {
            correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          })
        )
      )
    ).toBe('invalid_integrity');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(new CanonicalCommandError('stale_version', { correlationId }))
      )
    ).toBe('stale');
    expect(
      classifyExpireGuestCourseReservationCommandResult(
        errorResult(new CanonicalCommandError('internal', { correlationId }))
      )
    ).toBe('failed');
  });
});
