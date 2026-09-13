import { useEffect } from 'react';
import {
  collection,
  db,
  doc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../../infrastructure/firebase';
import { toInstructor } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useUiStore } from '../../shell/uiStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import {
  queryAccountInstructorReviewReadModels,
  queryInstructorReviewReadModels,
  queryPublicInstructorRatingSummaries,
} from '../../../lib/canonical/canonicalReadModelClient';
import { BookingIdSchema, InstructorIdSchema } from '@ski-academy/shared-domain';
import { useLessonBookingStore } from '../../lesson-bookings';
import { mergeAccountReviewBookingStates } from '../../reviews/mergeAccountReviewBookingStates';

async function loadInstructorReviewPage(instructorId: string) {
  const page = await queryInstructorReviewReadModels({
    scope: 'instructor_reviews',
    instructorId: InstructorIdSchema.parse(instructorId),
    pageSize: 25,
  });
  if (page.scope !== 'instructor_reviews') {
    throw new Error('Canonical instructor review scope mismatch.');
  }
  return page;
}

export const useBookingsSync = () => {
  const { catalogueScope, shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const firebaseUserId = firebaseUser?.uid;
  const userRole = userProfile?.role;
  const instructorId = userProfile?.instructorId;
  const reviewsInstructorId = useUiStore((s) => s.reviewsInstructor?.id);
  const reviewSyncRequest = useBookingsStore((s) => s.reviewSyncRequest);
  const lessonBookingItems = useLessonBookingStore((state) => state.items);

  useEffect(() => {
    useBookingsStore.getState().resetBookingsPagination();
  }, [firebaseUser?.uid, userProfile?.instructorId, userProfile?.role]);

  // The booking catalogue needs all instructors outside the instructor workspace. There, only the
  // linked instructor profile is rendered, so subscribe to that one document.
  useEffect(() => {
    if (catalogueScope === 'instructor' && !instructorId) {
      useBookingsStore.getState().setInstructors([]);
      return;
    }

    if (catalogueScope === 'instructor') {
      return onSnapshot(
        doc(db, 'instructors', instructorId!),
        (snapshot) => {
          useBookingsStore
            .getState()
            .setInstructors(snapshot.exists() ? [toInstructor(snapshot.id, snapshot.data())] : []);
        },
        (error) => handleFirestoreError(error, OperationType.GET, 'instructors')
      );
    }

    const instructorsQuery = query(collection(db, 'instructors'), limit(QUERY_LIMITS.instructors));

    return onSnapshot(
      instructorsQuery,
      (snapshot) => {
        useBookingsStore
          .getState()
          .setInstructors(
            snapshot.docs.map((instructorDoc) =>
              toInstructor(instructorDoc.id, instructorDoc.data())
            )
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'instructors')
    );
  }, [catalogueScope, instructorId]);

  // Canonical review read models are the only product review/rating authority.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const catalogueInstructorIds = useBookingsStore
          .getState()
          .instructors.map((instructor) => InstructorIdSchema.parse(instructor.id));
        const accountBookingIds = [...lessonBookingItems.values()].map((booking) =>
          BookingIdSchema.parse(booking.bookingId)
        );
        const requests = [
          ...(catalogueInstructorIds.length > 0
            ? [queryPublicInstructorRatingSummaries(catalogueInstructorIds)]
            : []),
          ...(shouldSyncReviews && firebaseUserId
            ? [queryAccountInstructorReviewReadModels(accountBookingIds)]
            : []),
          ...(shouldSyncReviews && instructorId && !reviewsInstructorId
            ? [loadInstructorReviewPage(instructorId)]
            : []),
          ...(reviewsInstructorId ? [loadInstructorReviewPage(reviewsInstructorId)] : []),
        ];
        const results = await Promise.allSettled(requests);
        if (cancelled) return;
        const settled = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : []
        );
        if (settled.length === 0) {
          return;
        }
        const summaries = settled.flatMap((result) =>
          result.scope === 'public_summaries'
            ? result.summaries
            : result.scope === 'instructor_reviews'
              ? [result.summary]
              : []
        );
        const reviews = settled.flatMap((result) =>
          result.scope === 'account_reviews' || result.scope === 'instructor_reviews'
            ? result.reviews
            : []
        );
        const incomingBookingStates = settled.flatMap((result) =>
          result.scope === 'account_reviews' ? result.bookingStates : []
        );
        const reviewPages = settled.flatMap((result) =>
          result.scope === 'instructor_reviews'
            ? [
                {
                  instructorId: result.summary.instructorId as string,
                  hasMore: result.hasMore,
                  ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
                },
              ]
            : []
        );
        const previousState = useBookingsStore.getState();
        const hasAccountReviewPayload = settled.some(
          (result) => result.scope === 'account_reviews'
        );
        useBookingsStore.getState().setCanonicalReviewData({
          summaries: [
            ...new Map(summaries.map((summary) => [summary.instructorId, summary])).values(),
          ],
          reviews: [...new Map(reviews.map((review) => [review.reviewId, review])).values()],
          bookingStates: hasAccountReviewPayload
            ? mergeAccountReviewBookingStates(
                previousState.reviewBookingStates,
                incomingBookingStates,
                accountBookingIds
              )
            : previousState.reviewBookingStates,
          reviewPages,
        });
      } catch (error) {
        logger.error('Canonical review read sync failed:', error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    firebaseUserId,
    instructorId,
    lessonBookingItems,
    reviewSyncRequest,
    reviewsInstructorId,
    shouldSyncReviews,
    userRole,
  ]);

  // Individual lesson rows are canonical-only after T32.9A.9A. This compatibility
  // store remains for instructors/reviews and must never repopulate legacy Booking rows.
  useEffect(() => {
    useBookingsStore.getState().setBookings([]);
    useBookingsStore.getState().setBookingsLoaded(Boolean(firebaseUser));
    useBookingsStore.getState().setBookingsHasMore(false);
    useBookingsStore.getState().setBookingHistoryLoading(false);
  }, [firebaseUser]);
};
