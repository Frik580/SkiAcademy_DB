import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { Booking } from '../types';
import {
  BookingSlotOverlapError,
  BookingPaymentResult,
  InsufficientFundsError,
} from './bookingTransactions';
import { functions } from './firebase';

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

const createBookingFn = httpsCallable<CreateBookingCallableInput, CreateBookingCallableResult>(
  functions,
  'createBooking'
);

function toCallableInput(booking: Booking): CreateBookingCallableInput {
  return {
    id: booking.id,
    instructorId: booking.instructorId,
    instructorName: booking.instructorName,
    instructorAvatar: booking.instructorAvatar,
    date: booking.date,
    time: booking.time,
    durationHours: booking.durationHours,
    status: booking.status,
    difficulty: booking.difficulty,
    ...(booking.notes ? { notes: booking.notes } : {}),
  };
}

function mapCallableError(error: unknown): never {
  if (error instanceof FirebaseError) {
    if (error.code === 'functions/failed-precondition') {
      throw new InsufficientFundsError();
    }
    if (error.code === 'functions/aborted') {
      throw new BookingSlotOverlapError();
    }
  }
  throw error;
}

export async function createBookingViaCallable(booking: Booking): Promise<BookingPaymentResult> {
  try {
    const { data } = await createBookingFn(toCallableInput(booking));
    return {
      totalPrice: data.totalPrice,
      newBalance: data.newBalance,
    };
  } catch (error) {
    mapCallableError(error);
  }
}
