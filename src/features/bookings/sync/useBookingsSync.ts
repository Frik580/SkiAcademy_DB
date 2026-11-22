import { subscribeScopedDocuments } from '../../../lib/canonical/scopedClientDocuments';
import { useEffect } from 'react';
import {
  handleFirestoreError,
  OperationType,
  toInstructor,
} from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useUiStore } from '../../shell/uiStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import {
  queryAccountInstructorReviewReadModels,
  queryBookingInstructorCatalogueReadModels,
  queryInstructorReviewReadModels,
  queryPublicInstructorRatingSummaries,
} from '../../../lib/canonical/canonicalReadModelClient';
import {
  BookingIdSchema,
  InstructorIdSchema,
} from '@ski-academy/shared-domain/canonical/identifiers';
import { useLessonBookingStore } from '../../lesson-bookings';
import { mergeAccountReviewBookingStates } from '../../reviews/mergeAccountReviewBookingStates';
import { toBookingCatalogueInstructor } from './bookingInstructorCatalogue';
import { liveCatalogueInstructors } from './liveCatalogueInstructors';

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
  const authGeneration = useAuthStore((s) => s.authGeneration);
  const authLoading = useAuthStore((s) => s.authLoading);
  const userProfile = useProfileStore((s) => s.userProfile);
  const firebaseUserId = firebaseUser?.uid;
  const userRole = userProfile?.role;
  const instructorId = userProfile?.instructorId;
  const catalogueInstructorId = catalogueScope === 'instructor' ? instructorId : undefined;
  const reviewsInstructorId = useUiStore((s) => s.reviewsInstructor?.id);
  const retryNonce = useBookingsStore((s) => s.instructorCatalogueRetryNonce);
  const reviewSyncRequest = useBookingsStore((s) => s.reviewSyncRequest);
  const lessonBookingItems = useLessonBookingStore((state) => state.items);

  useEffect(() => {
    useBookingsStore.getState().resetBookingsPagination();
  }, [firebaseUser?.uid, userProfile?.instructorId, userProfile?.role]);

  // Guest booking keeps the LIVE-compatible scoped subscription. Authenticated booking
  // uses the scoped catalogue callable so a TestActor is not stuck on that filter.
  // The instructor workspace still reads only its own linked profile.
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    const isCurrent = () =>
      active &&
      !useAuthStore.getState().authLoading &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useAuthStore.getState().firebaseUser?.uid === firebaseUserId;
    if (catalogueScope === 'instructor') {
      useBookingsStore.getState().setInstructors([]);
      if (!catalogueInstructorId) return;
      const unsubscribe = subscribeScopedDocuments(
        {
          collection: 'instructors',
          take: 1,
          where: [{ field: '__name__', op: '==', value: catalogueInstructorId }],
        },
        (snapshot) => {
          if (!isCurrent()) return;
          useBookingsStore
            .getState()
            .setInstructors(snapshot.docs.map((item) => toInstructor(item.id, item.data())));
        },
        (error) => {
          if (isCurrent()) handleFirestoreError(error, OperationType.GET, 'instructors');
        }
      );
      return () => {
        active = false;
        unsubscribe();
      };
    }

    useBookingsStore.setState({ instructorCatalogueStatus: 'loading' });
    if (firebaseUserId) {
      useBookingsStore.getState().setInstructors([]);
      void queryBookingInstructorCatalogueReadModels()
        .then((result) => {
          if (!isCurrent()) return;
          useBookingsStore
            .getState()
            .setInstructors(result.items.map((item) => toBookingCatalogueInstructor(item)));
          useBookingsStore.setState({ instructorCatalogueStatus: 'ready' });
        })
        .catch((error) => {
          logger.error('Booking instructor catalogue read failed', error);
          if (isCurrent()) {
            useBookingsStore.getState().setInstructors([]);
            useBookingsStore.setState({ instructorCatalogueStatus: 'error' });
          }
        });
      return () => {
        active = false;
      };
    }

    const instructorsQuery = { collection: 'instructors' as const, take: QUERY_LIMITS.instructors };

    const unsubscribe = subscribeScopedDocuments(
      instructorsQuery,
      (snapshot) => {
        if (!isCurrent()) return;
        useBookingsStore.getState().setInstructors(
          liveCatalogueInstructors(
            snapshot.docs.map((instructorDoc) => ({
              id: instructorDoc.id,
              data: instructorDoc.data(),
            }))
          )
        );
        useBookingsStore.setState({ instructorCatalogueStatus: 'ready' });
      },
      (error) => {
        if (!isCurrent()) return;
        useBookingsStore.setState({ instructorCatalogueStatus: 'error' });
        handleFirestoreError(error, OperationType.LIST, 'instructors');
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    authGeneration,
    authLoading,
    catalogueInstructorId,
    catalogueScope,
    firebaseUserId,
    retryNonce,
  ]);

  // Canonical review read models are the only product review/rating authority.
  useEffect(() => {
    if (authLoading) return;
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
        if (
          cancelled ||
          useAuthStore.getState().authLoading ||
          useAuthStore.getState().authGeneration !== authGeneration ||
          useAuthStore.getState().firebaseUser?.uid !== firebaseUserId
        )
          return;
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
    authGeneration,
    authLoading,
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
