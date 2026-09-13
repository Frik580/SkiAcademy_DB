import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountReviewBookingState } from '@ski-academy/shared-domain';
import { INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX } from '@ski-academy/shared-domain';
import { mergeAccountReviewBookingStates } from '../../src/features/reviews/mergeAccountReviewBookingStates';
import {
  queryAccountInstructorReviewReadModels,
  __resetCanonicalReadInFlightRegistryForTests,
} from '../../src/lib/canonical/canonicalReadModelClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

/** Mirrors PersonalCabinet / AppShell review CTA eligibility (authoritative state only). */
function bookingsEligibleForReviewCta(
  bookingIds: readonly string[],
  reviewBookingStates: readonly AccountReviewBookingState[],
  dismissedReviewIds: readonly string[] = []
): string[] {
  const statesByBookingId = new Map(
    reviewBookingStates.map((state) => [state.bookingId as string, state])
  );
  return bookingIds.filter((id) => {
    const state = statesByBookingId.get(id);
    if (state?.eligible !== true) return false;
    if (dismissedReviewIds.includes(id)) return false;
    return state.reviewed !== true;
  });
}

describe('account_reviews chunk transport failure vs review CTA', () => {
  beforeEach(() => {
    callFunctionMock.mockReset();
    __resetCanonicalReadInFlightRegistryForTests();
  });

  it('rejects an incomplete authority projection so callers keep prior CTA state and retry', async () => {
    const freshBookingId = 'booking-fresh-chunk-fail-26';
    const ids = Array.from(
      { length: INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX + 1 },
      (_, index) =>
        (index === INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX
          ? freshBookingId
          : `booking-fresh-chunk-fail-${index}`) as never
    );

    callFunctionMock
      .mockResolvedValueOnce({
        scope: 'account_reviews',
        reviews: [],
        bookingStates: Array.from(
          { length: INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX },
          (_, index) => ({
            bookingId: `booking-fresh-chunk-fail-${index}`,
            instructorId: 'instructor-fresh-chunk-fail',
            eligible: true,
            reviewed: false,
          })
        ),
      })
      .mockRejectedValueOnce(new Error('transport failure'));

    await expect(queryAccountInstructorReviewReadModels(ids)).rejects.toThrow('transport failure');

    const mergedAfterSync = mergeAccountReviewBookingStates([], [], ids);

    const ctaBookingIds = bookingsEligibleForReviewCta([freshBookingId], mergedAfterSync);
    expect(ctaBookingIds).toEqual([]);

    const authoritativeEligible = mergeAccountReviewBookingStates(
      mergedAfterSync,
      [
        {
          bookingId: freshBookingId as never,
          instructorId: 'instructor-fresh-chunk-fail' as never,
          eligible: true,
          reviewed: false,
        },
      ],
      [freshBookingId as never]
    );
    expect(bookingsEligibleForReviewCta([freshBookingId], authoritativeEligible)).toEqual([
      freshBookingId,
    ]);
  });
});
