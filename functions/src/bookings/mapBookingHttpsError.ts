import { HttpsError } from 'firebase-functions/v2/https';
import { BookingIdConflictError, BookingSlotOverlapError } from '@ski-academy/shared-domain';
import { InsufficientFundsError } from './bookingLogic';

type KnownBookingError = {
  message: string;
  code: ConstructorParameters<typeof HttpsError>[0];
  publicMessage: string;
};

const KNOWN_BOOKING_ERRORS: KnownBookingError[] = [
  {
    message: 'Instructor does not exist.',
    code: 'not-found',
    publicMessage: 'Instructor does not exist.',
  },
  {
    message: 'User profile does not exist.',
    code: 'not-found',
    publicMessage: 'User profile does not exist.',
  },
  {
    message: 'Course does not exist.',
    code: 'not-found',
    publicMessage: 'Course does not exist.',
  },
  {
    message: 'Booking does not exist.',
    code: 'not-found',
    publicMessage: 'Booking does not exist.',
  },
  {
    message: 'Guest bookings must use a guest user id.',
    code: 'invalid-argument',
    publicMessage: 'Guest bookings must use a guest user id.',
  },
  {
    message: 'Course bookings cannot be rescheduled.',
    code: 'failed-precondition',
    publicMessage: 'Course bookings cannot be rescheduled.',
  },
  {
    message: 'Cancelled or completed bookings cannot be rescheduled.',
    code: 'failed-precondition',
    publicMessage: 'Cancelled or completed bookings cannot be rescheduled.',
  },
  {
    message: 'Cancelled or completed bookings cannot be confirmed.',
    code: 'failed-precondition',
    publicMessage: 'Cancelled or completed bookings cannot be confirmed.',
  },
  {
    message: 'Only pending or confirmed bookings can request cancellation.',
    code: 'failed-precondition',
    publicMessage: 'Only pending or confirmed bookings can request cancellation.',
  },
];

export type MapBookingHttpsErrorOptions = {
  insufficientFundsMessage?: string;
  overlapMessage?: string;
};

export function rethrowAsHttpsError(
  error: unknown,
  fallbackMessage: string,
  options: MapBookingHttpsErrorOptions = {}
): never {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof InsufficientFundsError) {
    throw new HttpsError(
      'failed-precondition',
      options.insufficientFundsMessage ?? 'Insufficient funds.',
      {
        code: 'INSUFFICIENT_FUNDS',
        currentBalance: error.currentBalance,
        required: error.required,
      }
    );
  }
  if (error instanceof BookingSlotOverlapError) {
    throw new HttpsError(
      'aborted',
      options.overlapMessage ?? 'Instructor slot is no longer available.'
    );
  }
  if (error instanceof BookingIdConflictError) {
    throw new HttpsError('already-exists', 'A booking with this ID already exists.');
  }
  if (error instanceof Error) {
    const mapped = KNOWN_BOOKING_ERRORS.find((entry) => entry.message === error.message);
    if (mapped) {
      throw new HttpsError(mapped.code, mapped.publicMessage);
    }
  }
  console.error(fallbackMessage, error);
  throw new HttpsError('internal', fallbackMessage);
}
