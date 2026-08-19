import {
  BookingScheduleUpdates,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from './bookingTransactions';
import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface UpdateBookingScheduleCallableInput {
  bookingId: string;
  date?: string;
  time?: string;
  instructorId?: string;
}

export interface UpdateBookingScheduleCallableResult {
  success: boolean;
  bookingId: string;
}

function mapUpdateScheduleError(error: unknown): never {
  const normalizedError = toFunctionsClientError(error);
  if (normalizedError.code === 'functions/aborted') {
    throw new BookingSlotOverlapError();
  }
  if (normalizedError.code === 'functions/failed-precondition') {
    if (normalizedError.message?.toLowerCase().includes('insufficient')) {
      throw new InsufficientFundsError();
    }
    throw new Error(normalizedError.message || 'Unable to update booking schedule.');
  }
  if (normalizedError.code === 'functions/not-found') {
    throw new Error('Booking does not exist.');
  }
  if (normalizedError.code === 'functions/invalid-argument' && normalizedError.message) {
    throw new Error(normalizedError.message);
  }
  if (normalizedError.message) {
    throw new Error(normalizedError.message);
  }
  throw normalizedError;
}

export async function updateBookingScheduleViaCallable(
  bookingId: string,
  updates: BookingScheduleUpdates
): Promise<void> {
  try {
    await callFunction<UpdateBookingScheduleCallableInput, UpdateBookingScheduleCallableResult>(
      'updateBookingSchedule',
      {
        bookingId,
        date: updates.date,
        time: updates.time,
        instructorId: updates.instructorId,
      },
      {
        idempotencyKey: `resched_${bookingId}_${updates.date || ''}_${updates.time || ''}_${
          updates.instructorId || ''
        }`,
      }
    );
  } catch (error) {
    mapUpdateScheduleError(error);
  }
}
