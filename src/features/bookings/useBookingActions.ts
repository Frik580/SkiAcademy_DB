import { useCallback } from 'react';
import confetti from 'canvas-confetti';
import { isCourseBooking } from '../../lib/availabilitySlots';
import { createNotificationForUser } from '../../lib/notifications';
import { buildNotification, translateKey } from '../../lib/notificationText';
import { Booking, Instructor, Review } from '../../types';
import {
  clearStudentBookings,
  clearCancelledBookings,
  ClearStudentBookingsResult,
  ClearCancelledBookingsResult,
} from '../../lib/clearStudentBookings';
import { notify, t } from '../../store/storeContext';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { withOptimisticBalance } from '../wallet/walletService';
import {
  createBookingForUser,
  rescheduleBookingService,
  reassignInstructorService,
  cancelBookingService,
  requestBookingCancellation,
  addBookingDirect,
  deleteBookingService,
  confirmBookingService,
  completeBookingService,
  toggleRecommendationService,
  linkGuestBookingService,
  addReviewService,
  addInstructorService,
  updateInstructorService,
  deleteInstructorService,
  InsufficientFundsError,
  BookingSlotOverlapError,
} from './bookingService';
import { useBookingsStore } from './bookingsStore';

/**
 * Booking use-cases are composed at the feature boundary. This keeps the
 * bookings store a domain cache rather than a coordinator of other stores.
 */
export function useBookingActions() {
  const bookings = useBookingsStore((state) => state.bookings);
  const reviews = useBookingsStore((state) => state.reviews);
  const deletedCompletedStats = useBookingsStore((state) => state.deletedCompletedStats);
  const setDeletedCompletedStats = useBookingsStore((state) => state.setDeletedCompletedStats);
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);

  const handleBookingSuccess = useCallback(
    async (booking: Booking): Promise<number> => {
      if (!userProfile || !firebaseUser) return 0;
      const estimatedPrice = booking.totalPrice ?? 0;

      try {
        const { totalPrice } = await withOptimisticBalance(-estimatedPrice, () =>
          createBookingForUser(firebaseUser.uid, booking)
        );
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        return totalPrice;
      } catch (error) {
        if (error instanceof InsufficientFundsError) throw new Error(t('insufficientFunds'));
        if (error instanceof BookingSlotOverlapError) throw new Error(t('slotUnavailable'));
        throw error;
      }
    },
    [firebaseUser, userProfile]
  );

  const handleReschedule = useCallback(
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
    async (id: string, newInstructor: Instructor, newDate?: string, newTime?: string) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking || isCourseBooking(booking)) return;

      const date = newDate ?? booking.date;
      const time = newTime ?? booking.time;
      const previousInstructorName = booking.instructorName;
      try {
        await reassignInstructorService(id, newInstructor, date, time);
      } catch (error) {
        if (error instanceof BookingSlotOverlapError) throw new Error(t('slotUnavailable'));
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

  const handleCancel = useCallback(
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

  const handleRequestCancel = useCallback(async (id: string, reason?: string) => {
    await requestBookingCancellation(id, reason);
  }, []);

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

  const handleDeleteBooking = useCallback(
    async (id: string) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return;
      const result = await deleteBookingService(booking, deletedCompletedStats);
      if (result.newStats) setDeletedCompletedStats(result.newStats);
    },
    [bookings, deletedCompletedStats, setDeletedCompletedStats]
  );

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

  const handleToggleRecommendation = useCallback(
    async (bookingId: string, recommendationId: string, checked: boolean) => {
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;
      await toggleRecommendationService(booking, recommendationId, checked, firebaseUser?.uid);
    },
    [bookings, firebaseUser?.uid]
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

  const handleClearStudentBookings = useCallback(
    async (onProgress?: (deleted: number) => void): Promise<ClearStudentBookingsResult> => {
      const result = await clearStudentBookings(onProgress);
      setDeletedCompletedStats({ revenue: 0, count: 0 });
      return result;
    },
    [setDeletedCompletedStats]
  );

  const handleClearCancelledBookings = useCallback(
    async (onProgress?: (deleted: number) => void): Promise<ClearCancelledBookingsResult> =>
      clearCancelledBookings(onProgress),
    []
  );

  const handleAddReview = useCallback(
    async (newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>) => {
      if (!userProfile) return;
      const booking = bookings.find((item) => item.id === newReviewInput.bookingId);
      await addReviewService(newReviewInput, userProfile, reviews, booking);
    },
    [bookings, reviews, userProfile]
  );

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

  return {
    handleBookingSuccess,
    handleReschedule,
    handleReassignInstructor,
    handleCancel,
    handleRequestCancel,
    handleAddBooking,
    handleDeleteBooking,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleToggleRecommendation,
    handleClearStudentBookings,
    handleClearCancelledBookings,
    handleAddReview,
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
  };
}
