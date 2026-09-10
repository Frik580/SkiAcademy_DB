import { describe, expect, it } from 'vitest';
import { parseCommandIntent } from './commands/commandIntents';
import {
  INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH,
  InstructorRatingSummarySchema,
  normalizeInstructorReviewComment,
} from './instructorReview';

describe('canonical instructor review contract', () => {
  it.each([0, 6, 2.5, Number.NaN])('rejects invalid rating %s', (rating) => {
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        rating,
      }).success
    ).toBe(false);
  });

  it('accepts integer ratings 1..5 and rejects spoofed instructor identity', () => {
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        rating: 1,
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        instructorId: 'spoofed-instructor',
        rating: 5,
      }).success
    ).toBe(false);
  });

  it('normalizes optional comments and enforces the shared 1000 character limit', () => {
    expect(normalizeInstructorReviewComment(undefined)).toBeUndefined();
    expect(normalizeInstructorReviewComment('   ')).toBeUndefined();
    expect(normalizeInstructorReviewComment('  useful feedback  ')).toBe('useful feedback');
    expect(normalizeInstructorReviewComment('x'.repeat(INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH)))
      .toHaveLength(INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH);
    expect(() =>
      normalizeInstructorReviewComment('x'.repeat(INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH + 1))
    ).toThrow();
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        rating: 4,
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        rating: 4,
        comment: '   ',
      }).success
    ).toBe(true);
    expect(
      parseCommandIntent('create_instructor_review', {
        bookingId: 'booking-review-contract',
        rating: 4,
        comment: 'x'.repeat(INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
  });

  it('rejects a projection whose distribution does not prove the rating sum', () => {
    expect(
      InstructorRatingSummarySchema.safeParse({
        instructorId: 'instructor-review-contract',
        rating: 5,
        ratingSum: 5,
        ratingCounts: [1, 0, 0, 0, 0],
        reviewsCount: 1,
        revision: 1,
        createdAt: { seconds: 1, nanoseconds: 0 },
        updatedAt: { seconds: 1, nanoseconds: 0 },
        audit: {
          createdByCommandId: 'command-create',
          lastChangedByCommandId: 'command-create',
          correlationId: 'correlation-review-contract',
        },
      }).success
    ).toBe(false);
  });
});
