import { useCallback } from 'react';
import { isCourseBooking } from '../../domain/availability';
import { createNotificationForUser } from '../../domain/notifications';
import { buildNotification, translateKey } from '../../domain/notifications';
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
  BookingSlotOverlapError,
  InsufficientFundsError,
} from '../bookings/bookingService';

/** Admin workflows composed at the route boundary instead of inside a store. */
export function useAdminActions() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);
  const bookings = useBookingsStore((state) => state.bookings);
  const setDeletedCompletedStats = useBookingsStore((state) => state.setDeletedCompletedStats);

  const handleAddInstructor = useCallback(async (instructor: Instructor) => {
    await addInstructorService(instructor);
  }, []);

  const handleUpdateInstructor = useCallback(
    async (instructor: Instructor) => {
      await updateInstructorService(
        instructor,
        bookings.filter((booking) => booking.instructorId === instructor.id)
      );
    },
    [bookings]
  );

  const handleDeleteInstructor = useCallback(async (id: string) => {
    await deleteInstructorService(id);
  }, []);

  const handleConfirmBooking = useCallback(
    async (id: string) => {
      await confirmBookingService(id);
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return;
      await createNotificationForUser(
        booking.userId,
        buildNotification(
          'lessonConfirmedAdmin',
          (lang) =>
            `${translateKey('lessonConfirmedDescPrefix', lang)} ${booking.instructorName} ${translateKey('lessonConfirmedDescSuffix', lang)}`
        ),
        'success'
      );
    },
    [bookings]
  );

  const handleCompleteBooking = useCallback(
    async (id: string) => {
      const booking = await completeBookingService(id, firebaseUser?.uid);
      if (!booking || !firebaseUser) return;
      await createNotificationForUser(
        booking.userId,
        buildNotification(
          'lessonCompletedAdmin',
          (lang) =>
            `${translateKey('lessonCompletedDescPrefix', lang)} ${booking.instructorName} ${translateKey('lessonCompletedDescSuffix', lang)}`
        ),
        'success'
      );
    },
    [firebaseUser]
  );

  const handleLinkGuestBooking = useCallback(
    async (bookingId: string, targetUserId: string) => {
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;
      const insufficientFundsMsg =
        t('insufficientFundsForLink') ||
        'Недостаточно средств на счету клиента для привязки этого занятия.';
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
    [bookings]
  );

  const handleCancelBooking = useCallback(
    async (id: string, refundAmount?: number) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return;
      const isSystemBlock = booking.userId.startsWith('system_block_');
      const isGuest = booking.userId.startsWith('guest_');
      const isSelfCancellation = booking.userId === firebaseUser?.uid;
      const estimatedRefund = refundAmount ?? booking.totalPrice ?? 0;
      const { alreadyCancelled } = await withOptimisticBalance(
        isSelfCancellation ? estimatedRefund : 0,
        () => cancelBookingService(id, refundAmount)
      );
      if (alreadyCancelled || userProfile?.role !== 'admin') return;

      if (!isSystemBlock && !isGuest) {
        await createNotificationForUser(
          booking.userId,
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
    },
    [bookings, firebaseUser?.uid, userProfile?.role]
  );

  const handleRescheduleBooking = useCallback(
    async (id: string, newDate: string, newTime: string) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return;
      try {
        await rescheduleBookingService(id, newDate, newTime);
      } catch (error) {
        if (error instanceof BookingSlotOverlapError) throw new Error(t('slotUnavailable'));
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
    [bookings, userProfile?.role]
  );

  const handleReassignInstructor = useCallback(
    async (
      id: string,
      newInstructor: Instructor,
      newDate?: string,
      newTime?: string,
      options?: { allowNegativeBalance?: boolean }
    ) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking || isCourseBooking(booking)) return;
      const date = newDate ?? booking.date;
      const time = newTime ?? booking.time;
      const previousInstructorName = booking.instructorName;
      try {
        await reassignInstructorService(id, newInstructor, date, time, options);
      } catch (error) {
        if (error instanceof BookingSlotOverlapError) throw new Error(t('slotUnavailable'));
        if (error instanceof InsufficientFundsError) throw error;
        throw error;
      }
      if (userProfile?.role !== 'admin') return;
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
    },
    [bookings, userProfile?.role]
  );

  const handleDeleteBooking = useCallback(
    async (id: string) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return;
      const result = await deleteBookingService(booking);
      if (result.newStats) setDeletedCompletedStats(result.newStats);
    },
    [bookings, setDeletedCompletedStats]
  );

  const handleAddBooking = useCallback(
    async (booking: Booking) => {
      const isCurrentUserBooking = booking.userId === firebaseUser?.uid;
      const estimatedPrice = booking.totalPrice ?? 0;
      try {
        await withOptimisticBalance(isCurrentUserBooking ? -estimatedPrice : 0, () =>
          addBookingDirect(booking)
        );
      } catch (error) {
        if (error instanceof InsufficientFundsError) throw new Error(t('insufficientFunds'));
        if (error instanceof BookingSlotOverlapError) throw new Error(t('slotUnavailable'));
        throw error;
      }
    },
    [firebaseUser?.uid]
  );

  return {
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleCancelBooking,
    handleRescheduleBooking,
    handleReassignInstructor,
    handleDeleteBooking,
    handleAddBooking,
  };
}
