import { create } from 'zustand';
import { isCourseBooking } from '../../lib/availabilitySlots';
import { canManageAdminRoles } from '../../lib/accessControl';
import { createNotificationForUser } from '../../lib/notifications';
import { buildNotification, translateKey } from '../../lib/notificationText';
import { Booking, Instructor, Course, UserProfile } from '../../types';
import { SkillConfig } from '../../lib/skillData';
import { AchievementsConfig } from '../../lib/achievementConfig';
import { notify, t } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useCoursesStore } from '../courses/coursesStore';
import { useUiStore } from '../../store/uiStore';
import { withOptimisticBalance } from '../wallet/walletService';
import {
  updateUserRoleService,
  addUserService,
  updateUserDataWithLedgerService,
  deleteUserService,
  confirmBookingService,
  completeBookingService,
  linkGuestBookingService,
  deleteBookingService,
  addBookingDirect,
  reassignInstructorService,
  rescheduleBookingService,
  cancelBookingService,
  addInstructorService,
  updateInstructorService,
  deleteInstructorService,
  addCourseService,
  updateCourseService,
  deleteCourseService,
  notifyCourseModifiedService,
  clearStudentBookings,
  clearCancelledBookings,
  ClearStudentBookingsResult,
  ClearCancelledBookingsResult,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from './adminService';

export interface AdminState {
  handleUpdateUserRole: (targetUid: string, newRole: 'admin' | 'user') => Promise<void>;
  handleAddUser: (newUser: UserProfile) => Promise<void>;
  handleUpdateUser: (updatedUser: UserProfile) => Promise<void>;
  handleDeleteUser: (targetUid: string) => Promise<void>;

  handleAddInstructor: (instructor: Instructor) => Promise<void>;
  handleUpdateInstructor: (instructor: Instructor) => Promise<void>;
  handleDeleteInstructor: (id: string) => Promise<void>;

  handleConfirmBooking: (id: string) => Promise<void>;
  handleCompleteBooking: (id: string) => Promise<void>;
  handleLinkGuestBooking: (bookingId: string, targetUserId: string) => Promise<void>;
  handleCancelBooking: (id: string, refundAmount?: number) => Promise<void>;
  handleRescheduleBooking: (id: string, newDate: string, newTime: string) => Promise<void>;
  handleReassignInstructor: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  handleDeleteBooking: (id: string) => Promise<void>;
  handleAddBooking: (booking: Booking) => Promise<void>;

  handleAddCourse: (course: Course) => Promise<void>;
  handleUpdateCourse: (course: Course) => Promise<void>;
  handleDeleteCourse: (courseId: string) => Promise<void>;

  handleClearStudentBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearStudentBookingsResult>;
  handleClearCancelledBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearCancelledBookingsResult>;

  handleToggleFilters: (enabled: boolean) => Promise<void>;
  handleToggleOnboarding: (enabled: boolean) => Promise<void>;
  handleSetNotificationRetentionDays: (days: number) => Promise<void>;
  handleUpdateSkillConfig: (config: SkillConfig) => Promise<void>;
  handleUpdateAchievementsConfig: (config: AchievementsConfig) => Promise<void>;
}

export const useAdminStore = create<AdminState>(() => ({
  handleUpdateUserRole: async (targetUid, newRole) => {
    const { userProfile } = useProfileStore.getState();
    if (!canManageAdminRoles(userProfile)) {
      notify('error', t('accessDenied'), t('accessDeniedDesc'));
      return;
    }
    await updateUserRoleService(targetUid, newRole);
    notify('success', t('roleUpdated'), `${t('roleUpdatedDescPrefix')} ${newRole}.`);
  },

  handleAddUser: async (newUser) => {
    await addUserService(newUser);
  },

  handleUpdateUser: async (updatedUser) => {
    await updateUserDataWithLedgerService(updatedUser);
  },

  handleDeleteUser: async (targetUid) => {
    await deleteUserService(targetUid);
  },

  handleAddInstructor: async (instructor) => {
    await addInstructorService(instructor);
  },

  handleUpdateInstructor: async (instructor) => {
    const { bookings } = useBookingsStore.getState();
    const affectedBookings = bookings.filter((booking) => booking.instructorId === instructor.id);
    await updateInstructorService(instructor, affectedBookings);
  },

  handleDeleteInstructor: async (id) => {
    await deleteInstructorService(id);
  },

  handleConfirmBooking: async (id) => {
    const { bookings } = useBookingsStore.getState();
    await confirmBookingService(id);
    const booking = bookings.find((item) => item.id === id);
    if (booking) {
      await createNotificationForUser(
        booking.userId,
        buildNotification(
          'lessonConfirmedAdmin',
          (lang) =>
            `${translateKey('lessonConfirmedDescPrefix', lang)} ${booking.instructorName} ${translateKey('lessonConfirmedDescSuffix', lang)}`
        ),
        'success'
      );
    }
  },

  handleCompleteBooking: async (id) => {
    const { firebaseUser } = useAuthStore.getState();
    const booking = await completeBookingService(id, firebaseUser?.uid);
    if (!booking) return;

    if (firebaseUser) {
      await createNotificationForUser(
        booking.userId,
        buildNotification(
          'lessonCompletedAdmin',
          (lang) =>
            `${translateKey('lessonCompletedDescPrefix', lang)} ${booking.instructorName} ${translateKey('lessonCompletedDescSuffix', lang)}`
        ),
        'success'
      );
    }
  },

  handleLinkGuestBooking: async (bookingId, targetUserId) => {
    const { bookings } = useBookingsStore.getState();
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const insufficientFundsMsg = `${t('insufficientFundsForLink') || 'Недостаточно средств на счету клиента для привязки этого занятия.'}`;
    await linkGuestBookingService(booking, targetUserId, { insufficientFundsMsg });

    await createNotificationForUser(
      targetUserId,
      buildNotification(
        'bookingLinkedTitle',
        (lang) =>
          `${translateKey('bookingLinkedDesc', lang)} ${booking.instructorName} (${booking.date} @ ${booking.time}) ${translateKey('bookingLinkedAccountSuffix', lang)}`
      ),
      'success'
    );
  },

  handleCancelBooking: async (id, refundAmount) => {
    const { bookings } = useBookingsStore.getState();
    const { firebaseUser } = useAuthStore.getState();
    const { userProfile } = useProfileStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');
    const isGuest = bookingOwnerId.startsWith('guest_');
    const isSelfCancellation = bookingOwnerId === firebaseUser?.uid;
    const estimatedRefund = refundAmount ?? booking.totalPrice ?? 0;

    const { alreadyCancelled } = await withOptimisticBalance(
      isSelfCancellation ? estimatedRefund : 0,
      () => cancelBookingService(id, refundAmount)
    );
    if (alreadyCancelled) return;

    if (userProfile?.role === 'admin') {
      if (!isSystemBlock && !isGuest) {
        await createNotificationForUser(
          bookingOwnerId,
          buildNotification(
            'lessonCancelled',
            (lang) =>
              `${translateKey('lessonCancelledDescPrefix', lang)} ${booking.instructorName} ${translateKey('lessonCancelledDescSuffix', lang)}`
          ),
          'warning'
        );
      }
      notify(
        'success',
        t('lessonCancelled'),
        `${t('lessonCancelledDescPrefix')} ${booking.instructorName} ${t('lessonCancelledDescSuffix')}`
      );
    }
  },

  handleRescheduleBooking: async (id, newDate, newTime) => {
    const { bookings } = useBookingsStore.getState();
    const { userProfile } = useProfileStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    try {
      await rescheduleBookingService(id, newDate, newTime);
    } catch (error) {
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      throw error;
    }

    if (userProfile?.role === 'admin') {
      await createNotificationForUser(
        booking.userId,
        buildNotification(
          'lessonRescheduled',
          (lang) =>
            `${translateKey('lessonRescheduledAdminPrefix', lang)} ${booking.instructorName} ${translateKey('lessonRescheduledAdminMiddle', lang)} ${newDate} ${translateKey('lessonRescheduledAdminAt', lang)} ${newTime}.`
        )
      );
    }
  },

  handleReassignInstructor: async (id, newInstructor, newDate, newTime) => {
    const { bookings } = useBookingsStore.getState();
    const { userProfile } = useProfileStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking || isCourseBooking(booking)) return;

    const date = newDate ?? booking.date;
    const time = newTime ?? booking.time;
    const previousInstructorName = booking.instructorName;

    try {
      await reassignInstructorService(id, newInstructor, date, time);
    } catch (error) {
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      throw error;
    }

    if (userProfile?.role === 'admin') {
      const isSystemBlock = booking.userId.startsWith('system_block_');
      const isGuest = booking.userId.startsWith('guest_');
      if (!isSystemBlock && !isGuest) {
        await createNotificationForUser(
          booking.userId,
          buildNotification(
            'lessonReassigned',
            (lang) =>
              `${translateKey('lessonReassignedAdminPrefix', lang)} ${previousInstructorName} ${translateKey('lessonReassignedAdminMiddle', lang)} ${newInstructor.name} (${date} ${translateKey('lessonRescheduledAdminAt', lang)} ${time}).`
          )
        );
      }
    }
  },

  handleDeleteBooking: async (id) => {
    const { bookings, deletedCompletedStats } = useBookingsStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const result = await deleteBookingService(booking, deletedCompletedStats);
    if (result.newStats) {
      useBookingsStore.getState().setDeletedCompletedStats(result.newStats);
    }
  },

  handleAddBooking: async (booking) => {
    const { firebaseUser } = useAuthStore.getState();
    const isCurrentUserBooking = booking.userId === firebaseUser?.uid;
    const estimatedPrice = booking.totalPrice ?? 0;

    try {
      await withOptimisticBalance(isCurrentUserBooking ? -estimatedPrice : 0, () =>
        addBookingDirect(booking)
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        throw new Error(t('insufficientFunds'));
      }
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      throw error;
    }
  },

  handleAddCourse: async (course) => {
    await addCourseService(course);
  },

  handleUpdateCourse: async (course) => {
    const { courses } = useCoursesStore.getState();
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

  handleClearStudentBookings: async (onProgress) => {
    const result = await clearStudentBookings(onProgress);
    useBookingsStore.getState().setDeletedCompletedStats({ revenue: 0, count: 0 });
    return result;
  },

  handleClearCancelledBookings: async (onProgress) => {
    return await clearCancelledBookings(onProgress);
  },

  handleToggleFilters: async (enabled) => {
    await useUiStore.getState().handleToggleFilters(enabled);
  },

  handleToggleOnboarding: async (enabled) => {
    await useUiStore.getState().handleToggleOnboarding(enabled);
  },

  handleSetNotificationRetentionDays: async (days) => {
    await useUiStore.getState().handleSetNotificationRetentionDays(days);
  },

  handleUpdateSkillConfig: async (config) => {
    await useUiStore.getState().handleUpdateSkillConfig(config);
  },

  handleUpdateAchievementsConfig: async (config) => {
    await useUiStore.getState().handleUpdateAchievementsConfig(config);
  },
}));
