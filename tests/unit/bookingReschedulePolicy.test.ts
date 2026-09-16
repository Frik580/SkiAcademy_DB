import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  evaluateClientSelfServiceRescheduleTiming,
  isAdministratorRescheduleEligibleBooking,
  isClientSelfServiceRescheduleAllowanceAvailable,
  isRescheduleEligibleBooking,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { BookingSchema } from '@ski-academy/shared-domain';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';

const startAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));

describe('booking reschedule policy', () => {
  it('allows client self-service reschedule at exact 24h boundary', () => {
    const exactly24h = addMillisecondsToCanonicalTimestamp(
      startAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    );
    const oneMsUnder = addMillisecondsToCanonicalTimestamp(
      startAt,
      -INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS + 1
    );

    expect(evaluateClientSelfServiceRescheduleTiming({ requestAt: exactly24h, startAt })).toBe(
      'allowed'
    );
    expect(evaluateClientSelfServiceRescheduleTiming({ requestAt: oneMsUnder, startAt })).toBe(
      'inside_window_rejected'
    );
  });

  it('rejects client self-service reschedule at or after startAt', () => {
    expect(evaluateClientSelfServiceRescheduleTiming({ requestAt: startAt, startAt })).toBe(
      'after_start_rejected'
    );
  });

  it('allows client reschedule only for confirmed non-terminal bookings', () => {
    const confirmed = canonicalBookingCollaborationFixtures.individualBooking;
    expect(isRescheduleEligibleBooking(confirmed)).toBe(true);
    expect(
      isRescheduleEligibleBooking(canonicalBookingCollaborationFixtures.guestPendingBooking)
    ).toBe(false);
  });

  it('allows administrator reschedule for active pending unpaid reservations', () => {
    const now = timestampFromDate(new Date('2026-01-01T00:30:00.000Z'));
    const pending = canonicalBookingCollaborationFixtures.guestPendingBooking;
    expect(isAdministratorRescheduleEligibleBooking(pending, now)).toBe(true);
    const expiredNow = timestampFromDate(new Date('2026-01-01T02:00:00.000Z'));
    expect(isAdministratorRescheduleEligibleBooking(pending, expiredNow)).toBe(false);
    expect(
      isAdministratorRescheduleEligibleBooking(
        canonicalBookingCollaborationFixtures.individualBooking,
        now
      )
    ).toBe(true);
  });

  it('tracks one lifetime self-service allowance via consumed timestamp', () => {
    const booking = BookingSchema.parse({
      ...canonicalBookingCollaborationFixtures.individualBooking,
      clientSelfServiceRescheduleConsumedAt: undefined,
    });
    expect(isClientSelfServiceRescheduleAllowanceAvailable(booking)).toBe(true);

    const consumed = BookingSchema.parse({
      ...booking,
      clientSelfServiceRescheduleConsumedAt: timestampFromDate(
        new Date('2026-01-02T00:00:00.000Z')
      ),
    });
    expect(isClientSelfServiceRescheduleAllowanceAvailable(consumed)).toBe(false);
  });
});
