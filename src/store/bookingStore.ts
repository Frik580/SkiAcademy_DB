import { create } from 'zustand';
import confetti from 'canvas-confetti';
import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  handleFirestoreError,
  OperationType,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '../lib/firebase';
import { AVAILABILITY_SLOTS_COLLECTION, isCourseBooking } from '../lib/availabilitySlots';
import { finalizeBookingCompletion } from '../lib/completeBooking';
import {
  cancelBookingWithRefund,
  createBookingWithPayment,
  addBookingWithPayment,
  BookingSlotOverlapError,
  InsufficientFundsError,
  rescheduleBooking,
  resolveBookingTotalPrice,
} from '../lib/bookingTransactions';
import {
  activityLogId,
  buildBookingCompletedMetadata,
  logActivityForUser,
} from '../lib/activityLog';
import { createNotificationForUser } from '../lib/notifications';
import { buildNotification, translateKey } from '../lib/notificationText';
import { stripUndefinedFields } from '../lib/courseClone';
import { Booking, Instructor, Review } from '../types';
import { logger } from '../lib/logger';
import { toggleCompletedRecommendationIds } from '../lib/lessonRecommendations';
import { clearStudentBookings, clearCancelledBookings } from '../lib/clearStudentBookings';
import { autoCompleteEligibleBookings, queryOverdueBookings } from '../lib/autoCompleteBookings';
import { isBookingEligibleForAutoComplete } from '../lib/bookingEndsAt';
import { notify, t } from './storeContext';
import { useAuthStore } from './authStore';
import { withOptimisticBalance } from './withOptimisticBalance';

interface DeletedCompletedStats {
  revenue: number;
  count: number;
}

interface BookingState {
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
  ) => Promise<import('../lib/clearStudentBookings').ClearStudentBookingsResult>;
  handleClearCancelledBookings: (
    onProgress?: (deleted: number) => void
  ) => Promise<import('../lib/clearStudentBookings').ClearCancelledBookingsResult>;
  handleAddReview: (
    newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>
  ) => Promise<void>;
  handleAddInstructor: (instructor: Instructor) => Promise<void>;
  handleUpdateInstructor: (instructor: Instructor) => Promise<void>;
  handleDeleteInstructor: (id: string) => Promise<void>;
  runAutoComplete: () => Promise<void>;
}

export const useBookingStore = create<BookingState>((set, get) => ({
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
    const { firebaseUser, userProfile } = useAuthStore.getState();
    if (!userProfile || !firebaseUser) return 0;

    const estimatedPrice = booking.totalPrice ?? 0;

    try {
      const { totalPrice } = await withOptimisticBalance(-estimatedPrice, () =>
        createBookingWithPayment(db, firebaseUser.uid, booking)
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
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id} (transaction)`);
      throw error;
    }
  },

  handleReschedule: async (id, newDate, newTime) => {
    const { bookings } = get();
    const { userProfile } = useAuthStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    try {
      await rescheduleBooking(db, id, { date: newDate, time: newTime });
    } catch (error) {
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/reschedule`);
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
    const { userProfile } = useAuthStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking || isCourseBooking(booking)) return;

    const date = newDate ?? booking.date;
    const time = newTime ?? booking.time;
    const previousInstructorName = booking.instructorName;

    try {
      await rescheduleBooking(db, id, {
        instructorId: newInstructor.id,
        instructorName: newInstructor.name,
        instructorAvatar: newInstructor.avatarUrl,
        date,
        time,
      });
    } catch (error) {
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/reassign`);
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
    const { userProfile, firebaseUser } = useAuthStore.getState();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    const bookingOwnerId = booking.userId;
    const isSystemBlock = bookingOwnerId.startsWith('system_block_');
    const isGuest = bookingOwnerId.startsWith('guest_');
    const isSelfCancellation = bookingOwnerId === firebaseUser?.uid;
    const estimatedRefund = refundAmount ?? booking.totalPrice ?? 0;

    try {
      const { alreadyCancelled } = await withOptimisticBalance(
        isSelfCancellation ? estimatedRefund : 0,
        () => cancelBookingWithRefund(db, id, refundAmount)
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/cancel`);
    }
  },

  handleRequestCancel: async (id, reason) => {
    await updateDoc(doc(db, 'bookings', id), {
      status: 'pending_cancellation',
      cancellationReason: reason || '',
    });
  },

  handleAddBooking: async (booking) => {
    const { firebaseUser } = useAuthStore.getState();
    const isCurrentUserBooking = booking.userId === firebaseUser?.uid;
    const estimatedPrice = booking.totalPrice ?? 0;

    try {
      await withOptimisticBalance(isCurrentUserBooking ? -estimatedPrice : 0, () =>
        addBookingWithPayment(db, booking)
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        throw new Error(t('insufficientFunds'));
      }
      if (error instanceof BookingSlotOverlapError) {
        throw new Error(t('slotUnavailable'));
      }
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/add`);
      throw error;
    }
  },

  handleDeleteBooking: async (id) => {
    const { bookings, deletedCompletedStats } = get();
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    if (booking.status === 'completed') {
      const newStats = {
        revenue: deletedCompletedStats.revenue + (booking.totalPrice || 0),
        count: deletedCompletedStats.count + 1,
      };
      await setDoc(
        doc(db, 'users', 'school_global_stats'),
        {
          deletedCompletedRevenue: newStats.revenue,
          deletedCompletedCount: newStats.count,
        },
        { merge: true }
      );
      await updateDoc(doc(db, 'bookings', id), { isDeleted: true });
      set({ deletedCompletedStats: newStats });
      return;
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'bookings', id));
    if (!isCourseBooking(booking)) {
      batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, id));
    }
    await batch.commit();
  },

  handleConfirmBooking: async (id) => {
    const { bookings } = get();
    await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
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
    const booking = await finalizeBookingCompletion(db, id);
    if (!booking || booking.status !== 'completed') return;

    if (firebaseUser) {
      await logActivityForUser(
        booking.userId,
        firebaseUser.uid,
        'booking_completed',
        buildBookingCompletedMetadata(booking, []),
        activityLogId.bookingCompleted(booking.id)
      );
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

    const completedRecommendationIds = toggleCompletedRecommendationIds(
      booking.completedRecommendationIds,
      recommendationId,
      checked
    );

    try {
      await updateDoc(doc(db, 'bookings', bookingId), { completedRecommendationIds });
      if (checked && firebaseUser) {
        const recommendation = booking.recommendations?.find(
          (item) => item.id === recommendationId
        );
        await logActivityForUser(
          booking.userId,
          firebaseUser.uid,
          'recommendation_completed',
          {
            bookingId,
            recommendationId,
            recommendationText: recommendation?.text,
            instructorName: booking.instructorName,
            lessonTitle: booking.instructorName,
          },
          activityLogId.recommendationCompleted(bookingId, recommendationId)
        );

        const recs = booking.recommendations ?? [];
        const allDone =
          recs.length > 0 && recs.every((item) => completedRecommendationIds.includes(item.id));
        if (allDone) {
          await logActivityForUser(
            booking.userId,
            firebaseUser.uid,
            'recommendations_completed_all',
            {
              bookingId,
              instructorName: booking.instructorName,
              lessonTitle: booking.instructorName,
            },
            activityLogId.recommendationsAllCompleted(bookingId)
          );
        }
      }
    } catch (error) {
      logger.error('Error toggling recommendation:', error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
      throw error;
    }
  },

  handleLinkGuestBooking: async (bookingId, targetUserId) => {
    const { bookings } = get();
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const oldUserId = booking.userId;
    const isConfirmed = booking.status === 'confirmed';

    let lessonCost = 0;
    let updatedTargetBalance: number | null = null;

    await runTransaction(db, async (transaction) => {
      lessonCost = await resolveBookingTotalPrice(transaction, db, booking);

      const targetUserRef = doc(db, 'users', targetUserId);
      const targetUserSnap = await transaction.get(targetUserRef);

      let currentBalance = 0;
      if (targetUserSnap.exists()) {
        const userData = targetUserSnap.data() as import('../types').UserProfile;
        currentBalance = userData.balanceUSD ?? 0;
      }

      if (isConfirmed && lessonCost > 0) {
        if (currentBalance < lessonCost) {
          const errMsg = `${t('insufficientFundsForLink') || 'Недостаточно средств на счету клиента для привязки этого занятия.'} (${t('balance') || 'Баланс'}: $${currentBalance}, ${t('costLabel') || 'стоимость'}: $${lessonCost})`;
          throw new Error(errMsg);
        }
        updatedTargetBalance = currentBalance - lessonCost;
        if (targetUserSnap.exists()) {
          transaction.update(targetUserRef, { balanceUSD: updatedTargetBalance });
        }
      }

      transaction.update(doc(db, 'bookings', bookingId), {
        userId: targetUserId,
        isGuest: false,
      });
    });

    if (oldUserId && (oldUserId.startsWith('guest_') || booking.isGuest)) {
      try {
        const oldUserDoc = await getDoc(doc(db, 'users', oldUserId));
        if (oldUserDoc.exists()) {
          const oldUserData = oldUserDoc.data();
          if (oldUserData.skillScores && Object.keys(oldUserData.skillScores).length > 0) {
            const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
            const targetUserData = targetUserDoc.exists() ? targetUserDoc.data() : {};
            const mergedScores = {
              ...(targetUserData.skillScores || {}),
              ...oldUserData.skillScores,
            };
            const mergedComments = {
              ...(targetUserData.skillComments || {}),
              ...(oldUserData.skillComments || {}),
            };
            await updateDoc(doc(db, 'users', targetUserId), {
              skillScores: mergedScores,
              skillComments: mergedComments,
            });
          }
        }

        const rQuery = query(collection(db, 'reviews'), where('userId', '==', oldUserId));
        const rSnap = await getDocs(rQuery);
        for (const rDoc of rSnap.docs) {
          await updateDoc(doc(db, 'reviews', rDoc.id), { userId: targetUserId });
        }
      } catch (err) {
        logger.error('Error linking guest data:', err);
      }
    }

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
    try {
      const result = await clearStudentBookings(onProgress);
      set({ deletedCompletedStats: { revenue: 0, count: 0 } });
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bookings/clear-student-bookings');
      throw error;
    }
  },

  handleClearCancelledBookings: async (onProgress) => {
    try {
      return await clearCancelledBookings(onProgress);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bookings/clear-cancelled-bookings');
      throw error;
    }
  },

  handleAddReview: async (newReviewInput) => {
    const { bookings, reviews } = get();
    const { userProfile } = useAuthStore.getState();
    if (!userProfile) return;

    const newReview: Review = {
      id: `rev_${Date.now()}`,
      userId: userProfile.uid,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatarUrl,
      date: new Date().toISOString().split('T')[0],
      ...newReviewInput,
    };
    await setDoc(doc(db, 'reviews', newReview.id), newReview);

    const booking = bookings.find((item) => item.id === newReviewInput.bookingId);
    await logActivityForUser(
      userProfile.uid,
      userProfile.uid,
      'review_created',
      {
        reviewId: newReview.id,
        bookingId: newReviewInput.bookingId,
        instructorId: newReview.instructorId,
        instructorName: booking?.instructorName,
        rating: newReview.rating,
      },
      activityLogId.reviewCreated(newReview.id)
    );

    const instructorReviews = [newReview, ...reviews].filter(
      (review) => review.instructorId === newReview.instructorId
    );
    const averageRating =
      instructorReviews.reduce((sum, review) => sum + review.rating, 0) / instructorReviews.length;
    await updateDoc(doc(db, 'instructors', newReview.instructorId), {
      rating: Number(averageRating.toFixed(1)),
      reviewsCount: instructorReviews.length,
    });
  },

  handleAddInstructor: async (instructor) => {
    const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
    await setDoc(doc(db, 'instructors', instructor.id), cleanData);
  },

  handleUpdateInstructor: async (instructor) => {
    const { bookings } = get();
    const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
    await setDoc(doc(db, 'instructors', instructor.id), cleanData);
    const affectedBookings = bookings.filter((booking) => booking.instructorId === instructor.id);
    if (affectedBookings.length === 0) return;

    const BATCH_SIZE = 400;
    for (let i = 0; i < affectedBookings.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const booking of affectedBookings.slice(i, i + BATCH_SIZE)) {
        batch.update(doc(db, 'bookings', booking.id), {
          instructorName: instructor.name,
          instructorAvatar: instructor.avatarUrl,
        });
      }
      await batch.commit();
    }
  },

  handleDeleteInstructor: async (id) => {
    await deleteDoc(doc(db, 'instructors', id));
  },

  runAutoComplete: async () => {
    const { bookings, bookingsLoaded } = get();
    const { firebaseUser, userProfile } = useAuthStore.getState();
    if (!firebaseUser || !bookingsLoaded) return;

    const candidates = new Map<string, Booking>();
    for (const booking of bookings) {
      if (isBookingEligibleForAutoComplete(booking)) {
        candidates.set(booking.id, booking);
      }
    }

    if (userProfile?.role === 'admin') {
      const overdueBookings = await queryOverdueBookings(db);
      for (const booking of overdueBookings) {
        candidates.set(booking.id, booking);
      }
    }

    await autoCompleteEligibleBookings(db, [...candidates.values()], firebaseUser.uid, {
      onCompleted: (booking) => {
        notify(
          'success',
          t('lessonAutoCompleted'),
          `${t('lessonAutoCompletedDesc')} ${booking.instructorName} ${t('lessonAutoCompletedSuffix')}`
        );
      },
    });
  },
}));
