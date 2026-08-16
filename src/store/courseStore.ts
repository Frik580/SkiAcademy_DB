import { create } from 'zustand';
import confetti from 'canvas-confetti';
import { auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { createNotificationForUser } from '../lib/notifications';
import { buildNotification, translateKey } from '../lib/notificationText';
import { Course, UserProfile } from '../types';
import { notify, t, getLanguage } from './storeContext';
import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useBookingStore } from './bookingStore';
import { withOptimisticBalance } from '../features/wallet/walletService';
import {
  addCourseService,
  updateCourseService,
  deleteCourseService,
  enrollInCourseService,
  syncCourseSeatsService,
} from '../features/courses/courseService';

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
    await addCourseService(course);
  },

  handleUpdateCourse: async (course) => {
    const { courses } = get();
    const { userProfile } = useProfileStore.getState();
    const { bookings } = useBookingStore.getState();

    await updateCourseService(course);
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
    await deleteCourseService(courseId);
  },

  handleBookCourse: async (courseId, customProfile) => {
    const { userProfile } = useProfileStore.getState();
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
      const course = get().courses.find((item) => item.id === courseId);
      const isSelfEnrollment = activeUser.uid === activeProfile.uid && !customProfile;
      const estimatedPrice = course?.price ?? 0;

      const { courseTitle } = await withOptimisticBalance(
        isSelfEnrollment ? -estimatedPrice : 0,
        () => enrollInCourseService(activeUser.uid, courseId, getLanguage())
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
      } else {
        handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}/enroll`);
      }
    }
  },

  syncCourseSeats: async () => {
    const { courses } = get();
    const { userProfile } = useProfileStore.getState();
    const { bookings } = useBookingStore.getState();

    if (userProfile?.role !== 'admin' || courses.length === 0) return;

    await syncCourseSeatsService(courses, bookings);
  },
}));
