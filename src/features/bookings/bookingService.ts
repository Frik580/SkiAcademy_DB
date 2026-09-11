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
import { stripUndefinedFields } from '../../domain/course';
import { Booking, Instructor } from '../../types';
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

export async function completeBookingService(
  id: string,
  _actorUid?: string
): Promise<Booking | null> {
  await completeBookingViaCallable(id);
  const snap = await getDoc(doc(db, 'bookings', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Booking;
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

export async function addInstructorService(instructor: Instructor): Promise<void> {
  const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
  delete cleanData.rating;
  delete cleanData.reviewsCount;
  delete cleanData.ratingCounts;
  await setDoc(doc(db, 'instructors', instructor.id), cleanData);
}

export async function updateInstructorService(
  instructor: Instructor,
  affectedBookings: Booking[]
): Promise<void> {
  const cleanData = stripUndefinedFields(instructor as unknown as Record<string, unknown>);
  delete cleanData.rating;
  delete cleanData.reviewsCount;
  delete cleanData.ratingCounts;
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
