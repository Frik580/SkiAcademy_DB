import { describe, expect, it } from 'vitest';
import {
  CanonicalCommandError,
  commandErrorResult,
  commandSuccessResult,
  CorrelationIdSchema,
} from '@ski-academy/shared-domain';
import {
  classifyExpireGuestReservationCommandResult,
  GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES,
  GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE,
} from './guestLessonReservationExpirySweep';

const correlationId = CorrelationIdSchema.parse('correlation_expiry_sweep_unit_01');

function errorResult(
  error: CanonicalCommandError
): ReturnType<typeof commandErrorResult<'expire_guest_reservation'>> {
  return commandErrorResult('expire_guest_reservation', correlationId, error.toTransport());
}

describe('guest lesson reservation expiry sweep mapping', () => {
  it('keeps discovery bounded', () => {
    expect(GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE).toBe(25);
    expect(GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES).toBe(100);
    expect(GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_MAX_CANDIDATES).toBeGreaterThanOrEqual(
      GUEST_LESSON_RESERVATION_EXPIRY_SWEEP_PAGE_SIZE
    );
  });

  it('maps command results to sweep outcomes without duplicating expiry policy', () => {
    expect(
      classifyExpireGuestReservationCommandResult(
        commandSuccessResult('expire_guest_reservation', correlationId)
      )
    ).toBe('expired');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          })
        )
      )
    ).toBe('fully_funded');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
          })
        )
      )
    ).toBe('already_ineligible');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(
          new CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { resourceKind: 'booking', reason: 'conflict' },
          })
        )
      )
    ).toBe('already_terminal');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(
          new CanonicalCommandError('validation', {
            correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          })
        )
      )
    ).toBe('invalid_integrity');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(new CanonicalCommandError('stale_version', { correlationId }))
      )
    ).toBe('stale');
    expect(
      classifyExpireGuestReservationCommandResult(
        errorResult(new CanonicalCommandError('internal', { correlationId }))
      )
    ).toBe('failed');
  });
});
