import { useEffect, useMemo, useRef } from 'react';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
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
import { toBooking, toInstructor, toReview } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useUiStore } from '../../shell/uiStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { getBookingHistoryPage, type BookingHistoryScope } from '../bookingHistoryService';
import { getRealtimeBookingsQuery, getStudentCourseBookingsQuery, type RealtimeBookingsScope } from '../bookingRealtimeService';

export const useBookingsSync = () => {
  const {
    catalogueScope,
    shouldSyncReviews,
    shouldLoadBookingHistory,
    shouldUseCanonicalLessonBookings,
    shouldLoadLegacyCourseBookings,
  } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const firebaseUserId = firebaseUser?.uid;
  const userRole = userProfile?.role;
  const instructorId = userProfile?.instructorId;
  const reviewsInstructorId = useUiStore((s) => s.reviewsInstructor?.id);
  const bookingHistoryRequest = useBookingsStore((s) => s.bookingHistoryRequest);
  const historyCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const historyBookingsRef = useRef([] as import('../../../types').Booking[]);
  const hotBookingsRef = useRef([] as import('../../../types').Booking[]);

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

  const historyScope = useMemo<BookingHistoryScope | null>(() => {
    if (!firebaseUserId || !userRole) return null;
    if (userRole === 'admin') return { kind: 'admin' };
    if (instructorId) {
      return { kind: 'instructor', instructorId };
    }
    return { kind: 'student', userId: firebaseUserId };
  }, [firebaseUserId, instructorId, userRole]);

  // Reset the cursor when the identity changes. Historical pages are intentionally fetched via getDocs.
  useEffect(() => {
    historyCursorRef.current = null;
    historyBookingsRef.current = [];
    hotBookingsRef.current = [];
  }, [historyScope]);

  useEffect(() => {
    if (!shouldLoadBookingHistory || !historyScope) return;
    let cancelled = false;
    useBookingsStore.getState().setBookingHistoryLoading(true);

    void getBookingHistoryPage(historyScope, historyCursorRef.current)
      .then((page) => {
        if (cancelled) return;
        historyCursorRef.current = page.cursor;
        const mergedHistory = [...historyBookingsRef.current, ...page.bookings].filter(
          (booking, index, all) => all.findIndex((item) => item.id === booking.id) === index
        );
        historyBookingsRef.current = mergedHistory;
        const hotIds = new Set(hotBookingsRef.current.map((booking) => booking.id));
        useBookingsStore
          .getState()
          .setBookings(
            [
              ...hotBookingsRef.current,
              ...mergedHistory.filter((booking) => !hotIds.has(booking.id)),
            ].sort((a, b) => b.date.localeCompare(a.date))
          );
        useBookingsStore.getState().setBookingsHasMore(page.hasMore);
      })
      .catch((error) => logger.error('Booking history query error:', error))
      .finally(() => {
        if (!cancelled) useBookingsStore.getState().setBookingHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingHistoryRequest, historyScope, shouldLoadBookingHistory]);

  // Hot bookings only: actionable reservations from the previous seven days onward.
  useEffect(() => {
    if (!firebaseUser) {
      useBookingsStore.getState().setBookings([]);
      useBookingsStore.getState().setBookingsLoaded(false);
      useBookingsStore.getState().setBookingsHasMore(false);
      return;
    }

    const isCustomerCanonicalLessonPath =
      shouldUseCanonicalLessonBookings && userProfile?.role === 'user' && !userProfile?.instructorId;

    if (isCustomerCanonicalLessonPath) {
      useBookingsStore.getState().setBookingsLoaded(true);
      if (!shouldLoadLegacyCourseBookings) {
        useBookingsStore.getState().setBookings([]);
        useBookingsStore.getState().setBookingsHasMore(false);
        return;
      }

      const courseBookingsQuery = getStudentCourseBookingsQuery(db, firebaseUser.uid);
      return onSnapshot(
        courseBookingsQuery,
        (snapshot) => {
          const list = snapshot.docs.flatMap((bookingDoc) => {
            const booking = toBooking(bookingDoc.id, bookingDoc.data());
            return booking ? [booking] : [];
          });
          hotBookingsRef.current = list;
          useBookingsStore.getState().setBookings(list);
          useBookingsStore.getState().setBookingsLoaded(true);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
      );
    }

    useBookingsStore.getState().setBookingsLoaded(false);
    const realtimeScope: RealtimeBookingsScope =
      userProfile?.role === 'admin'
        ? { kind: 'admin' }
        : userProfile?.instructorId
          ? { kind: 'instructor', instructorId: userProfile.instructorId }
          : { kind: 'student', userId: firebaseUser.uid };
    const bookingsQuery = getRealtimeBookingsQuery(db, realtimeScope);

    return onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const list = snapshot.docs.flatMap((bookingDoc) => {
          const booking = toBooking(bookingDoc.id, bookingDoc.data());
          return booking ? [booking] : [];
        });
        hotBookingsRef.current = list;
        const hotIds = new Set(list.map((booking) => booking.id));
        useBookingsStore
          .getState()
          .setBookings(
            [
              ...list,
              ...historyBookingsRef.current.filter((booking) => !hotIds.has(booking.id)),
            ].sort((a, b) => b.date.localeCompare(a.date))
          );
        useBookingsStore.getState().setBookingsLoaded(true);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
    );
  }, [
    firebaseUser,
    userProfile?.instructorId,
    userProfile?.role,
    shouldLoadLegacyCourseBookings,
    shouldUseCanonicalLessonBookings,
  ]);

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
