import { z } from 'zod';
import {
  AccountIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ReviewIdSchema,
} from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH = 1_000;

export const InstructorReviewRatingSchema = z.number().finite().int().min(1).max(5);

export const InstructorReviewCommentSchema = z
  .string()
  .trim()
  .min(1)
  .max(INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH);

export function normalizeInstructorReviewComment(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? InstructorReviewCommentSchema.parse(normalized) : undefined;
}

const ReviewAuditLinkSchema = z
  .object({
    createdByCommandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
  })
  .strict();

export const InstructorReviewSchema = z
  .object({
    reviewId: ReviewIdSchema,
    bookingId: BookingIdSchema,
    managingAccountId: AccountIdSchema,
    instructorId: InstructorIdSchema,
    rating: InstructorReviewRatingSchema,
    comment: InstructorReviewCommentSchema.optional(),
    attendanceEvidenceParticipantIds: z.array(ParticipantIdSchema).min(1),
    authorDisplayName: z.string().trim().min(1).max(200),
    authorAvatarUrl: z.string().trim().min(1).max(2_048).optional(),
    revision: AggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    audit: ReviewAuditLinkSchema,
  })
  .strict();

export type InstructorReview = Readonly<z.output<typeof InstructorReviewSchema>>;

export const InstructorRatingSummarySchema = z
  .object({
    instructorId: InstructorIdSchema,
    rating: z.number().finite().min(1).max(5).nullable(),
    ratingSum: z.number().finite().int().nonnegative(),
    ratingCounts: z.array(z.number().finite().int().nonnegative()).length(5),
    reviewsCount: z.number().finite().int().nonnegative(),
    revision: AggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: z
      .object({
        createdByCommandId: CommandIdSchema,
        lastChangedByCommandId: CommandIdSchema,
        correlationId: CorrelationIdSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.ratingCounts.reduce((sum, count) => sum + count, 0) !== summary.reviewsCount) {
      context.addIssue({
        code: 'custom',
        path: ['ratingCounts'],
        message: 'Rating distribution must match review count',
      });
    }
    const weightedRatingSum = summary.ratingCounts.reduce(
      (sum, count, index) => sum + count * (index + 1),
      0
    );
    if (weightedRatingSum !== summary.ratingSum) {
      context.addIssue({
        code: 'custom',
        path: ['ratingSum'],
        message: 'Rating sum must match the rating distribution',
      });
    }
    if (summary.reviewsCount === 0) {
      if (summary.rating !== null || summary.ratingSum !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['rating'],
          message: 'Zero-review summary must not expose a rating',
        });
      }
      return;
    }
    if (summary.rating === null || summary.rating !== summary.ratingSum / summary.reviewsCount) {
      context.addIssue({
        code: 'custom',
        path: ['rating'],
        message: 'Rating must be the canonical average',
      });
    }
  });

export type InstructorRatingSummary = Readonly<z.output<typeof InstructorRatingSummarySchema>>;
