import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../lib/firebase';
import { Course } from '../../types';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import { useProfileStore } from '../../features/profile/profileStore';
import { useBookingStore } from '../bookingStore';
import { useCourseStore } from '../courseStore';

export const useCoursesSync = () => {
  const userProfile = useProfileStore((s) => s.userProfile);
  const bookings = useBookingStore((s) => s.bookings);
  const courses = useCourseStore((s) => s.courses);

  // Courses listener
  useEffect(() => {
    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    return onSnapshot(
      coursesQuery,
      (snapshot) => {
        useCourseStore
          .getState()
          .setCourses(
            snapshot.docs.map((courseDoc) => ({ id: courseDoc.id, ...courseDoc.data() }) as Course)
          );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, []);

  // Optimized course seat sync
  const bookingStateSignature = bookings.map((b) => `${b.id}:${b.status}:${b.isDeleted}`).join(',');
  const courseStateSignature = courses
    .map((c) => `${c.id}:${c.totalSeats}:${c.availableSeats}`)
    .join(',');

  useEffect(() => {
    void useCourseStore.getState().syncCourseSeats();
  }, [bookingStateSignature, courseStateSignature, userProfile?.role]);
};
