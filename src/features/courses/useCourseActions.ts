import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Course, UserProfile } from '../../types';
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
} from './courseService';
import { useBookingsStore } from '../bookings/bookingsStore';
import { queryManagedParticipantPickerReadModels } from '../../lib/canonical/canonicalReadModelClient';
import {
  deriveAuthenticatedCreateEnrollmentIdempotencyKey,
  resolveEnrollmentParticipantsForProfile,
  useCourseEnrollmentCommands,
} from '../course-enrollments';
import { presentCanonicalCommandErrorWithContext, useManagedParticipants } from '../lesson-bookings';

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
  const { participants: managedParticipants } = useManagedParticipants(Boolean(userProfile?.uid));

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

        const pickerItems =
          managedParticipants.length > 0
            ? managedParticipants
            : (await queryManagedParticipantPickerReadModels({})).items.map((item) => ({
                participantId: item.participantId,
                displayName: item.displayName,
                discipline: item.discipline,
                skillLevel: item.skillLevel,
                authority: item.authority,
              }));
        const { participantIds, exercisedCapability } = resolveEnrollmentParticipantsForProfile(
          pickerItems,
          customProfile
        );
        const idempotencyKey = deriveAuthenticatedCreateEnrollmentIdempotencyKey(
          courseId,
          participantIds
        );

        await withOptimisticBalance(isSelfEnrollment ? -estimatedPrice : 0, async () => {
          await createAuthenticatedEnrollment({
            courseId,
            participantIds,
            exercisedCapability,
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
        inFlightEnrollmentsRef.current.delete(courseId);
      }
    },
    [courses, createAuthenticatedEnrollment, firebaseUser, managedParticipants, userProfile]
  );

  return {
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
  };
}
