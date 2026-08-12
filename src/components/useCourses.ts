import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { User } from 'firebase/auth';
import {
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from '../lib/firebase';
import { useLanguage } from '../lib/LanguageContext';
import { enrollInCourse, isActiveCourseEnrollment } from '../lib/courseTransactions';
import { stripUndefinedFields } from '../lib/courseClone';
import { createNotificationForUser } from '../lib/notifications';
import { buildNotification, translateKey } from '../lib/notificationText';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { Booking, Course, UserProfile } from '../types';
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { logger } from '../lib/logger';

export const useCourses = (
  firebaseUser: User | null,
  userProfile: UserProfile | null,
  bookings: Booking[]
) => {
  const { addNotification } = useNotificationHub();
  const { language, t } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const coursesQuery = query(collection(db, 'courses'), limit(QUERY_LIMITS.courses));
    return onSnapshot(
      coursesQuery,
      (snapshot) => {
        setCourses(
          snapshot.docs.map(
            (courseDoc) =>
              ({
                id: courseDoc.id,
                ...courseDoc.data(),
              }) as Course
          )
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'courses')
    );
  }, []);

  const bookingsDependency = bookings
    .map((booking) => `${booking.id}:${booking.status}:${booking.isDeleted}`)
    .join(',');
  const coursesDependency = courses
    .map((course) => `${course.id}:${course.totalSeats}:${course.availableSeats}`)
    .join(',');

  useEffect(() => {
    if (userProfile?.role !== 'admin' || courses.length === 0) return;

    const syncCourseSeats = async () => {
      const batch = writeBatch(db);
      let pendingWrites = 0;

      for (const course of courses) {
        const activeBookingsCount = bookings.filter(
          (booking) =>
            booking.instructorId === `course_${course.id}` && isActiveCourseEnrollment(booking)
        ).length;
        const availableSeats = Math.max(0, course.totalSeats - activeBookingsCount);
        if (course.availableSeats === availableSeats) continue;

        batch.update(doc(db, 'courses', course.id), { availableSeats });
        pendingWrites++;
      }

      if (pendingWrites === 0) return;

      try {
        await batch.commit();
      } catch (error) {
        logger.error(`Failed to auto-sync seats for ${pendingWrites} course(s):`, error);
      }
    };

    syncCourseSeats();
    // Primitive dependency signatures prevent re-running for unrelated snapshot object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsDependency, coursesDependency, userProfile?.role]);

  const handleAddCourse = async (course: Course) => {
    await setDoc(
      doc(db, 'courses', course.id),
      stripUndefinedFields(course as unknown as Record<string, unknown>)
    );
  };

  const handleUpdateCourse = async (course: Course) => {
    await updateDoc(doc(db, 'courses', course.id), course as any);
    if (userProfile?.role !== 'admin') return;

    const oldCourse = courses.find((item) => item.id === course.id);
    const courseBookings = bookings.filter(
      (booking) => booking.instructorId === `course_${course.id}` && booking.status !== 'cancelled'
    );

    const buildCourseModifiedMessage = (lang: 'en' | 'ru') => {
      let changeDetails = '';
      if (oldCourse?.title !== course.title) {
        changeDetails += `${translateKey('courseModifiedTitleLine', lang)} "${course.title}".\n`;
      }
      if (oldCourse?.dates !== course.dates) {
        changeDetails += `${translateKey('courseModifiedDatesLine', lang)} ${course.dates}.\n`;
      }
      return `${translateKey('courseModifiedHeader', lang)} "${course.title}":\n${changeDetails || translateKey('courseModifiedDefault', lang)}`;
    };

    for (const booking of courseBookings) {
      await createNotificationForUser(
        booking.userId,
        buildNotification('courseModified', buildCourseModifiedMessage),
        'warning'
      );
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    await deleteDoc(doc(db, 'courses', courseId));
  };

  const handleBookCourse = async (courseId: string, customProfile?: UserProfile) => {
    const activeProfile = customProfile || userProfile;
    const activeUser = firebaseUser || auth.currentUser;

    if (!activeProfile || !activeUser) {
      addNotification('warning', t('signInRequired'), t('signInRequiredDesc'));
      return;
    }
    if (activeProfile.isClientActive === false) {
      addNotification('error', t('bookingRestricted'), t('bookingRestrictedDesc'));
      return;
    }

    try {
      const { courseTitle } = await enrollInCourse(db, activeUser.uid, courseId, language);

      addNotification(
        'success',
        t('enrollmentConfirmed'),
        `${t('enrollmentConfirmedDesc')} ${courseTitle}.`
      );
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'ALREADY_ENROLLED') {
        addNotification('warning', t('alreadyEnrolled'), t('alreadyEnrolledDesc'));
      } else if (message === 'COURSE_FULL' || message === 'INSUFFICIENT_FUNDS') {
        addNotification('error', t('bookingFailed'), t('bookingFailedDesc'));
      } else {
        handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}/enroll`);
      }
    }
  };

  return {
    courses,
    handleAddCourse,
    handleUpdateCourse,
    handleDeleteCourse,
    handleBookCourse,
  };
};
