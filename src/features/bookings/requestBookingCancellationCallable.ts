import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface RequestBookingCancellationCallableInput {
  bookingId: string;
  reason?: string;
}

export interface RequestBookingCancellationCallableResult {
  bookingId: string;
  status: 'pending_cancellation';
}

export async function requestBookingCancellationViaCallable(
  bookingId: string,
  reason?: string
): Promise<void> {
  try {
    await callFunction<
      RequestBookingCancellationCallableInput,
      RequestBookingCancellationCallableResult
    >(
      'requestBookingCancellation',
      { bookingId, ...(reason !== undefined ? { reason } : {}) },
      { idempotencyKey: `request_cancel_${bookingId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
