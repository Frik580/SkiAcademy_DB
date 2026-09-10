import { describe, expect, it } from 'vitest';
import {
  INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX,
  QueryInstructorReviewReadModelsInputSchema,
  decodeInstructorReviewReadModelCursor,
  encodeInstructorReviewReadModelCursor,
} from './instructorReviewReadModel';

function bookingId(index: number): string {
  return `booking-review-schema-${index}`;
}

describe('instructor review read-model transport', () => {
  it('supports public, paginated instructor, and authenticated account scopes', () => {
    expect(
      QueryInstructorReviewReadModelsInputSchema.safeParse({
        scope: 'public_summaries',
        instructorIds: ['instructor-review-read-model'],
      }).success
    ).toBe(true);
    expect(
      QueryInstructorReviewReadModelsInputSchema.safeParse({
        scope: 'instructor_reviews',
        instructorId: 'instructor-review-read-model',
        pageSize: 50,
      }).success
    ).toBe(true);
    expect(
      QueryInstructorReviewReadModelsInputSchema.safeParse({
        scope: 'account_reviews',
      }).success
    ).toBe(true);
  });

  it('rejects account_reviews bookingIds above the callable max', () => {
    const atMax = QueryInstructorReviewReadModelsInputSchema.safeParse({
      scope: 'account_reviews',
      bookingIds: Array.from({ length: INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX }, (_, index) =>
        bookingId(index)
      ),
    });
    expect(atMax.success).toBe(true);

    const overMax = QueryInstructorReviewReadModelsInputSchema.safeParse({
      scope: 'account_reviews',
      bookingIds: Array.from({ length: INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX + 1 }, (_, index) =>
        bookingId(index)
      ),
    });
    expect(overMax.success).toBe(false);
    expect(overMax.error?.issues[0]).toMatchObject({
      code: 'too_big',
      path: ['bookingIds'],
    });

    const twentySeven = QueryInstructorReviewReadModelsInputSchema.safeParse({
      scope: 'account_reviews',
      bookingIds: Array.from({ length: 27 }, (_, index) => bookingId(index)),
    });
    expect(twentySeven.success).toBe(false);
  });

  it('accepts a single account_reviews bookingId and omits bookingIds', () => {
    expect(
      QueryInstructorReviewReadModelsInputSchema.safeParse({
        scope: 'account_reviews',
        bookingIds: [bookingId(1)],
      }).success
    ).toBe(true);
    expect(
      QueryInstructorReviewReadModelsInputSchema.safeParse({
        scope: 'account_reviews',
        bookingIds: [],
      }).success
    ).toBe(true);
  });

  it('accepts the production account_reviews callable payload with transport idempotencyKey', () => {
    const productionPayload = {
      scope: 'account_reviews',
      bookingIds: [
        'booking_admin_11f5bc9a69f74ff9aad65905ff29fa6e',
        'booking_admin_9abece29f32a4436bafae30fcc7dd520',
      ],
      idempotencyKey:
        'read:instructor_review:ffdbb4efec02963a7f57d1c7d20d05455e36015491d28eb55242b9b54e6b459f',
    };
    const parsed = QueryInstructorReviewReadModelsInputSchema.safeParse(productionPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(productionPayload);
    }
  });

  it('still rejects unrecognized keys on account_reviews', () => {
    const parsed = QueryInstructorReviewReadModelsInputSchema.safeParse({
      scope: 'account_reviews',
      bookingIds: ['booking_admin_11f5bc9a69f74ff9aad65905ff29fa6e'],
      unexpectedField: true,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      code: 'unrecognized_keys',
      keys: ['unexpectedField'],
    });
  });

  it('round-trips deterministic pagination cursor data', () => {
    const cursor = {
      createdAtSeconds: 1_789_000_000,
      createdAtNanoseconds: 123_000_000,
      reviewId: 'review-read-model-cursor',
    } as const;
    expect(
      decodeInstructorReviewReadModelCursor(encodeInstructorReviewReadModelCursor(cursor))
    ).toEqual(cursor);
    expect(decodeInstructorReviewReadModelCursor('invalid')).toBeUndefined();
  });
});
