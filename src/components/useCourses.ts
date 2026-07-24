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
  onSnapshot,
  OperationType,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from '../lib/firebase';
import {
  getGroupCourseEnrollmentNote,
  getGroupCourseLabel,
  getGroupScheduleLabel,
  parseDurationHours,
  splitCourseDates,
  translateCourse,
  useLanguage,
} from '../lib/LanguageContext';
import { createNotificationForUser } from '../lib/notifications';
import { Booking, Course, UserProfile } from '../types';
import { useNotifications as useNotificationHub } from './PushNotificationHub';
import { logger } from '../lib/logger';

type SetUserProfile = (profile: UserProfile | null) => void;

export const useCourses = (
  firebaseUser: User | null,
  userProfile: UserProfile | null,
  setUserProfile: SetUserProfile,
  bookings: Booking[]
) => {
  const { addNotification } = useNotificationHub();
  const { language, t } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const coursesQuery = query(collection(db, 'courses'));
    return onSnapshot(coursesQuery, (snapshot) => {
      setCourses(snapshot.docs.map((courseDoc) => ({
        id: courseDoc.id,
        ...courseDoc.data(),
      } as Course)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'courses'));
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
      for (const course of courses) {
        const activeBookingsCount = bookings.filter((booking) =>
          booking.instructorId === `course_${course.id}`
          && booking.status !== 'cancelled'
          && !booking.isDeleted
        ).length;
        const availableSeats = Math.max(0, course.totalSeats - activeBookingsCount);
        if (course.availableSeats === availableSeats) continue;

        try {
          await updateDoc(doc(db, 'courses', course.id), { availableSeats });
        } catch (error) {
          logger.error(`Failed to auto-sync seats for course ${course.id}:`, error);
        }
      }
    };

    syncCourseSeats();
    // Primitive dependency signatures prevent re-running for unrelated snapshot object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsDependency, coursesDependency, userProfile?.role]);

  const handleAddCourse = async (course: Course) => {
    await setDoc(doc(db, 'courses', course.id), course);
  };

  const handleUpdateCourse = async (course: Course) => {
    await updateDoc(doc(db, 'courses', course.id), course as any);
    if (userProfile?.role !== 'admin') return;

    const oldCourse = courses.find((item) => item.id === course.id);
    const courseBookings = bookings.filter((booking) =>
      booking.instructorId === `course_${course.id}` && booking.status !== 'cancelled'
    );
    let changeDetails = '';

    if (oldCourse?.title !== course.title) {
      changeDetails += `${t('courseModifiedTitleLine')} "${course.title}".\n`;
    }
    if (oldCourse?.dates !== course.dates) {
      changeDetails += `${t('courseModifiedDatesLine')} ${course.dates}.\n`;
    }

    const message = `${t('courseModifiedHeader')} "${course.title}":\n${changeDetails || t('courseModifiedDefault')}`;
    for (const booking of courseBookings) {
      await createNotificationForUser(
        booking.userId,
        t('courseModified'),
        message,
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

    const courseDocRef = doc(db, 'courses', courseId);
    const userDocRef = doc(db, 'users', activeUser.uid);
    const bookingId = `booking_course_${activeUser.uid}_${courseId}`;
    const bookingDocRef = doc(db, 'bookings', bookingId);

    try {
      let courseTitle = '';
      await runTransaction(db, async (transaction) => {
        const courseSnap = await transaction.get(courseDocRef);
        const userSnap = await transaction.get(userDocRef);
        const bookingSnap = await transaction.get(bookingDocRef);

        if (!courseSnap.exists()) throw new Error('Course does not exist.');
        if (!userSnap.exists()) throw new Error('User profile does not exist.');

        const courseData = courseSnap.data() as Course;
        const userData = userSnap.data() as UserProfile;
        const localizedCourse = translateCourse(courseData, language);
        courseTitle = localizedCourse.title;

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          if (bookingData.status !== 'cancelled' && !bookingData.isDeleted) {
            throw new Error('ALREADY_ENROLLED');
          }
        }
        if (courseData.availableSeats <= 0) throw new Error('COURSE_FULL');
        if (userData.balanceUSD < courseData.price) throw new Error('INSUFFICIENT_FUNDS');

        const { datePart, timePart } = splitCourseDates(courseData.dates, language);
        const newBooking: Booking = {
          id: bookingId,
          userId: userData.uid,
          instructorId: `course_${courseId}`,
          instructorName: getGroupCourseLabel(localizedCourse.title, language),
          instructorAvatar: courseData.bgImageUrl,
          date: datePart || courseData.dates,
          time: timePart || getGroupScheduleLabel(language),
          durationHours: parseDurationHours(courseData.duration, 10),
          totalPrice: courseData.price,
          status: 'confirmed',
          difficulty: 'intermediate',
          notes: getGroupCourseEnrollmentNote(localizedCourse.description, language),
        };

        transaction.update(userDocRef, { balanceUSD: userData.balanceUSD - courseData.price });
        transaction.update(courseDocRef, { availableSeats: courseData.availableSeats - 1 });
        transaction.set(bookingDocRef, newBooking);
      });

      const course = courses.find((item) => item.id === courseId);
      if (course) {
        setUserProfile({ ...activeProfile, balanceUSD: activeProfile.balanceUSD - course.price });
      }

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
