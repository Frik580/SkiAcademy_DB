import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  OperationType,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  handleFirestoreError,
} from '../../lib/firebase';
import {
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  isCourseBooking,
  toAvailabilitySlot,
} from '../../lib/availabilitySlots';
import { finalizeBookingCompletion } from '../../lib/completeBooking';
import {
  createBookingViaCallable,
  isCreateBookingCallableInfrastructureError,
} from '../../lib/createBookingCallable';
import {
  cancelBookingWithRefund,
  addBookingWithPayment,
  BookingSlotOverlapError,
  createBookingWithPayment,
  createGuestBooking,
  InsufficientFundsError,
  rescheduleBooking,
  resolveBookingTotalPrice,
  type BookingPaymentResult,
} from '../../lib/bookingTransactions';
import {
  activityLogId,
  buildBookingCompletedMetadata,
  logActivityForUser,
} from '../../lib/activityLog';
import { stripUndefinedFields } from '../../lib/courseClone';
import { Booking, Instructor, LessonRecommendation, Review, UserProfile } from '../../types';
import type { AvailabilitySlot } from '../../types';
import { toUserProfile } from '../../lib/firestoreMappers';

export async function getInstructorAvailabilitySlots(
  instructorId: string,
  date?: string
): Promise<AvailabilitySlot[]> {
  const constraints = [where('instructorId', '==', instructorId)];
  if (date) constraints.push(where('date', '==', date));
  const snapshot = await getDocs(
    query(collection(db, AVAILABILITY_SLOTS_COLLECTION), ...constraints)
  );
  return snapshot.docs.map((slotDoc) => slotDoc.data() as AvailabilitySlot);
}
import { logger } from '../../lib/logger';
import {
  sanitizeRecommendations,
  toggleCompletedRecommendationIds,
} from '../../lib/lessonRecommendations';

export { BookingSlotOverlapError, InsufficientFundsError };
export type { BookingPaymentResult };

export async function createBookingForUser(
  userId: string,
  booking: Booking
): Promise<BookingPaymentResult> {
  try {
    return await createBookingViaCallable(booking);
  } catch (error) {
    if (!isCreateBookingCallableInfrastructureError(error)) {
      throw error;
    }
    logger.warn('createBooking callable unavailable, using direct Firestore transaction', error);
    return createBookingWithPayment(db, userId, booking);
  }
}

export async function createGuestBookingService(booking: Booking): Promise<void> {
  await createGuestBooking(db, booking);
}

export async function rescheduleBookingService(
  id: string,
  newDate: string,
  newTime: string
): Promise<void> {
  try {
    await rescheduleBooking(db, id, { date: newDate, time: newTime });
  } catch (error) {
    if (!(error instanceof BookingSlotOverlapError)) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/reschedule`);
    }
    throw error;
  }
}

export async function reassignInstructorService(
  id: string,
  newInstructor: Instructor,
  newDate?: string,
  newTime?: string
): Promise<void> {
  try {
    await rescheduleBooking(db, id, {
      instructorId: newInstructor.id,
      instructorName: newInstructor.name,
      instructorAvatar: newInstructor.avatarUrl,
      date: newDate,
      time: newTime,
    });
  } catch (error) {
    if (!(error instanceof BookingSlotOverlapError)) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/reassign`);
    }
    throw error;
  }
}

export async function cancelBookingService(
  id: string,
  refundAmount?: number
): Promise<{ alreadyCancelled: boolean }> {
  try {
    return await cancelBookingWithRefund(db, id, refundAmount);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/cancel`);
    throw error;
  }
}

export async function requestBookingCancellation(id: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, 'bookings', id), {
    status: 'pending_cancellation',
    cancellationReason: reason || '',
  });
}

export async function addBookingDirect(booking: Booking): Promise<void> {
  try {
    await addBookingWithPayment(db, booking);
  } catch (error) {
    if (!(error instanceof InsufficientFundsError) && !(error instanceof BookingSlotOverlapError)) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/add`);
    }
    throw error;
  }
}

export async function deleteBookingService(
  booking: Booking,
  deletedCompletedStats: { revenue: number; count: number }
): Promise<{ isDeletedDoc: boolean; newStats?: { revenue: number; count: number } }> {
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
    await updateDoc(doc(db, 'bookings', booking.id), { isDeleted: true });
    return { isDeletedDoc: false, newStats };
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, 'bookings', booking.id));
  if (!isCourseBooking(booking)) {
    batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id));
  }
  await batch.commit();
  return { isDeletedDoc: true };
}

export async function confirmBookingService(id: string): Promise<void> {
  await updateDoc(doc(db, 'bookings', id), { status: 'confirmed' });
}

export async function updateBookingStatusService(
  booking: Booking,
  status: 'confirmed'
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', booking.id), { status });

  const updatedBooking = { ...booking, status };
  if (blocksInstructorAvailability(updatedBooking)) {
    batch.set(
      doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id),
      toAvailabilitySlot(updatedBooking)
    );
  } else {
    batch.delete(doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id));
  }
  await batch.commit();
}

export async function saveBookingRecommendationsService(
  bookingId: string,
  recommendations: LessonRecommendation[]
): Promise<void> {
  await updateDoc(doc(db, 'bookings', bookingId), {
    recommendations: sanitizeRecommendations(recommendations),
  });
}

export async function completeBookingService(
  id: string,
  actorUid?: string
): Promise<Booking | null> {
  const booking = await finalizeBookingCompletion(db, id);
  if (!booking || booking.status !== 'completed') return null;

  if (actorUid) {
    await logActivityForUser(
      booking.userId,
      actorUid,
      'booking_completed',
      buildBookingCompletedMetadata(booking, []),
      activityLogId.bookingCompleted(booking.id)
    );
  }
  return booking;
}

export async function toggleRecommendationService(
  booking: Booking,
  recommendationId: string,
  checked: boolean,
  actorUid?: string
): Promise<string[]> {
  const completedRecommendationIds = toggleCompletedRecommendationIds(
    booking.completedRecommendationIds,
    recommendationId,
    checked
  );

  try {
    await updateDoc(doc(db, 'bookings', booking.id), { completedRecommendationIds });
    if (checked && actorUid) {
      const recommendation = booking.recommendations?.find((item) => item.id === recommendationId);
      await logActivityForUser(
        booking.userId,
        actorUid,
        'recommendation_completed',
        {
          bookingId: booking.id,
          recommendationId,
          recommendationText: recommendation?.text,
          instructorName: booking.instructorName,
          lessonTitle: booking.instructorName,
        },
        activityLogId.recommendationCompleted(booking.id, recommendationId)
      );

      const recs = booking.recommendations ?? [];
      const allDone =
        recs.length > 0 && recs.every((item) => completedRecommendationIds.includes(item.id));
      if (allDone) {
        await logActivityForUser(
          booking.userId,
          actorUid,
          'recommendations_completed_all',
          {
            bookingId: booking.id,
            instructorName: booking.instructorName,
            lessonTitle: booking.instructorName,
          },
          activityLogId.recommendationsAllCompleted(booking.id)
        );
      }
    }
    return completedRecommendationIds;
  } catch (error) {
    logger.error('Error toggling recommendation:', error);
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    throw error;
  }
}

export async function linkGuestBookingService(
  booking: Booking,
  targetUserId: string,
  errorMessages?: { insufficientFundsMsg?: string }
): Promise<void> {
  const oldUserId = booking.userId;
  const isConfirmed = booking.status === 'confirmed';

  await runTransaction(db, async (transaction) => {
    const lessonCost = await resolveBookingTotalPrice(transaction, db, booking);

    const targetUserRef = doc(db, 'users', targetUserId);
    const targetUserSnap = await transaction.get(targetUserRef);

    let currentBalance = 0;
    if (targetUserSnap.exists()) {
      const userData = toUserProfile(targetUserSnap.data());
      currentBalance = userData.balanceUSD ?? 0;
    }

    if (isConfirmed && lessonCost > 0) {
      if (currentBalance < lessonCost) {
        const errMsg =
          errorMessages?.insufficientFundsMsg ||
          `Недостаточно средств на счету клиента для привязки этого занятия. (Баланс: $${currentBalance}, стоимость: $${lessonCost})`;
        throw new Error(errMsg);
      }
      const updatedTargetBalance = currentBalance - lessonCost;
      if (targetUserSnap.exists()) {
        transaction.update(targetUserRef, { balanceUSD: updatedTargetBalance });
      }
    }

    transaction.update(doc(db, 'bookings', booking.id), {
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
}

export async function addReviewService(
  newReviewInput: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>,
  userProfile: UserProfile,
  existingReviews: Review[],
  booking?: Booking
): Promise<Review> {
  const newReview: Review = {
    id: `rev_${Date.now()}`,
    userId: userProfile.uid,
    userName: userProfile.displayName,
    userAvatar: userProfile.avatarUrl,
    date: new Date().toISOString().split('T')[0],
    ...newReviewInput,
  };
  await setDoc(doc(db, 'reviews', newReview.id), newReview);

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

  const instructorReviews = [newReview, ...existingReviews].filter(
    (review) => review.instructorId === newReview.instructorId
  );
  const averageRating =
    instructorReviews.reduce((sum, review) => sum + review.rating, 0) / instructorReviews.length;
  await updateDoc(doc(db, 'instructors', newReview.instructorId), {
    rating: Number(averageRating.toFixed(1)),
    reviewsCount: instructorReviews.length,
  });

  return newReview;
}

export async function addInstructorService(instructor: Instructor): Promise<void> {
  const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
  await setDoc(doc(db, 'instructors', instructor.id), cleanData);
}

export async function updateInstructorService(
  instructor: Instructor,
  affectedBookings: Booking[]
): Promise<void> {
  const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
  await setDoc(doc(db, 'instructors', instructor.id), cleanData);

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
}

export async function deleteInstructorService(id: string): Promise<void> {
  await deleteDoc(doc(db, 'instructors', id));
}
