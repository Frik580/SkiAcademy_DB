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
  orderBy,
  query,
  where,
} from '../../../infrastructure/firebase';
import { toBooking, toInstructor, toReview } from '../../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../../shared';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { getBookingHistoryPage, type BookingHistoryScope } from '../bookingHistoryService';

export const useBookingsSync = () => {
  const { shouldSyncReviews, shouldLoadBookingHistory } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const firebaseUserId = firebaseUser?.uid;
  const userRole = userProfile?.role;
  const instructorId = userProfile?.instructorId;
  const bookingHistoryRequest = useBookingsStore((s) => s.bookingHistoryRequest);
  const historyCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const historyBookingsRef = useRef([] as import('../../../types').Booking[]);
  const hotBookingsRef = useRef([] as import('../../../types').Booking[]);

  useEffect(() => {
    useBookingsStore.getState().resetBookingsPagination();
  }, [firebaseUser?.uid, userProfile?.instructorId, userProfile?.role]);

  // Instructors are read alongside bookings because they are booking catalogue data.
  useEffect(() => {
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
  }, []);

  // Reviews listener
  useEffect(() => {
    if (!shouldSyncReviews) {
      useBookingsStore.getState().setReviews([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'reviews'), limit(QUERY_LIMITS.reviews)),
      (snapshot) => {
        useBookingsStore
          .getState()
          .setReviews(snapshot.docs.map((reviewDoc) => toReview(reviewDoc.id, reviewDoc.data())));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
    );
  }, [shouldSyncReviews]);

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

    useBookingsStore.getState().setBookingsLoaded(false);
    const bookingsBase = collection(db, 'bookings');
    const realtimeStartDate = new Date();
    realtimeStartDate.setDate(
      realtimeStartDate.getDate() - QUERY_LIMITS.recentDaysForRealtimeBookings
    );
    const cutoff = realtimeStartDate.toISOString().slice(0, 10);
    const hotConstraints = [
      where('status', 'in', ['pending', 'confirmed']),
      where('date', '>=', cutoff),
      orderBy('date', 'desc'),
    ];
    const bookingsQuery =
      userProfile?.role === 'admin'
        ? query(bookingsBase, ...hotConstraints)
        : userProfile?.instructorId
          ? query(
              bookingsBase,
              where('instructorId', '==', userProfile.instructorId),
              ...hotConstraints
            )
          : query(bookingsBase, where('userId', '==', firebaseUser.uid), ...hotConstraints);

    return onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((bookingDoc) => toBooking(bookingDoc.id, bookingDoc.data()));
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
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role]);

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
