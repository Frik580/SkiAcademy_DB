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
  orderBy,
  query,
  where,
} from '../../lib/firebase';
import { Booking, Review, UserProfile } from '../../types';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import { logger } from '../../lib/logger';
import { useAuthStore } from '../authStore';
import { useBookingStore } from '../bookingStore';
import { useDataSyncScope } from '../useDataSyncScope';

export const useBookingsSync = () => {
  const { shouldSyncUsersList, shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useAuthStore((s) => s.userProfile);

  // Reviews listener
  useEffect(() => {
    if (!shouldSyncReviews) {
      useBookingStore.getState().setReviews([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'reviews'), limit(QUERY_LIMITS.reviews)),
      (snapshot) => {
        useBookingStore
          .getState()
          .setReviews(
            snapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() }) as Review)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
    );
  }, [shouldSyncReviews]);

  // Users list listener (admin/instructor routes only)
  useEffect(() => {
    const canReadUsers =
      (userProfile?.role === 'admin' || Boolean(userProfile?.instructorId)) && shouldSyncUsersList;
    if (!firebaseUser || !canReadUsers) {
      useAuthStore.getState().setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(QUERY_LIMITS.users)),
      (snapshot) => {
        useAuthStore
          .getState()
          .setUsersList(
            snapshot.docs
              .filter((userDoc) => userDoc.id !== 'school_global_stats')
              .map((userDoc) => userDoc.data() as UserProfile)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role, shouldSyncUsersList]);

  // Bookings listener
  useEffect(() => {
    if (!firebaseUser) {
      useBookingStore.getState().setBookings([]);
      useBookingStore.getState().setBookingsLoaded(false);
      return;
    }

    useBookingStore.getState().setBookingsLoaded(false);
    const bookingsBase = collection(db, 'bookings');
    const bookingsQuery =
      userProfile?.role === 'admin'
        ? query(bookingsBase, orderBy('date', 'desc'), limit(QUERY_LIMITS.bookings))
        : userProfile?.instructorId
          ? query(
              bookingsBase,
              where('instructorId', '==', userProfile.instructorId),
              orderBy('date', 'desc'),
              limit(QUERY_LIMITS.bookings)
            )
          : query(
              bookingsBase,
              where('userId', '==', firebaseUser.uid),
              orderBy('date', 'desc'),
              limit(QUERY_LIMITS.bookings)
            );

    return onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const list = snapshot.docs.map(
          (bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }) as Booking
        );
        useBookingStore.getState().setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
        useBookingStore.getState().setBookingsLoaded(true);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role]);

  // Deleted completed stats (admin)
  useEffect(() => {
    if (userProfile?.role !== 'admin' || !firebaseUser) {
      useBookingStore.getState().setDeletedCompletedStats({ revenue: 0, count: 0 });
      return;
    }

    const loadDeletedCompletedStats = async () => {
      try {
        const statsDoc = await getDoc(doc(db, 'users', 'school_global_stats'));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          useBookingStore.getState().setDeletedCompletedStats({
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
