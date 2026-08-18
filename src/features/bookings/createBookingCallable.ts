import { Booking } from '../../types';
import {
  BookingSlotOverlapError,
  BookingPaymentResult,
  InsufficientFundsError,
} from './bookingTransactions';
import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface CreateBookingCallableInput {
  id: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  status: Booking['status'];
  difficulty: Booking['difficulty'];
  notes?: string;
}

export interface CreateBookingCallableResult {
  bookingId: string;
  totalPrice: number;
  newBalance: number;
}

function toCallableInput(booking: Booking): CreateBookingCallableInput {
  return {
    id: booking.id,
    instructorId: booking.instructorId,
    instructorName: booking.instructorName,
    instructorAvatar: booking.instructorAvatar || '',
    date: booking.date,
    time: booking.time,
    durationHours: booking.durationHours,
    status: booking.status,
    difficulty: booking.difficulty,
    ...(booking.notes ? { notes: booking.notes } : {}),
  };
}

function mapCallableError(error: unknown): never {
  const normalizedError = toFunctionsClientError(error);
  if (normalizedError.code === 'functions/failed-precondition') {
    throw new InsufficientFundsError();
  }
  if (normalizedError.code === 'functions/aborted') {
    throw new BookingSlotOverlapError();
  }
  if (normalizedError.code === 'functions/not-found') {
    throw new Error('Instructor does not exist.');
  }
  if (normalizedError.code === 'functions/invalid-argument' && normalizedError.message) {
    throw new Error(normalizedError.message);
  }
  throw normalizedError;
}

export async function createBookingViaCallable(booking: Booking): Promise<BookingPaymentResult> {
  try {
    const data = await callFunction<CreateBookingCallableInput, CreateBookingCallableResult>(
      'createBooking',
      toCallableInput(booking),
      { idempotencyKey: booking.id }
    );
    return {
      totalPrice: data.totalPrice,
      newBalance: data.newBalance,
    };
  } catch (error) {
    mapCallableError(error);
  }
}
