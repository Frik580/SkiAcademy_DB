import { describe, expect, it } from 'vitest';
import { addMillisecondsToCanonicalTimestamp } from './guestBooking';
import { timestampFromDate } from './primitives';
import {
  COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS,
  COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS,
  calculatePolicyRefundAmount,
  evaluateClientCourseCancellationTiming,
  isCourseCapacityFrozen,
  projectCourseCancellationFinancialEffects,
  resolveAdminCancellationApprovalTerminalStatus,
  shouldReleasePreStartSeatOnTerminalization,
} from './courseEnrollmentCancellationPolicy';

const startAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));

describe('course enrollment cancellation policy', () => {
  it('uses exact 7-day boundary for direct cancellation at 100%', () => {
    const exactly7d = addMillisecondsToCanonicalTimestamp(
      startAt,
      -COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS
    );
    const oneMsUnder = addMillisecondsToCanonicalTimestamp(
      startAt,
      -COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS + 1
    );

    expect(evaluateClientCourseCancellationTiming({ requestAt: exactly7d, startAt })).toEqual({
      kind: 'direct_cancel',
      refundPercentBasisPoints: 10_000,
    });
    expect(evaluateClientCourseCancellationTiming({ requestAt: oneMsUnder, startAt })).toEqual({
      kind: 'direct_cancel',
      refundPercentBasisPoints: 5_000,
    });
  });

  it('uses exact 2-day boundary for direct cancellation at 50%', () => {
    const exactly2d = addMillisecondsToCanonicalTimestamp(
      startAt,
      -COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS
    );
    const oneMsUnder = addMillisecondsToCanonicalTimestamp(
      startAt,
      -COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS + 1
    );

    expect(evaluateClientCourseCancellationTiming({ requestAt: exactly2d, startAt })).toEqual({
      kind: 'direct_cancel',
      refundPercentBasisPoints: 5_000,
    });
    expect(evaluateClientCourseCancellationTiming({ requestAt: oneMsUnder, startAt })).toEqual({
      kind: 'pending_request',
    });
  });

  it('requires pending cancellation inside 2 days or after start', () => {
    expect(
      evaluateClientCourseCancellationTiming({ requestAt: startAt, startAt })
    ).toEqual({ kind: 'pending_request' });
    expect(
      evaluateClientCourseCancellationTiming({
        requestAt: addMillisecondsToCanonicalTimestamp(startAt, 1),
        startAt,
      })
    ).toEqual({ kind: 'pending_request' });
  });

  it('freezes capacity at course start and skips pre-start seat release after start', () => {
    const now = startAt;
    expect(isCourseCapacityFrozen({ now, courseStartAt: startAt })).toBe(true);
    expect(
      shouldReleasePreStartSeatOnTerminalization({ now, courseStartAt: startAt })
    ).toBe(false);
    expect(
      shouldReleasePreStartSeatOnTerminalization({
        now: addMillisecondsToCanonicalTimestamp(startAt, -1),
        courseStartAt: startAt,
      })
    ).toBe(true);
  });

  it('refunds policy percent of retained funds only', () => {
    const payment = {
      originalPrice: 10_000,
      price: 10_000,
      paidAmount: 8_000,
      refundedAmount: 0,
      retainedAmount: 8_000,
      settledAmount: 8_000,
      writtenOffAmount: 0,
      outstandingAmount: 2_000,
    };
    expect(
      calculatePolicyRefundAmount({ payment, refundPercentBasisPoints: 5_000 })
    ).toBe(4_000);
    const projected = projectCourseCancellationFinancialEffects(payment, 4_000);
    expect(projected.payment.refundedAmount).toBe(4_000);
    expect(projected.payment.retainedAmount).toBe(4_000);
    expect(projected.payment.writtenOffAmount).toBe(2_000);
    expect(projected.payment.outstandingAmount).toBe(0);
  });

  it('applies floor-half-up rounding for odd retained 50% refunds', () => {
    const payment = {
      originalPrice: 10_001,
      price: 10_001,
      paidAmount: 10_001,
      refundedAmount: 0,
      retainedAmount: 10_001,
      settledAmount: 10_001,
      writtenOffAmount: 0,
      outstandingAmount: 0,
    };
    expect(calculatePolicyRefundAmount({ payment, refundPercentBasisPoints: 5_000 })).toBe(5_001);
  });

  it('routes admin approval terminal status by refund and guest origin', () => {
    expect(
      resolveAdminCancellationApprovalTerminalStatus({
        refundAmount: 1,
        bookingOrigin: 'account',
      })
    ).toBe('cancelled');
    expect(
      resolveAdminCancellationApprovalTerminalStatus({
        refundAmount: 0,
        bookingOrigin: 'account',
      })
    ).toBe('withdrawn');
    expect(
      resolveAdminCancellationApprovalTerminalStatus({
        refundAmount: 0,
        bookingOrigin: 'guest',
      })
    ).toBe('cancelled');
  });
});
