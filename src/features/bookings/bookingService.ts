import {
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  OperationType,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  handleFirestoreError,
} from '../../infrastructure/firebase';
import { AVAILABILITY_SLOTS_COLLECTION } from '../../domain/availability';
import { createBookingViaCallable } from '../../features/bookings/createBookingCallable';
import { cancelBookingViaCallable } from '../../features/bookings/cancelBookingCallable';
import { addBookingViaCallable } from '../../features/bookings/addBookingCallable';
import { createGuestBookingViaCallable } from '../../features/bookings/createGuestBookingCallable';
import { updateBookingScheduleViaCallable } from '../../features/bookings/updateBookingScheduleCallable';
import { linkGuestBookingViaCallable } from '../../features/bookings/linkGuestBookingCallable';
import { completeBookingViaCallable } from '../../features/bookings/completeBookingCallable';
import { confirmBookingViaCallable } from '../../features/bookings/confirmBookingCallable';
import { deleteBookingViaCallable } from '../../features/bookings/deleteBookingCallable';
import { requestBookingCancellationViaCallable } from '../../features/bookings/requestBookingCancellationCallable';
import {
  BookingIdConflictError,
  BookingSlotOverlapError,
  InsufficientFundsError,
  type BookingPaymentResult,
} from '../../features/bookings/bookingTransactions';
import { activityLogId, logActivityForUser } from '../../domain/activity';
import { stripUndefinedFields } from '../../domain/course';
import { Booking, Instructor, LessonRecommendation, Review, UserProfile } from '../../types';
import type { AvailabilitySlot } from '../../types';

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
import { logger } from '../../shared';
import {
  sanitizeRecommendations,
  toggleCompletedRecommendationIds,
} from '../../features/student-cabinet/lessonRecommendations';

export { BookingIdConflictError, BookingSlotOverlapError, InsufficientFundsError };
export type { BookingPaymentResult };

export async function createBookingForUser(booking: Booking): Promise<BookingPaymentResult> {
  return createBookingViaCallable(booking);
}

export async function createGuestBookingService(booking: Booking): Promise<void> {
  await createGuestBookingViaCallable(booking);
}

export async function rescheduleBookingService(
  id: string,
  newDate: string,
  newTime: string
): Promise<void> {
  try {
    await updateBookingScheduleViaCallable(id, { date: newDate, time: newTime });
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
  newTime?: string,
  options?: { allowNegativeBalance?: boolean }
): Promise<void> {
  try {
    await updateBookingScheduleViaCallable(id, {
      instructorId: newInstructor.id,
      instructorName: newInstructor.name,
      instructorAvatar: newInstructor.avatarUrl,
      date: newDate,
      time: newTime,
      allowNegativeBalance: options?.allowNegativeBalance,
    });
  } catch (error) {
    if (!(error instanceof BookingSlotOverlapError) && !(error instanceof InsufficientFundsError)) {
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
    return await cancelBookingViaCallable(id, refundAmount);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/cancel`);
    throw error;
  }
}

export async function requestBookingCancellation(id: string, reason?: string): Promise<void> {
  await requestBookingCancellationViaCallable(id, reason);
}

export async function addBookingDirect(booking: Booking): Promise<void> {
  try {
    await addBookingViaCallable(booking);
  } catch (error) {
    if (!(error instanceof InsufficientFundsError) && !(error instanceof BookingSlotOverlapError)) {
      handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/add`);
    }
    throw error;
  }
}

export async function deleteBookingService(
  booking: Booking
): Promise<{ isDeletedDoc: boolean; newStats?: { revenue: number; count: number } }> {
  try {
    const result = await deleteBookingViaCallable(booking.id);
    return {
      isDeletedDoc: result.isDeletedDoc,
      ...(result.newStats ? { newStats: result.newStats } : {}),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${booking.id}/delete`);
    throw error;
  }
}

export async function confirmBookingService(id: string): Promise<void> {
  try {
    await confirmBookingViaCallable(id);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${id}/confirm`);
    throw error;
  }
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
  _actorUid?: string
): Promise<Booking | null> {
  await completeBookingViaCallable(id);
  const snap = await getDoc(doc(db, 'bookings', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Booking;
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
  try {
    await linkGuestBookingViaCallable(booking.id, targetUserId);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'functions/failed-precondition' && errorMessages?.insufficientFundsMsg) {
      throw new Error(errorMessages.insufficientFundsMsg);
    }
    throw error;
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
