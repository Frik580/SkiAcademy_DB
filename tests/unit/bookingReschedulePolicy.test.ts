import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS,
  addMillisecondsToCanonicalTimestamp,
  evaluateClientSelfServiceRescheduleTiming,
  isClientSelfServiceRescheduleAllowanceAvailable,
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

    expect(
      evaluateClientSelfServiceRescheduleTiming({ requestAt: exactly24h, startAt })
    ).toBe('allowed');
    expect(
      evaluateClientSelfServiceRescheduleTiming({ requestAt: oneMsUnder, startAt })
    ).toBe('inside_window_rejected');
  });

  it('rejects client self-service reschedule at or after startAt', () => {
    expect(
      evaluateClientSelfServiceRescheduleTiming({ requestAt: startAt, startAt })
    ).toBe('after_start_rejected');
  });

  it('tracks one lifetime self-service allowance via consumed timestamp', () => {
    const booking = BookingSchema.parse({
      ...canonicalBookingCollaborationFixtures.individualBooking,
      clientSelfServiceRescheduleConsumedAt: undefined,
    });
    expect(isClientSelfServiceRescheduleAllowanceAvailable(booking)).toBe(true);

    const consumed = BookingSchema.parse({
      ...booking,
      clientSelfServiceRescheduleConsumedAt: timestampFromDate(new Date('2026-01-02T00:00:00.000Z')),
    });
    expect(isClientSelfServiceRescheduleAllowanceAvailable(consumed)).toBe(false);
  });
});
