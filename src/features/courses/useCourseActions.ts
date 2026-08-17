import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Course, UserProfile } from '../../types';
import { notify, t, getLanguage } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { getCurrentAuthenticatedUser } from '../auth/authService';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { withOptimisticBalance } from '../wallet/walletService';
import { useCoursesStore } from './coursesStore';
import {
  addCourseService,
  updateCourseService,
  deleteCourseService,
  enrollInCourseService,
  notifyCourseModifiedService,
} from './courseService';

/**
 * Course use-cases belong at the feature boundary. The course store itself only
 * owns the cached course collection and has no dependencies on other domains.
 */
export function useCourseActions() {
  const courses = useCoursesStore((state) => state.courses);
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const bookings = useBookingsStore((state) => state.bookings);
  const inFlightEnrollmentsRef = useRef<Set<string>>(new Set());

  const handleAddCourse = useCallback(async (course: Course) => {
    await addCourseService(course);
  }, []);

  const handleUpdateCourse = useCallback(
    async (course: Course) => {
      await updateCourseService(course);
      if (userProfile?.role !== 'admin') return;

      const oldCourse = courses.find((item) => item.id === course.id);
      const courseBookings = bookings.filter(
        (booking) =>
          booking.instructorId === `course_${course.id}` && booking.status !== 'cancelled'
      );

      await notifyCourseModifiedService(course, oldCourse, courseBookings);
    },
    [bookings, courses, userProfile?.role]
  );

  const handleDeleteCourse = useCallback(async (courseId: string) => {
    await deleteCourseService(courseId);
  }, []);

  const handleBookCourse = useCallback(
    async (courseId: string, customProfile?: UserProfile) => {
      if (inFlightEnrollmentsRef.current.has(courseId)) {
        return;
      }

      const activeProfile = customProfile || userProfile;
      const activeUser = firebaseUser || getCurrentAuthenticatedUser();

      if (!activeProfile || !activeUser) {
        notify('warning', t('signInRequired'), t('signInRequiredDesc'));
        return;
      }
      if (activeProfile.isClientActive === false) {
        notify('error', t('bookingRestricted'), t('bookingRestrictedDesc'));
        return;
      }

      inFlightEnrollmentsRef.current.add(courseId);
      try {
        const course = courses.find((item) => item.id === courseId);
        const isSelfEnrollment = activeUser.uid === activeProfile.uid && !customProfile;
        const estimatedPrice = course?.price ?? 0;

        const { courseTitle } = await withOptimisticBalance(
          isSelfEnrollment ? -estimatedPrice : 0,
          () => enrollInCourseService(courseId, getLanguage())
        );

        notify(
          'success',
          t('enrollmentConfirmed'),
          `${t('enrollmentConfirmedDesc')} ${courseTitle}.`
        );
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'ALREADY_ENROLLED') {
          notify('warning', t('alreadyEnrolled'), t('alreadyEnrolledDesc'));
        } else if (message === 'COURSE_FULL' || message === 'INSUFFICIENT_FUNDS') {
          notify('error', t('bookingFailed'), t('bookingFailedDesc'));
        }
      } finally {
        inFlightEnrollmentsRef.current.delete(courseId);
      }
    },
    [courses, firebaseUser, userProfile]
  );

  return {
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
  };
}
