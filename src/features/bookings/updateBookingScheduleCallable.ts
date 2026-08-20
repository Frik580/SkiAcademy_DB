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
  allowNegativeBalance?: boolean;
}

export interface UpdateBookingScheduleCallableResult {
  success: boolean;
  bookingId: string;
}

function readInsufficientFundsDetails(error: unknown): {
  currentBalance?: number;
  required?: number;
} {
  if (!error || typeof error !== 'object') return {};
  const withDetails = error as { details?: unknown; cause?: unknown };
  const details =
    withDetails.details && typeof withDetails.details === 'object'
      ? (withDetails.details as Record<string, unknown>)
      : withDetails.cause &&
          typeof withDetails.cause === 'object' &&
          withDetails.cause !== null &&
          'details' in withDetails.cause &&
          typeof (withDetails.cause as { details?: unknown }).details === 'object'
        ? (withDetails.cause as { details: Record<string, unknown> }).details
        : null;
  if (!details) return {};
  return {
    currentBalance: typeof details.currentBalance === 'number' ? details.currentBalance : undefined,
    required: typeof details.required === 'number' ? details.required : undefined,
  };
}

function mapUpdateScheduleError(error: unknown): never {
  const normalizedError = toFunctionsClientError(error);
  if (normalizedError.code === 'functions/aborted') {
    throw new BookingSlotOverlapError();
  }
  if (normalizedError.code === 'functions/failed-precondition') {
    if (normalizedError.message?.toLowerCase().includes('insufficient')) {
      const { currentBalance, required } = readInsufficientFundsDetails(normalizedError);
      throw new InsufficientFundsError(currentBalance, required);
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
        allowNegativeBalance: updates.allowNegativeBalance,
      },
      {
        idempotencyKey: `resched_${bookingId}_${updates.date || ''}_${updates.time || ''}_${
          updates.instructorId || ''
        }_${updates.allowNegativeBalance ? 'neg' : 'bal'}`,
      }
    );
  } catch (error) {
    mapUpdateScheduleError(error);
  }
}
