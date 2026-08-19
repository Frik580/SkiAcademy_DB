import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface ConfirmBookingCallableInput {
  bookingId: string;
}

export interface ConfirmBookingCallableResult {
  bookingId: string;
  status: 'confirmed';
}

export async function confirmBookingViaCallable(bookingId: string): Promise<void> {
  try {
    await callFunction<ConfirmBookingCallableInput, ConfirmBookingCallableResult>(
      'confirmBooking',
      { bookingId },
      { idempotencyKey: `confirm_${bookingId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
