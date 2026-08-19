import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface CompleteBookingCallableInput {
  bookingId: string;
}

export interface CompleteBookingCallableResult {
  bookingId: string;
  status: 'completed';
}

export async function completeBookingViaCallable(
  bookingId: string
): Promise<CompleteBookingCallableResult> {
  try {
    return await callFunction<CompleteBookingCallableInput, CompleteBookingCallableResult>(
      'completeBooking',
      { bookingId },
      { idempotencyKey: `complete_${bookingId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
