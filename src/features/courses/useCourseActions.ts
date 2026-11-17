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
  isEnrolledInCourse,
  selectCourseEnrollmentItems,
  useCourseEnrollmentCommands,
  useCourseEnrollmentStore,
} from '../course-enrollments';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';

export interface AuthenticatedCourseEnrollmentSelection {
  readonly participantIds: readonly string[];
  readonly exercisedCapability: ClientCallableCapability;
}

function notifyCanonicalCourseAdminWriteBlocked(
  error: CanonicalCourseAdminWriteBlockedError
): void {
  const translationPrefix =
    error.operation === 'delete'
      ? 'canonicalCourseDeleteBlocked'
      : error.operation === 'create'
        ? 'canonicalCourseReplaceBlocked'
        : 'canonicalCourseEditBlocked';
  notify('warning', t(`${translationPrefix}Title`), t(`${translationPrefix}Desc`));
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
  /** Avoid resubmitting a completed selection while read models refresh. */
  const completedEnrollmentKeysRef = useRef<Set<string>>(new Set());
  const { createAuthenticatedEnrollment } = useCourseEnrollmentCommands(userProfile?.uid);

  const handleAddCourse = useCallback(async (course: Course) => {
    try {
      await addCourseService(course);
    } catch (error) {
      if (error instanceof CanonicalCourseAdminWriteBlockedError) {
        notifyCanonicalCourseAdminWriteBlocked(error);
      }
      throw error;
    }
  }, []);

  const handleUpdateCourse = useCallback(
    async (course: Course) => {
      try {
        await updateCourseService(course);
      } catch (error) {
        if (error instanceof CanonicalCourseAdminWriteBlockedError) {
          notifyCanonicalCourseAdminWriteBlocked(error);
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
    try {
      await deleteCourseService(courseId);
    } catch (error) {
      if (error instanceof CanonicalCourseAdminWriteBlockedError) {
        notifyCanonicalCourseAdminWriteBlocked(error);
      }
      throw error;
    }
  }, []);

  const handleBookCourse = useCallback(
    async (courseId: string, selection: AuthenticatedCourseEnrollmentSelection) => {
      const enrollmentKey = `${userProfile?.uid}:${courseId}:${[...selection.participantIds].sort().join(',')}`;
      if (inFlightEnrollmentsRef.current.has(enrollmentKey)) {
        return false;
      }

      const activeProfile = userProfile;
      const activeUser = firebaseUser || getCurrentAuthenticatedUser();

      if (!activeProfile || !activeUser) {
        notify('warning', t('signInRequired'), t('signInRequiredDesc'));
        return false;
      }
      if (activeProfile.isClientActive === false) {
        notify('error', t('bookingRestricted'), t('bookingRestrictedDesc'));
        return false;
      }
      if (selection.participantIds.length === 0) {
        notify('warning', t('missingDetails'), t('bookingSelectParticipant'));
        return false;
      }

      const existingEnrollments = selectCourseEnrollmentItems(useCourseEnrollmentStore.getState());
      const alreadyEnrolledLocally = selection.participantIds.some((participantId) =>
        isEnrolledInCourse(existingEnrollments, courseId, participantId)
      );
      if (alreadyEnrolledLocally || completedEnrollmentKeysRef.current.has(enrollmentKey)) {
        notify('warning', t('alreadyEnrolled'), t('alreadyEnrolledDesc'));
        return false;
      }

      inFlightEnrollmentsRef.current.add(enrollmentKey);
      try {
        const course = courses.find((item) => item.id === courseId);
        const coursePrice =
          useCourseEnrollmentStore.getState().catalogByCourseId.get(courseId)?.priceMinorUnits ?? 0;
        const estimatedPrice = coursePrice * new Set(selection.participantIds).size;
        const idempotencyKey = deriveAuthenticatedCreateEnrollmentIdempotencyKey(
          courseId,
          selection.participantIds
        );

        const { outcome, refreshFailed } = await withOptimisticBalance(
          -estimatedPrice,
          () =>
            createAuthenticatedEnrollment({
              courseId,
              participantIds: selection.participantIds,
              exercisedCapability: selection.exercisedCapability,
              identity: { enrollmentId: '', idempotencyKey },
            }),
          { settleOnSuccess: true }
        );

        completedEnrollmentKeysRef.current.add(enrollmentKey);

        if (outcome === 'already_exists') {
          notify('warning', t('alreadyEnrolled'), t('alreadyEnrolledDesc'));
          return true;
        }

        const courseTitle = course?.title ?? courseId;
        notify(
          'success',
          t('enrollmentConfirmed'),
          `${t('enrollmentConfirmedDesc')} ${courseTitle}.`
        );
        if (refreshFailed) {
          notify('warning', t('postCreateRefreshFailedTitle'), t('postCreateRefreshFailedBody'));
        }
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        return true;
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
