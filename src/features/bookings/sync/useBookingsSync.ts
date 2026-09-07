import { useEffect } from 'react';
import {
  collection,
  db,
  doc,
  getDoc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
  where,
} from '../../../infrastructure/firebase';
import { toInstructor, toReview } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useUiStore } from '../../shell/uiStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';

export const useBookingsSync = () => {
  const { catalogueScope, shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const firebaseUserId = firebaseUser?.uid;
  const userRole = userProfile?.role;
  const instructorId = userProfile?.instructorId;
  const reviewsInstructorId = useUiStore((s) => s.reviewsInstructor?.id);

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

  // Keep review listeners scoped to the screen and the entity being viewed. A global reviews
  // collection listener grows with every review, while the cabinet and instructor workspace only
  // need reviews written by / for the current person.
  useEffect(() => {
    const reviewScopes = [
      ...(shouldSyncReviews && firebaseUserId && userRole === 'user'
        ? [{ key: `user:${firebaseUserId}`, field: 'userId', value: firebaseUserId }]
        : []),
      ...(shouldSyncReviews && instructorId && !reviewsInstructorId
        ? [{ key: `instructor:${instructorId}`, field: 'instructorId', value: instructorId }]
        : []),
      ...(reviewsInstructorId
        ? [
            {
              key: `instructor:${reviewsInstructorId}`,
              field: 'instructorId',
              value: reviewsInstructorId,
            },
          ]
        : []),
    ];

    if (reviewScopes.length === 0) {
      useBookingsStore.getState().setReviews([]);
      return;
    }

    const snapshots = new Map<string, import('../../../types').Review[]>();
    const publish = () => {
      const reviews = [
        ...new Map([...snapshots.values()].flat().map((review) => [review.id, review])).values(),
      ];
      useBookingsStore.getState().setReviews(reviews);
    };

    const unsubscribers = reviewScopes.map(({ key, field, value }) =>
      onSnapshot(
        query(collection(db, 'reviews'), where(field, '==', value), limit(QUERY_LIMITS.reviews)),
        (snapshot) => {
          snapshots.set(
            key,
            snapshot.docs.map((reviewDoc) => toReview(reviewDoc.id, reviewDoc.data()))
          );
          publish();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [firebaseUserId, instructorId, reviewsInstructorId, shouldSyncReviews, userRole]);

  // Individual lesson rows are canonical-only after T32.9A.9A. This compatibility
  // store remains for instructors/reviews and must never repopulate legacy Booking rows.
  useEffect(() => {
    useBookingsStore.getState().setBookings([]);
    useBookingsStore.getState().setBookingsLoaded(Boolean(firebaseUser));
    useBookingsStore.getState().setBookingsHasMore(false);
    useBookingsStore.getState().setBookingHistoryLoading(false);
  }, [firebaseUser]);

  // Deleted completed stats (admin)
  useEffect(() => {
    if (userProfile?.role !== 'admin' || !firebaseUser) {
      useBookingsStore.getState().setDeletedCompletedStats({ revenue: 0, count: 0 });
      return;
    }

    const loadDeletedCompletedStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          useBookingsStore.getState().setDeletedCompletedStats({
            revenue: data.deletedCompletedRevenue || 0,
            count: data.deletedCompletedCount || 0,
          });
        }
      } catch (error) {
        logger.error('Error fetching stats:', error);
      }
    };

    loadDeletedCompletedStats();
  }, [firebaseUser, userProfile?.role]);
};
