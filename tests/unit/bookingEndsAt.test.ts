import { describe, expect, it } from 'vitest';
import {
  computeBookingEndsAtIso,
  isBookingEligibleForAutoComplete,
  withBookingEndsAt,
} from '../../src/domain/booking/bookingEndsAt';
import { Booking } from '../../src/types';

const baseLesson: Booking = {
  id: 'booking-1',
  userId: 'client-1',
  instructorId: 'instructor-1',
  instructorName: 'Coach',
  instructorAvatar: '',
  date: '2026-08-10',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed',
  difficulty: 'beginner',
};

describe('bookingEndsAt', () => {
  it('computes lesson end time from date, time, and duration', () => {
    const endsAt = computeBookingEndsAtIso(baseLesson);
    expect(endsAt).toBeTruthy();

    const endsAtDate = new Date(endsAt!);
    expect(endsAtDate.getHours()).toBe(12);
    expect(endsAtDate.getMinutes()).toBe(0);
  });

  it('attaches endsAt when writing bookings', () => {
    const withEndsAt = withBookingEndsAt(baseLesson);
    expect(withEndsAt.endsAt).toBe(computeBookingEndsAtIso(baseLesson));
  });

  it('marks confirmed lessons as eligible after they end', () => {
    const booking = withBookingEndsAt({ ...baseLesson, status: 'confirmed' });
    const afterLesson = new Date(booking.endsAt!);
    afterLesson.setMinutes(afterLesson.getMinutes() + 1);

    expect(isBookingEligibleForAutoComplete(booking, afterLesson)).toBe(true);
    expect(isBookingEligibleForAutoComplete({ ...booking, status: 'cancelled' }, afterLesson)).toBe(
      false
    );
  });
});
