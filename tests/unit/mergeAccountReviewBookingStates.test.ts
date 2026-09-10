import { describe, expect, it } from 'vitest';
import { mergeAccountReviewBookingStates } from '../../src/features/reviews/mergeAccountReviewBookingStates';

describe('mergeAccountReviewBookingStates', () => {
  it('keeps previous reviewed state when a refresh chunk omits a booking', () => {
    const previous = [
      {
        bookingId: 'booking-merge-known',
        instructorId: 'instructor-merge',
        eligible: true,
        reviewed: true,
        reviewId: 'review-merge-known',
        reviewedAt: { seconds: 1, nanoseconds: 0 },
      },
    ];
    const merged = mergeAccountReviewBookingStates(previous, [], ['booking-merge-known' as never]);
    expect(merged).toEqual(previous);
  });

  it('overrides previous state when incoming includes the booking', () => {
    const previous = [
      {
        bookingId: 'booking-merge-update',
        instructorId: 'instructor-merge',
        eligible: true,
        reviewed: false,
      },
    ];
    const incoming = [
      {
        bookingId: 'booking-merge-update',
        instructorId: 'instructor-merge',
        eligible: true,
        reviewed: true,
        reviewId: 'review-merge-update',
        reviewedAt: { seconds: 2, nanoseconds: 0 },
      },
    ];
    const merged = mergeAccountReviewBookingStates(previous, incoming, [
      'booking-merge-update' as never,
    ]);
    expect(merged[0]?.reviewed).toBe(true);
  });
});
