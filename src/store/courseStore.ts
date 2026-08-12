import { create } from 'zustand';
import confetti from 'canvas-confetti';
import {
  auth,
  db,
  deleteDoc,
  doc,
  handleFirestoreError,
  OperationType,
  setDoc,
  updateDoc,
  writeBatch,
} from '../lib/firebase';
import { enrollInCourse, isActiveCourseEnrollment } from '../lib/courseTransactions';
import { stripUndefinedFields } from '../lib/courseClone';
import { createNotificationForUser } from '../lib/notifications';
import { buildNotification, translateKey } from '../lib/notificationText';
import { Course, UserProfile } from '../types';
import { logger } from '../lib/logger';
import { notify, t, getLanguage } from './storeContext';
import { useAuthStore } from './authStore';
import { useBookingStore } from './bookingStore';

interface CourseState {
  courses: Course[];

  setCourses: (courses: Course[]) => void;
  handleAddCourse: (course: Course) => Promise<void>;
  handleUpdateCourse: (course: Course) => Promise<void>;
  handleDeleteCourse: (courseId: string) => Promise<void>;
  handleBookCourse: (courseId: string, customProfile?: UserProfile) => Promise<void>;
  syncCourseSeats: () => Promise<void>;
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],

  setCourses: (courses) => set({ courses }),

  handleAddCourse: async (course) => {
    await setDoc(
      doc(db, 'courses', course.id),
      stripUndefinedFields(course as unknown as Record<string, unknown>)
    );
  },

  handleUpdateCourse: async (course) => {
    const { courses } = get();
    const { userProfile } = useAuthStore.getState();
    const { bookings } = useBookingStore.getState();

    await updateDoc(doc(db, 'courses', course.id), course as unknown as Record<string, unknown>);
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
  },

  handleDeleteCourse: async (courseId) => {
    await deleteDoc(doc(db, 'courses', courseId));
  },

  handleBookCourse: async (courseId, customProfile) => {
    const { userProfile } = useAuthStore.getState();
    const activeProfile = customProfile || userProfile;
    const activeUser = useAuthStore.getState().firebaseUser || auth.currentUser;

    if (!activeProfile || !activeUser) {
      notify('warning', t('signInRequired'), t('signInRequiredDesc'));
      return;
    }
    if (activeProfile.isClientActive === false) {
      notify('error', t('bookingRestricted'), t('bookingRestrictedDesc'));
      return;
    }

    try {
      const { courseTitle } = await enrollInCourse(db, activeUser.uid, courseId, getLanguage());

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
      } else {
        handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}/enroll`);
      }
    }
  },

  syncCourseSeats: async () => {
    const { courses } = get();
    const { userProfile } = useAuthStore.getState();
    const { bookings } = useBookingStore.getState();

    if (userProfile?.role !== 'admin' || courses.length === 0) return;

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
  },
}));
