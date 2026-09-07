import { describe, expect, it } from 'vitest';
import {
  evaluateGuestBookingFundedConfirmation,
  evaluateGuestLessonReservationExpiry,
  evaluateGuestManualPaymentAcceptance,
  isGuestReservationExpired,
} from './guestBooking';
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

describe('evaluateGuestBookingFundedConfirmation', () => {
  it('accepts a fully funded pending guest Booking after reservationExpiresAt when service has not started', () => {
    expect(
      evaluateGuestBookingFundedConfirmation({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'accepted' });
  });

  it('still rejects started, confirmed, terminal, and non-guest Bookings', () => {
    expect(
      evaluateGuestBookingFundedConfirmation({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        serviceStartsAt: past,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'service_started' });
    expect(
      evaluateGuestBookingFundedConfirmation({
        bookingOrigin: 'guest',
        lifecycleStatus: 'confirmed',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'already_confirmed' });
    expect(
      evaluateGuestBookingFundedConfirmation({
        bookingOrigin: 'guest',
        lifecycleStatus: 'cancelled',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'rejected', reason: 'terminal_or_non_pending' });
    expect(
      evaluateGuestBookingFundedConfirmation({
        bookingOrigin: 'admin',
        lifecycleStatus: 'pending',
        serviceStartsAt: future,
        now,
      })
    ).toEqual({ outcome: 'not_applicable' });
  });
});

describe('isGuestReservationExpired', () => {
  it('treats the deadline as inclusive (now >= reservationExpiresAt)', () => {
    expect(isGuestReservationExpired({ now: past, reservationExpiresAt: now })).toBe(false);
    expect(isGuestReservationExpired({ now, reservationExpiresAt: now })).toBe(true);
    expect(isGuestReservationExpired({ now: future, reservationExpiresAt: now })).toBe(true);
  });
});

describe('evaluateGuestLessonReservationExpiry', () => {
  const pendingUnpaid = {
    bookingOrigin: 'guest',
    lifecycleStatus: 'pending',
    reservationExpiresAt: past,
    now,
    hasPayment: true,
    paymentFullyFunded: false,
  } as const;

  it('expires an unpaid pending guest Booking after the deadline', () => {
    expect(evaluateGuestLessonReservationExpiry(pendingUnpaid)).toEqual({ outcome: 'expire' });
  });

  it('expires a partially funded pending guest Booking after the deadline', () => {
    expect(
      evaluateGuestLessonReservationExpiry({
        ...pendingUnpaid,
        paymentFullyFunded: false,
      })
    ).toEqual({ outcome: 'expire' });
  });

  it('does not expire a fully funded Payment regardless of deadline', () => {
    expect(
      evaluateGuestLessonReservationExpiry({
        ...pendingUnpaid,
        paymentFullyFunded: true,
      })
    ).toEqual({ outcome: 'rejected', reason: 'fully_funded' });
  });

  it('does not expire before the deadline', () => {
    expect(
      evaluateGuestLessonReservationExpiry({
        ...pendingUnpaid,
        reservationExpiresAt: future,
      })
    ).toEqual({ outcome: 'rejected', reason: 'not_yet_expired' });
  });

  it('expires at the exact deadline boundary', () => {
    expect(
      evaluateGuestLessonReservationExpiry({
        ...pendingUnpaid,
        reservationExpiresAt: now,
      })
    ).toEqual({ outcome: 'expire' });
  });

  it('rejects non-guest, confirmed, terminal, and missing-Payment rows without expiring', () => {
    expect(
      evaluateGuestLessonReservationExpiry({ ...pendingUnpaid, bookingOrigin: 'admin' })
    ).toEqual({ outcome: 'rejected', reason: 'not_guest' });
    expect(
      evaluateGuestLessonReservationExpiry({ ...pendingUnpaid, lifecycleStatus: 'confirmed' })
    ).toEqual({ outcome: 'rejected', reason: 'already_confirmed' });
    expect(
      evaluateGuestLessonReservationExpiry({ ...pendingUnpaid, lifecycleStatus: 'cancelled' })
    ).toEqual({ outcome: 'rejected', reason: 'terminal_or_non_pending' });
    expect(
      evaluateGuestLessonReservationExpiry({
        ...pendingUnpaid,
        lifecycleStatus: 'completed',
      })
    ).toEqual({ outcome: 'rejected', reason: 'terminal_or_non_pending' });
    expect(
      evaluateGuestLessonReservationExpiry({ ...pendingUnpaid, lifecycleStatus: 'no_show' })
    ).toEqual({ outcome: 'rejected', reason: 'terminal_or_non_pending' });
    expect(
      evaluateGuestLessonReservationExpiry({ ...pendingUnpaid, hasPayment: false })
    ).toEqual({ outcome: 'rejected', reason: 'missing_payment' });
  });

  it('does not take participant count or locally computed price as inputs', () => {
    expect(evaluateGuestLessonReservationExpiry(pendingUnpaid)).toEqual(
      evaluateGuestLessonReservationExpiry({
        bookingOrigin: 'guest',
        lifecycleStatus: 'pending',
        reservationExpiresAt: past,
        now,
        hasPayment: true,
        paymentFullyFunded: false,
      })
    );
  });
});
