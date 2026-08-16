import { create } from 'zustand';
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

export interface DeletedCompletedStats {
  revenue: number;
  count: number;
}

export interface BookingsState {
  bookings: Booking[];
  bookingsLoaded: boolean;
  deletedCompletedStats: DeletedCompletedStats;
  instructors: Instructor[];
  reviews: Review[];

  setBookings: (bookings: Booking[]) => void;
  setBookingsLoaded: (loaded: boolean) => void;
  setDeletedCompletedStats: (stats: DeletedCompletedStats) => void;
  setInstructors: (instructors: Instructor[]) => void;
  setReviews: (reviews: Review[]) => void;

  handleBookingSuccess: (booking: Booking) => Promise<number>;
  handleReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  handleReassignInstructor: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  handleCancel: (id: string, refundAmount?: number) => Promise<void>;
  handleRequestCancel: (id: string, reason?: string) => Promise<void>;
  handleAddBooking: (booking: Booking) => Promise<void>;
  handleDeleteBooking: (id: string) => Promise<void>;
  handleConfirmBooking: (id: string) => Promise<void>;
  handleCompleteBooking: (id: string) => Promise<void>;
  handleLinkGuestBooking: (bookingId: string, targetUserId: string) => Promise<void>;
  handleToggleRecommendation: (
    bookingId: string,
    recommendationId: string,
    checked: boolean
  ) => Promise<void>;
  handleClearStudentBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearStudentBookingsResult>;
  handleClearCancelledBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearCancelledBookingsResult>;
  handleAddReview: (
    newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
  handleAddInstructor: (instructor: Instructor) => Promise<void>;
  handleUpdateInstructor: (instructor: Instructor) => Promise<void>;
  handleDeleteInstructor: (id: string) => Promise<void>;
}

export const useBookingsStore = create<BookingsState>((set, get) => ({
  bookings: [],
  bookingsLoaded: false,
  deletedCompletedStats: { revenue: 0, count: 0 },
  instructors: [],
  reviews: [],

  setBookings: (bookings) => set({ bookings }),
  setBookingsLoaded: (loaded) => set({ bookingsLoaded: loaded }),
  setDeletedCompletedStats: (stats) => set({ deletedCompletedStats: stats }),
  setInstructors: (instructors) => set({ instructors }),
  setReviews: (reviews) => set({ reviews }),

  handleBookingSuccess: async (booking) => {
    const { firebaseUser } = useAuthStore.getState();
    const { userProfile } = useProfileStore.getState();
    if (!userProfile || !firebaseUser) return 0;

    const estimatedPrice = booking.totalPrice ?? 0;

    try {
      const { totalPrice } = await withOptimisticBalance(-estimatedPrice, () =>
        createBookingForUser(firebaseUser.uid, booking)
      );
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      return totalPrice;
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

  handleReschedule: async (id, newDate, newTime) => {
    const { bookings } = get();
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
    const { bookings } = get();
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

  handleCancel: async (id, refundAmount) => {
    const { bookings } = get();
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

  handleRequestCancel: async (id, reason) => {
    await requestBookingCancellation(id, reason);
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

  handleDeleteBooking: async (id) => {
    const { bookings, deletedCompletedStats } = get();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const result = await deleteBookingService(booking, deletedCompletedStats);
    if (result.newStats) {
      set({ deletedCompletedStats: result.newStats });
    }
  },

  handleConfirmBooking: async (id) => {
    const { bookings } = get();
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

  handleToggleRecommendation: async (bookingId, recommendationId, checked) => {
    const { bookings } = get();
    const { firebaseUser } = useAuthStore.getState();
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    await toggleRecommendationService(booking, recommendationId, checked, firebaseUser?.uid);
  },

  handleLinkGuestBooking: async (bookingId, targetUserId) => {
    const { bookings } = get();
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

  handleClearStudentBookings: async (onProgress) => {
    const result = await clearStudentBookings(onProgress);
    set({ deletedCompletedStats: { revenue: 0, count: 0 } });
    return result;
  },

  handleClearCancelledBookings: async (onProgress) => {
    return await clearCancelledBookings(onProgress);
  },

  handleAddReview: async (newReviewInput) => {
    const { bookings, reviews } = get();
    const { userProfile } = useProfileStore.getState();
    if (!userProfile) return;

    const booking = bookings.find((item) => item.id === newReviewInput.bookingId);
    await addReviewService(newReviewInput, userProfile, reviews, booking);
  },

  handleAddInstructor: async (instructor) => {
    await addInstructorService(instructor);
  },

  handleUpdateInstructor: async (instructor) => {
    const { bookings } = get();
    const affectedBookings = bookings.filter((booking) => booking.instructorId === instructor.id);
    await updateInstructorService(instructor, affectedBookings);
  },

  handleDeleteInstructor: async (id) => {
    await deleteInstructorService(id);
  },
}));

// Backward compatibility alias
export const useBookingStore = useBookingsStore;
