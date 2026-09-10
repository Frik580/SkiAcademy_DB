import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AccountIdSchema,
  AggregateRevisionSchema,
  InstructorIdSchema,
  InstructorRatingSummaryReadModelSchema,
  QueryInstructorReviewReadModelsResultSchema,
  attendanceIdFromBookingIdentity,
  decodeInstructorReviewReadModelCursor,
  encodeInstructorReviewReadModelCursor,
  instructorReviewIdFromBookingAccount,
  timestampFromDate,
  type AccountId,
  type Booking,
  type BookingId,
  type InstructorRatingSummaryReadModel,
  type InstructorReview,
  type InstructorReviewReadModel,
  type QueryInstructorReviewReadModelsInput,
  type QueryInstructorReviewReadModelsResult,
} from '@ski-academy/shared-domain';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { attendancePath, parseAttendance } from '../bookings/attendanceStore';
import { parseBooking } from '../bookings/bookingStore';
import {
  parseInstructorRatingSummary,
  parseInstructorReview,
  instructorReviewPath,
} from '../reviews/instructorReviewStore';
import {
  loadAuthorizedAccountBookings,
  loadLessonBookingReadAuthorizationContext,
  canAccountViewLessonBookingService,
} from './lessonBookingReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';

export class InvalidInstructorReviewReadCursorError extends Error {
  constructor() {
    super('The instructor review cursor is invalid.');
    this.name = 'InvalidInstructorReviewReadCursorError';
  }
}

function toSummaryReadModel(
  instructorId: string,
  data: Record<string, unknown> | undefined
): InstructorRatingSummaryReadModel | undefined {
  const summary = parseInstructorRatingSummary(data);
  if (!summary || summary.instructorId !== instructorId) return undefined;
  return InstructorRatingSummaryReadModelSchema.parse({
    instructorId: summary.instructorId,
    rating: summary.rating,
    reviewsCount: summary.reviewsCount,
    ratingCounts: summary.ratingCounts,
    revision: summary.revision,
    updatedAt: summary.updatedAt,
  });
}

function zeroSummary(instructorId: ReturnType<typeof InstructorIdSchema.parse>) {
  return InstructorRatingSummaryReadModelSchema.parse({
    instructorId,
    rating: null,
    reviewsCount: 0,
    ratingCounts: [0, 0, 0, 0, 0],
    revision: AggregateRevisionSchema.parse(0),
    updatedAt: timestampFromDate(new Date(0)),
  });
}

function toReviewReadModel(
  review: InstructorReview,
  includeManagingAccountId = false
): InstructorReviewReadModel {
  return {
    reviewId: review.reviewId,
    ...(includeManagingAccountId ? { bookingId: review.bookingId } : {}),
    ...(includeManagingAccountId
      ? { managingAccountId: review.managingAccountId }
      : {}),
    instructorId: review.instructorId,
    rating: review.rating,
    ...(review.comment ? { comment: review.comment } : {}),
    authorDisplayName: review.authorDisplayName,
    ...(review.authorAvatarUrl ? { authorAvatarUrl: review.authorAvatarUrl } : {}),
    createdAt: review.createdAt,
    revision: review.revision,
  };
}

async function publicSummaries(
  firestore: Firestore,
  instructorIds: readonly ReturnType<typeof InstructorIdSchema.parse>[]
): Promise<QueryInstructorReviewReadModelsResult> {
  const snapshots = await Promise.all(
    instructorIds.map((instructorId) =>
      firestore.collection('instructor_rating_summaries').doc(instructorId).get()
    )
  );
  const summaries = snapshots
    .map((document) =>
      toSummaryReadModel(document.id, document.data() as Record<string, unknown> | undefined)
    )
    .filter((summary): summary is InstructorRatingSummaryReadModel => summary !== undefined);
  return QueryInstructorReviewReadModelsResultSchema.parse({
    scope: 'public_summaries',
    summaries,
  });
}

async function instructorReviews(
  firestore: Firestore,
  input: Extract<QueryInstructorReviewReadModelsInput, { scope: 'instructor_reviews' }>
): Promise<QueryInstructorReviewReadModelsResult> {
  const pageSize = input.pageSize ?? 25;
  const cursor = input.cursor
    ? decodeInstructorReviewReadModelCursor(input.cursor)
    : undefined;
  if (input.cursor && !cursor) throw new InvalidInstructorReviewReadCursorError();

  let query: Query = firestore
    .collection('instructor_reviews')
    .where('instructorId', '==', input.instructorId)
    .orderBy('createdAt.seconds', 'desc')
    .orderBy('createdAt.nanoseconds', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    query = query.startAfter(
      cursor.createdAtSeconds,
      cursor.createdAtNanoseconds,
      cursor.reviewId
    );
  }
  const snapshot = await query.limit(pageSize + 1).get();
  const pageDocuments = snapshot.docs.slice(0, pageSize);
  const reviews = pageDocuments
    .map((document) => parseInstructorReview(document.data() as Record<string, unknown>))
    .filter(
      (review): review is InstructorReview =>
        review !== undefined && review.instructorId === input.instructorId
    )
    .map((review) => toReviewReadModel(review));
  const hasMore = snapshot.docs.length > pageSize;
  const last = reviews.at(-1);

  const summarySnapshot = await firestore
    .collection('instructor_rating_summaries')
    .doc(input.instructorId)
    .get();
  const summary =
    toSummaryReadModel(
      input.instructorId,
      summarySnapshot.data() as Record<string, unknown> | undefined
    ) ?? zeroSummary(input.instructorId);

  return QueryInstructorReviewReadModelsResultSchema.parse({
    scope: 'instructor_reviews',
    summary,
    reviews,
    hasMore,
    ...(hasMore && last
      ? {
          nextCursor: encodeInstructorReviewReadModelCursor({
            createdAtSeconds: last.createdAt.seconds,
            createdAtNanoseconds: last.createdAt.nanoseconds,
            reviewId: last.reviewId,
          }),
        }
      : {}),
  });
}

async function accountReviews(
  firestore: Firestore,
  accountId: AccountId,
  bookingIds?: readonly BookingId[]
): Promise<QueryInstructorReviewReadModelsResult> {
  const [reviewSnapshot, authContext] = await Promise.all([
    firestore
      .collection('instructor_reviews')
      .where('managingAccountId', '==', accountId)
      .limit(200)
      .get(),
    loadLessonBookingReadAuthorizationContext(
      firestore,
      accountId,
      createReadModelRequestContext(firestore)
    ),
  ]);
  const reviews = reviewSnapshot.docs
    .map((document) => parseInstructorReview(document.data() as Record<string, unknown>))
    .filter(
      (review): review is InstructorReview =>
        review !== undefined && review.managingAccountId === accountId
    );
  const reviewsById = new Map(reviews.map((review) => [review.reviewId, review]));
  const bookings =
    bookingIds === undefined
      ? await loadAuthorizedAccountBookings(firestore, accountId, { authContext })
      : (
          await Promise.all(
            bookingIds.map(async (bookingId) => {
              const snapshot = await firestore.collection('bookings').doc(bookingId).get();
              const candidate = parseBooking(
                snapshot.data() as Record<string, unknown> | undefined
              );
              return candidate &&
                canAccountViewLessonBookingService(authContext, accountId, candidate)
                ? candidate
                : undefined;
            })
          )
        ).filter((booking): booking is Booking => booking !== undefined);
  const activeManagedParticipantIds = new Set(
    authContext.participantManagement
      .filter(
        (management) => management.status === 'active' && management.accountId === accountId
      )
      .map((management) => management.participantId)
  );

  const bookingStates = await Promise.all(
    bookings.map(async (booking) => {
      const reviewId = instructorReviewIdFromBookingAccount({
        bookingId: booking.bookingId,
        managingAccountId: accountId,
      });
      let review = reviewsById.get(reviewId);
      if (!review) {
        const reviewSnapshot = await firestore.doc(instructorReviewPath(reviewId)).get();
        const candidate = parseInstructorReview(
          reviewSnapshot.data() as Record<string, unknown> | undefined
        );
        if (candidate?.managingAccountId === accountId) {
          review = candidate;
          reviewsById.set(candidate.reviewId, candidate);
        }
      }
      const entirePartyManaged = booking.party.participantIds.every((participantId) =>
        activeManagedParticipantIds.has(participantId)
      );
      const attendanceSnapshots =
        booking.lifecycle.status === 'completed' && entirePartyManaged
          ? await Promise.all(
              booking.occurrence.serviceParty.participantIds.map((participantId) => {
                const attendanceId = attendanceIdFromBookingIdentity({
                  strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
                  subjectKind: 'booking',
                  occurrenceId: booking.occurrence.occurrenceId,
                  participantId,
                });
                return firestore.doc(attendancePath(attendanceId)).get();
              })
            )
          : [];
      const present = attendanceSnapshots.some((snapshot) => {
        const attendance = parseAttendance(
          snapshot.data() as Record<string, unknown> | undefined
        );
        return attendance?.attendanceStatus === 'present';
      });
      return {
        bookingId: booking.bookingId,
        instructorId: booking.occurrence.instructorId,
        eligible: !review && booking.lifecycle.status === 'completed' && entirePartyManaged && present,
        reviewed: Boolean(review),
        ...(review ? { reviewId: review.reviewId, reviewedAt: review.createdAt } : {}),
      };
    })
  );

  return QueryInstructorReviewReadModelsResultSchema.parse({
    scope: 'account_reviews',
    reviews: [...reviewsById.values()].map((review) => toReviewReadModel(review, true)),
    bookingStates,
  });
}

export async function queryInstructorReviewReadModels(
  firestore: Firestore,
  input: QueryInstructorReviewReadModelsInput,
  options: { readonly accountId?: AccountId } = {}
): Promise<QueryInstructorReviewReadModelsResult> {
  if (input.scope === 'public_summaries') {
    return publicSummaries(firestore, input.instructorIds);
  }
  if (input.scope === 'instructor_reviews') return instructorReviews(firestore, input);
  const accountId = options.accountId
    ? AccountIdSchema.parse(options.accountId)
    : undefined;
  if (!accountId) {
    throw new Error('accountId is required for account review read models');
  }
  return accountReviews(firestore, accountId, input.bookingIds);
}
