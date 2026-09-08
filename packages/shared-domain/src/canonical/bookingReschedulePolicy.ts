import type { Booking } from './bookingOccurrenceProposalChange';
import {
  canonicalTimestampToEpochMs,
  isConfirmedBooking,
  isPendingCancellationBooking,
  isTerminalBookingLifecycle,
} from './bookingCancellationPolicy';
import type { CanonicalTimestamp } from './primitives';
import { compareCanonicalTimestamps } from './primitives';

export const INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ClientSelfServiceRescheduleTimingDecision =
  'allowed' | 'inside_window_rejected' | 'after_start_rejected';

export function isRescheduleEligibleBooking(booking: Booking): boolean {
  if (isTerminalBookingLifecycle(booking)) {
    return false;
  }
  if (isPendingCancellationBooking(booking)) {
    return false;
  }
  return booking.lifecycle.status === 'confirmed';
}

export function evaluateClientSelfServiceRescheduleTiming(input: {
  readonly requestAt: CanonicalTimestamp;
  readonly startAt: CanonicalTimestamp;
}): ClientSelfServiceRescheduleTimingDecision {
  if (compareCanonicalTimestamps(input.requestAt, input.startAt) >= 0) {
    return 'after_start_rejected';
  }
  const timeUntilStartMs =
    canonicalTimestampToEpochMs(input.startAt) - canonicalTimestampToEpochMs(input.requestAt);
  return timeUntilStartMs >= INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
    ? 'allowed'
    : 'inside_window_rejected';
}

export function isClientSelfServiceRescheduleAllowanceAvailable(booking: Booking): boolean {
  return booking.clientSelfServiceRescheduleConsumedAt === undefined;
}

export function assertClientSelfServiceRescheduleParty(booking: Booking): void {
  if (!isConfirmedBooking(booking)) {
    throw new Error('Client self-service reschedule requires a confirmed lesson booking');
  }
}
