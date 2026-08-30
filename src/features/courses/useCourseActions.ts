import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Course } from '../../types';
import { notify, t } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { getCurrentAuthenticatedUser } from '../auth/authService';
import { useProfileStore } from '../profile/profileStore';
import { withOptimisticBalance } from '../wallet/walletService';
import { useCoursesStore } from './coursesStore';
import {
  addCourseService,
  updateCourseService,
  deleteCourseService,
  notifyCourseModifiedService,
  CanonicalCourseAdminWriteBlockedError,
} from './courseService';
import { useBookingsStore } from '../bookings/bookingsStore';
import {
  deriveAuthenticatedCreateEnrollmentIdempotencyKey,
  useCourseEnrollmentCommands,
} from '../course-enrollments';
import { presentCanonicalCommandErrorWithContext } from '../lesson-bookings';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';

export interface AuthenticatedCourseEnrollmentSelection {
  readonly participantIds: readonly string[];
  readonly exercisedCapability: ClientCallableCapability;
}

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
  const { createAuthenticatedEnrollment } = useCourseEnrollmentCommands(userProfile?.uid);

  const handleAddCourse = useCallback(async (course: Course) => {
    await addCourseService(course);
  }, []);

  const handleUpdateCourse = useCallback(
    async (course: Course) => {
      try {
        await updateCourseService(course);
      } catch (error) {
        if (error instanceof CanonicalCourseAdminWriteBlockedError) {
          notify(
            'warning',
            t('canonicalCourseEditBlockedTitle'),
            t('canonicalCourseEditBlockedDesc')
          );
          throw error;
        }
        throw error;
      }
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
    async (courseId: string, selection: AuthenticatedCourseEnrollmentSelection) => {
      const enrollmentKey = `${courseId}:${selection.participantIds.join(',')}`;
      if (inFlightEnrollmentsRef.current.has(enrollmentKey)) {
        return;
      }

      const activeProfile = userProfile;
      const activeUser = firebaseUser || getCurrentAuthenticatedUser();

      if (!activeProfile || !activeUser) {
        notify('warning', t('signInRequired'), t('signInRequiredDesc'));
        return;
      }
      if (activeProfile.isClientActive === false) {
        notify('error', t('bookingRestricted'), t('bookingRestrictedDesc'));
        return;
      }
      if (selection.participantIds.length === 0) {
        notify('warning', t('missingDetails'), t('bookingSelectParticipant'));
        return;
      }

      inFlightEnrollmentsRef.current.add(enrollmentKey);
      try {
        const course = courses.find((item) => item.id === courseId);
        const estimatedPrice = course?.price ?? 0;
        const idempotencyKey = deriveAuthenticatedCreateEnrollmentIdempotencyKey(
          courseId,
          selection.participantIds
        );

        await withOptimisticBalance(-estimatedPrice, async () => {
          await createAuthenticatedEnrollment({
            courseId,
            participantIds: selection.participantIds,
            exercisedCapability: selection.exercisedCapability,
            identity: { enrollmentId: '', idempotencyKey },
          });
        });

        const courseTitle = course?.title ?? courseId;
        notify(
          'success',
          t('enrollmentConfirmed'),
          `${t('enrollmentConfirmedDesc')} ${courseTitle}.`
        );
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      } catch (error) {
        const presented = presentCanonicalCommandErrorWithContext(error, {
          t: t as (key: string) => string,
        });
        if (presented.code === 'validation' && presented.message.includes('conflict')) {
          notify('warning', t('alreadyEnrolled'), t('alreadyEnrolledDesc'));
        } else if (
          presented.code === 'resource_conflict' ||
          presented.code === 'participant_conflict'
        ) {
          notify('error', t('bookingFailed'), t('bookingFailedDesc'));
        } else if (presented.code === 'insufficient_funds') {
          notify('error', t('bookingFailed'), t('bookingFailedDesc'));
        } else {
          notify('error', t('bookingError'), presented.message || t('bookingRecordFailed'));
        }
      } finally {
        inFlightEnrollmentsRef.current.delete(enrollmentKey);
      }
    },
    [courses, createAuthenticatedEnrollment, firebaseUser, userProfile]
  );

  return {
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
  };
}
