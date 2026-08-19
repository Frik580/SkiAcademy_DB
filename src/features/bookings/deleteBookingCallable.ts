import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface DeleteBookingCallableInput {
  bookingId: string;
}

export interface DeleteBookingCallableResult {
  bookingId: string;
  isDeletedDoc: boolean;
  newStats?: { revenue: number; count: number };
}

export async function deleteBookingViaCallable(
  bookingId: string
): Promise<DeleteBookingCallableResult> {
  try {
    return await callFunction<DeleteBookingCallableInput, DeleteBookingCallableResult>(
      'deleteBooking',
      { bookingId },
      { idempotencyKey: `delete_${bookingId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
