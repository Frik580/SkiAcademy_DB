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
} from '../../../lib/firebase';
import { Booking, Instructor, Review } from '../../../types';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { logger } from '../../../lib/logger';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useBookingsStore } from '../bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';

export const useBookingsSync = () => {
  const { shouldSyncReviews } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);

  // Instructors are read alongside bookings because they are booking catalogue data.
  useEffect(() => {
    const instructorsQuery = query(collection(db, 'instructors'), limit(QUERY_LIMITS.instructors));

    return onSnapshot(
      instructorsQuery,
      (snapshot) => {
        useBookingsStore
          .getState()
          .setInstructors(
            snapshot.docs.map(
              (instructorDoc) => ({ id: instructorDoc.id, ...instructorDoc.data() }) as Instructor
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
          .setReviews(
            snapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() }) as Review)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'reviews')
    );
  }, [shouldSyncReviews]);

  // Bookings listener
  useEffect(() => {
    if (!firebaseUser) {
      useBookingsStore.getState().setBookings([]);
      useBookingsStore.getState().setBookingsLoaded(false);
      return;
    }

    useBookingsStore.getState().setBookingsLoaded(false);
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
        useBookingsStore.getState().setBookings(list.sort((a, b) => b.date.localeCompare(a.date)));
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
