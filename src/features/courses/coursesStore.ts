import { create } from 'zustand';
import confetti from 'canvas-confetti';
import { auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Course, UserProfile } from '../../types';
import { notify, t, getLanguage } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { withOptimisticBalance } from '../wallet/walletService';
import {
  addCourseService,
  updateCourseService,
  deleteCourseService,
  enrollInCourseService,
  syncCourseSeatsService,
  notifyCourseModifiedService,
} from './courseService';

export interface CoursesState {
  courses: Course[];

  setCourses: (courses: Course[]) => void;
  handleAddCourse: (course: Course) => Promise<void>;
  handleUpdateCourse: (course: Course) => Promise<void>;
  handleDeleteCourse: (courseId: string) => Promise<void>;
  handleBookCourse: (courseId: string, customProfile?: UserProfile) => Promise<void>;
  syncCourseSeats: () => Promise<void>;
}

export const useCoursesStore = create<CoursesState>((set, get) => ({
  courses: [],

  setCourses: (courses) => set({ courses }),

  handleAddCourse: async (course) => {
    await addCourseService(course);
  },

  handleUpdateCourse: async (course) => {
    const { courses } = get();
    const { userProfile } = useProfileStore.getState();
    const { bookings } = useBookingsStore.getState();

    await updateCourseService(course);
    if (userProfile?.role !== 'admin') return;

    const oldCourse = courses.find((item) => item.id === course.id);
    const courseBookings = bookings.filter(
      (booking) => booking.instructorId === `course_${course.id}` && booking.status !== 'cancelled'
    );

    await notifyCourseModifiedService(course, oldCourse, courseBookings);
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
    const { bookings } = useBookingsStore.getState();

    if (userProfile?.role !== 'admin' || courses.length === 0) return;

    await syncCourseSeatsService(courses, bookings);
  },
}));

// Backward compatibility alias
export const useCourseStore = useCoursesStore;
