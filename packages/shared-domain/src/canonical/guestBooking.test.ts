import { describe, expect, it } from 'vitest';
import { evaluateGuestManualPaymentAcceptance } from './guestBooking';
import { timestampFromDate } from './primitives';

const now = timestampFromDate(new Date('2026-01-01T10:30:00.000Z'));
const future = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));
const past = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

describe('evaluateGuestManualPaymentAcceptance', () => {
  it('does not apply to non-guest Bookings', () => {
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'admin',
        lifecycleStatus: 'pending',
        reservationExpiresAt: future,
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'not_applicable' });
  });

  it('accepts a pending unexpired guest Booking before service start', () => {
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        reservationExpiresAt: future,
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'accepted' });
  });

  it('rejects expired, started, confirmed, and terminal guest Bookings', () => {
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        reservationExpiresAt: past,
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'reservation_expired' });
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        reservationExpiresAt: future,
        serviceStartsAt: past,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'service_started' });
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'already_confirmed' });
    expect(
      evaluateGuestManualPaymentAcceptance({
        bookingOrigin: 'guest',
        lifecycleStatus: 'cancelled',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'terminal_or_non_pending' });
  });
});
