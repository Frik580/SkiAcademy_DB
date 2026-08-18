import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

type CancelBookingCallableInput = { bookingId: string; refundAmount?: number };
type CancelBookingCallableResult = { refunded: number; alreadyCancelled: boolean };

export async function cancelBookingViaCallable(
  bookingId: string,
  refundAmount?: number
): Promise<CancelBookingCallableResult> {
  try {
    return await callFunction<CancelBookingCallableInput, CancelBookingCallableResult>(
      'cancelBooking',
      { bookingId, ...(refundAmount !== undefined ? { refundAmount } : {}) },
      { idempotencyKey: `cancel_${bookingId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
