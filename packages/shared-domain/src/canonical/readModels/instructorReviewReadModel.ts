import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  ReviewIdSchema,
} from '../identifiers';
import { InstructorReviewCommentSchema, InstructorReviewRatingSchema } from '../instructorReview';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';
import { LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX } from './lessonBookingReadModel';

export const INSTRUCTOR_REVIEW_READ_MODEL_PAGE_SIZE_DEFAULT = 25;
export const INSTRUCTOR_REVIEW_READ_MODEL_PAGE_SIZE_MAX = 50;

/** Max bookingIds per account_reviews callable; aligned with account lesson read-model page size. */
export const INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX = LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX;

export const InstructorRatingSummaryReadModelSchema = z
  .object({
    instructorId: InstructorIdSchema,
    rating: z.number().finite().min(1).max(5).nullable(),
    reviewsCount: z.number().finite().int().nonnegative(),
    ratingCounts: z.array(z.number().finite().int().nonnegative()).length(5),
    revision: AggregateRevisionSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();

export type InstructorRatingSummaryReadModel = Readonly<
  z.output<typeof InstructorRatingSummaryReadModelSchema>
>;

export const InstructorReviewReadModelSchema = z
  .object({
    reviewId: ReviewIdSchema,
    bookingId: BookingIdSchema.optional(),
    managingAccountId: AccountIdSchema.optional(),
    instructorId: InstructorIdSchema,
    rating: InstructorReviewRatingSchema,
    comment: InstructorReviewCommentSchema.optional(),
    authorDisplayName: z.string().trim().min(1).max(200),
    authorAvatarUrl: z.string().trim().min(1).max(2_048).optional(),
    createdAt: CanonicalTimestampSchema,
    revision: AggregateRevisionSchema,
  })
  .strict();

export type InstructorReviewReadModel = Readonly<z.output<typeof InstructorReviewReadModelSchema>>;

export const AccountReviewBookingStateSchema = z
  .object({
    bookingId: BookingIdSchema,
    instructorId: InstructorIdSchema,
    eligible: z.boolean(),
    reviewed: z.boolean(),
    reviewId: ReviewIdSchema.optional(),
    reviewedAt: CanonicalTimestampSchema.optional(),
  })
  .strict()
  .superRefine((state, context) => {
    if (state.reviewed !== Boolean(state.reviewId && state.reviewedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['reviewed'],
        message: 'Reviewed state requires review identity and timestamp',
      });
    }
  });

export type AccountReviewBookingState = Readonly<z.output<typeof AccountReviewBookingStateSchema>>;

export const InstructorReviewReadModelCursorSchema = z
  .object({
    createdAtSeconds: z.number().int(),
    createdAtNanoseconds: z.number().int().min(0).max(999_999_999),
    reviewId: ReviewIdSchema,
  })
  .strict();

export type InstructorReviewReadModelCursor = Readonly<
  z.output<typeof InstructorReviewReadModelCursorSchema>
>;

export const QueryInstructorReviewReadModelsInputSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('public_summaries'),
      instructorIds: z.array(InstructorIdSchema).min(1).max(100),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('instructor_reviews'),
      instructorId: InstructorIdSchema,
      pageSize: z.number().int().min(1).max(INSTRUCTOR_REVIEW_READ_MODEL_PAGE_SIZE_MAX).optional(),
      cursor: z.string().min(1).max(1_024).optional(),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('account_reviews'),
      bookingIds: z.array(BookingIdSchema).min(1).max(INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX),
      idempotencyKey: IdempotencyKeySchema.optional(),
    })
    .strict(),
]);

export type QueryInstructorReviewReadModelsInput = Readonly<
  z.output<typeof QueryInstructorReviewReadModelsInputSchema>
>;

export const QueryInstructorReviewReadModelsResultSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('public_summaries'),
      summaries: z.array(InstructorRatingSummaryReadModelSchema),
    })
    .strict(),
  z
    .object({
      scope: z.literal('instructor_reviews'),
      summary: InstructorRatingSummaryReadModelSchema,
      reviews: z.array(InstructorReviewReadModelSchema),
      hasMore: z.boolean(),
      nextCursor: z.string().optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal('account_reviews'),
      reviews: z.array(InstructorReviewReadModelSchema),
      bookingStates: z.array(AccountReviewBookingStateSchema),
    })
    .strict(),
]);

export type QueryInstructorReviewReadModelsResult = Readonly<
  z.output<typeof QueryInstructorReviewReadModelsResultSchema>
>;

export function encodeInstructorReviewReadModelCursor(
  cursor: InstructorReviewReadModelCursor
): string {
  return Buffer.from(
    JSON.stringify(InstructorReviewReadModelCursorSchema.parse(cursor)),
    'utf8'
  ).toString('base64url');
}

export function decodeInstructorReviewReadModelCursor(
  encoded: string
): InstructorReviewReadModelCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const result = InstructorReviewReadModelCursorSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
