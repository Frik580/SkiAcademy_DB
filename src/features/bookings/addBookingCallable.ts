import { Booking } from '../../types';
import {
  BookingIdConflictError,
  BookingPaymentResult,
  BookingSlotOverlapError,
  InsufficientFundsError,
} from './bookingTransactions';
import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface AddBookingCallableInput {
  userId: string;
  booking: {
    id: string;
    instructorId: string;
    instructorName: string;
    instructorAvatar?: string;
    date: string;
    time: string;
    durationHours: number;
    status: Booking['status'];
    difficulty: Booking['difficulty'];
    notes?: string;
    totalPrice?: number;
    isGuest?: boolean;
    guestName?: string;
    guestPhone?: string;
    guestEmail?: string;
    guestNotes?: string;
  };
}

export interface AddBookingCallableResult {
  bookingId: string;
  totalPrice: number;
  newBalance: number;
}

function mapAddBookingError(error: unknown): never {
  const normalizedError = toFunctionsClientError(error);
  if (normalizedError.code === 'functions/failed-precondition') {
    throw new InsufficientFundsError();
  }
  if (normalizedError.code === 'functions/aborted') {
    throw new BookingSlotOverlapError();
  }
  if (normalizedError.code === 'functions/already-exists') {
    throw new BookingIdConflictError();
  }
  if (normalizedError.code === 'functions/permission-denied') {
    throw new Error('Only administrators can add bookings.');
  }
  if (normalizedError.message) {
    throw new Error(normalizedError.message);
  }
  throw normalizedError;
}

export async function addBookingViaCallable(
  booking: Booking,
  targetUserId?: string
): Promise<BookingPaymentResult> {
  const userId = targetUserId || booking.userId;
  try {
    const result = await callFunction<AddBookingCallableInput, AddBookingCallableResult>(
      'addBooking',
      {
        userId,
        booking: {
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
          ...(typeof booking.totalPrice === 'number' ? { totalPrice: booking.totalPrice } : {}),
          ...(typeof booking.isGuest === 'boolean' ? { isGuest: booking.isGuest } : {}),
          ...(booking.guestName ? { guestName: booking.guestName } : {}),
          ...(booking.guestPhone ? { guestPhone: booking.guestPhone } : {}),
          ...(booking.guestEmail ? { guestEmail: booking.guestEmail } : {}),
        },
      },
      { idempotencyKey: `add_${booking.id}` }
    );
    return {
      newBalance: result.newBalance,
      totalPrice: result.totalPrice,
    };
  } catch (error) {
    mapAddBookingError(error);
  }
}
