import { create } from 'zustand';
import { isCourseBooking } from '../../lib/availabilitySlots';
import { createNotificationForUser } from '../../lib/notifications';
import { buildNotification, translateKey } from '../../lib/notificationText';
import { Booking, Instructor } from '../../types';
import { notify, t } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { withOptimisticBalance } from '../wallet/walletService';
import {
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
  clearStudentBookings,
  clearCancelledBookings,
  ClearStudentBookingsResult,
  ClearCancelledBookingsResult,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from './adminService';

export interface AdminState {
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

  handleClearStudentBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearStudentBookingsResult>;
  handleClearCancelledBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearCancelledBookingsResult>;
}

export const useAdminStore = create<AdminState>(() => ({
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

  handleClearStudentBookings: async (onProgress) => {
    const result = await clearStudentBookings(onProgress);
    useBookingsStore.getState().setDeletedCompletedStats({ revenue: 0, count: 0 });
    return result;
  },

  handleClearCancelledBookings: async (onProgress) => {
    return await clearCancelledBookings(onProgress);
  },
}));
