import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  calculateFullPaidRefundAmount,
  canonicalTimestampToEpochMs,
  evaluateClientCancellationTiming,
  projectCancellationFinancialEffects,
  resolveLateRejectionOutcome,
  timestampFromDate,
} from '@ski-academy/shared-domain';

const startAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));

describe('booking cancellation policy', () => {
  it('uses exact 24h boundary for direct cancellation', () => {
    const exactly24h = addMillisecondsToCanonicalTimestamp(
      startAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS
    );
    const oneMsUnder = addMillisecondsToCanonicalTimestamp(
      startAt,
      -INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS + 1
    );

    expect(evaluateClientCancellationTiming({ requestAt: exactly24h, startAt })).toBe(
      'direct_cancel'
    );
    expect(evaluateClientCancellationTiming({ requestAt: oneMsUnder, startAt })).toBe(
      'pending_request'
    );
  });

  it('rejects client cancellation at or after startAt', () => {
    expect(evaluateClientCancellationTiming({ requestAt: startAt, startAt })).toBe(
      'after_start_rejected'
    );
    expect(
      evaluateClientCancellationTiming({
        requestAt: addMillisecondsToCanonicalTimestamp(startAt, 1),
        startAt,
      })
    ).toBe('after_start_rejected');
  });

  it('refunds only actually paid retained funds', () => {
    const payment = {
      originalPrice: 12_000,
      price: 12_000,
      paidAmount: 5_000,
      refundedAmount: 0,
      retainedAmount: 5_000,
      settledAmount: 5_000,
      writtenOffAmount: 0,
      outstandingAmount: 7_000,
    };
    expect(calculateFullPaidRefundAmount(payment)).toBe(5_000);
    const projected = projectCancellationFinancialEffects(payment, 5_000);
    expect(projected.payment.refundedAmount).toBe(5_000);
    expect(projected.payment.retainedAmount).toBe(0);
    expect(projected.payment.settledAmount).toBe(5_000);
    expect(projected.payment.writtenOffAmount).toBe(7_000);
    expect(projected.payment.outstandingAmount).toBe(0);
  });

  it('resolves late rejection from attendance evidence only', () => {
    const startAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));
    const endsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));
    const booking = {
      occurrence: { interval: { startsAt: startAt, endsAt } },
    } as Parameters<typeof resolveLateRejectionOutcome>[0]['booking'];

    expect(
      resolveLateRejectionOutcome({
        now: timestampFromDate(new Date('2026-01-15T09:30:00.000Z')),
        booking,
        attendance: undefined,
      })
    ).toEqual({ outcome: 'confirmed' });

    expect(
      resolveLateRejectionOutcome({
        now: timestampFromDate(new Date('2026-01-15T11:00:00.000Z')),
        booking,
        attendance: undefined,
      })
    ).toEqual({ outcome: 'missing_attendance' });

    expect(
      resolveLateRejectionOutcome({
        now: timestampFromDate(new Date('2026-01-15T11:00:00.000Z')),
        booking,
        attendance: { attendanceStatus: 'present' } as never,
      })
    ).toEqual({ outcome: 'completed' });

    expect(
      resolveLateRejectionOutcome({
        now: timestampFromDate(new Date('2026-01-15T11:00:00.000Z')),
        booking,
        attendance: { attendanceStatus: 'absent' } as never,
      })
    ).toEqual({ outcome: 'no_show' });
  });
});
