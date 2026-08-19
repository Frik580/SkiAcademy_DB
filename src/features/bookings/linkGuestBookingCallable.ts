import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface LinkGuestBookingCallableInput {
  bookingId: string;
  targetUserId: string;
}

export interface LinkGuestBookingCallableResult {
  newBalance: number;
}

export async function linkGuestBookingViaCallable(
  bookingId: string,
  targetUserId: string
): Promise<LinkGuestBookingCallableResult> {
  try {
    return await callFunction<LinkGuestBookingCallableInput, LinkGuestBookingCallableResult>(
      'linkGuestBooking',
      { bookingId, targetUserId },
      { idempotencyKey: `link_${bookingId}_${targetUserId}` }
    );
  } catch (error) {
    throw toFunctionsClientError(error);
  }
}
