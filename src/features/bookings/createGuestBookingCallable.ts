import { Booking } from '../../types';
import { BookingIdConflictError, BookingSlotOverlapError } from './bookingTransactions';
import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface CreateGuestBookingCallableInput {
  id?: string;
  userId?: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar?: string;
  date: string;
  time: string;
  durationHours: number;
  status?: Booking['status'];
  difficulty: Booking['difficulty'];
  notes?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestNotes?: string;
}

export interface CreateGuestBookingCallableResult {
  bookingId: string;
}

function mapGuestBookingError(error: unknown): never {
  const normalizedError = toFunctionsClientError(error);
  if (normalizedError.code === 'functions/aborted') {
    throw new BookingSlotOverlapError();
  }
  if (normalizedError.code === 'functions/already-exists') {
    throw new BookingIdConflictError();
  }
  if (normalizedError.message) {
    throw new Error(normalizedError.message);
  }
  throw normalizedError;
}

export async function createGuestBookingViaCallable(
  booking: Booking
): Promise<{ bookingId: string }> {
  try {
    return await callFunction<CreateGuestBookingCallableInput, CreateGuestBookingCallableResult>(
      'createGuestBooking',
      {
        id: booking.id,
        userId: booking.userId,
        instructorId: booking.instructorId,
        instructorName: booking.instructorName,
        instructorAvatar: booking.instructorAvatar || '',
        date: booking.date,
        time: booking.time,
        durationHours: booking.durationHours,
        status: booking.status,
        difficulty: booking.difficulty,
        ...(booking.notes ? { notes: booking.notes } : {}),
        ...(booking.guestName ? { guestName: booking.guestName } : {}),
        ...(booking.guestPhone ? { guestPhone: booking.guestPhone } : {}),
        ...(booking.guestEmail ? { guestEmail: booking.guestEmail } : {}),
      },
      { idempotencyKey: `guest_${booking.id}` }
    );
  } catch (error) {
    mapGuestBookingError(error);
  }
}
