import {
  BookingIdSchema,
  INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH,
  normalizeInstructorReviewComment,
  parseCommandResultPayload,
  type IdempotencyKey,
} from '@ski-academy/shared-domain';
import {
  executeAuthenticatedCanonicalCommand,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  queryAccountInstructorReviewReadModels,
  queryPublicInstructorRatingSummaries,
} from '../../lib/canonical/canonicalReadModelClient';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useLessonBookingStore } from '../lesson-bookings';
import { logger } from '../../shared';
import { mergeAccountReviewBookingStates } from './mergeAccountReviewBookingStates';

export { INSTRUCTOR_REVIEW_COMMENT_MAX_LENGTH };

export function deriveCreateReviewIdempotencyKey(bookingId: string): IdempotencyKey {
  return `create-instructor-review:${bookingId}` as IdempotencyKey;
}

export async function refreshCanonicalReviewData(bookingIds?: readonly string[]): Promise<void> {
  const visibleBookingIds = [
    ...useLessonBookingStore.getState().items.keys(),
    ...(bookingIds ?? []),
  ];
  const accountResult = await queryAccountInstructorReviewReadModels(
    [...new Set(visibleBookingIds)].map((bookingId) => BookingIdSchema.parse(bookingId))
  );
  const instructorIds = [
    ...new Set([
      ...useBookingsStore.getState().instructors.map((instructor) => instructor.id),
      ...accountResult.reviews.map((review) => review.instructorId as string),
    ]),
  ];
  const summaries = await queryPublicInstructorRatingSummaries(
    instructorIds.map((instructorId) => instructorId as never)
  );
  const previousState = useBookingsStore.getState();
  const requestedBookingIds = [...new Set(visibleBookingIds)].map((bookingId) =>
    BookingIdSchema.parse(bookingId)
  );
  useBookingsStore.getState().setCanonicalReviewData({
    summaries: summaries.summaries,
    reviews: accountResult.reviews,
    bookingStates: mergeAccountReviewBookingStates(
      previousState.reviewBookingStates,
      accountResult.bookingStates,
      requestedBookingIds
    ),
  });
}

export async function createCanonicalInstructorReview(input: {
  readonly accountId: string;
  readonly bookingId: string;
  readonly rating: number;
  readonly comment?: string;
  readonly exercisedCapability: ClientCallableCapability;
}): Promise<'created' | 'already_exists'> {
  const comment = normalizeInstructorReviewComment(input.comment);
  const result = await executeAuthenticatedCanonicalCommand(input.accountId, {
    kind: 'create_instructor_review',
    intent: {
      bookingId: BookingIdSchema.parse(input.bookingId),
      rating: input.rating,
      ...(comment ? { comment } : {}),
    },
    idempotencyKey: deriveCreateReviewIdempotencyKey(input.bookingId),
    exercisedCapability: input.exercisedCapability,
  });
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
  if (result.status !== 'success') {
    throw new Error('Review command did not succeed.');
  }
  const payload = parseCommandResultPayload('create_instructor_review', result.payload);
  if (!payload.success) {
    throw new Error('Review command returned an invalid payload.');
  }

  try {
    await refreshCanonicalReviewData([input.bookingId]);
  } catch (refreshError) {
    // Mutation success remains success; the route-scoped sync will retry separately.
    logger.error('Review created but canonical review refresh failed:', refreshError);
    useBookingsStore.getState().requestReviewRefresh();
  }
  return payload.data.outcome;
}
