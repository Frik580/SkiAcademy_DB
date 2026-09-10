import type { AccountReviewBookingState, BookingId } from '@ski-academy/shared-domain';

export function mergeAccountReviewBookingStates(
  previous: readonly AccountReviewBookingState[],
  incoming: readonly AccountReviewBookingState[],
  requestedBookingIds: readonly BookingId[]
): AccountReviewBookingState[] {
  const merged = new Map(previous.map((state) => [state.bookingId, state]));
  const incomingById = new Map(incoming.map((state) => [state.bookingId, state]));
  for (const bookingId of requestedBookingIds) {
    const next = incomingById.get(bookingId);
    if (next) {
      merged.set(bookingId, next);
    }
  }
  return [...merged.values()];
}
