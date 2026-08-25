import {
  addMillisecondsToCanonicalTimestamp,
  minCanonicalTimestamp,
} from './guestBooking';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';
import type { BookingProposalStatus } from './bookingOccurrenceProposalChange';

/** Maximum hold before an open BookingProposal expires. */
export const BOOKING_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;

export function resolveBookingProposalExpiresAt(input: {
  readonly createdAt: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp {
  const ttlExpiresAt = addMillisecondsToCanonicalTimestamp(
    input.createdAt,
    BOOKING_PROPOSAL_TTL_MS
  );
  return minCanonicalTimestamp(ttlExpiresAt, input.serviceStartsAt);
}

export function isBookingProposalExpired(input: {
  readonly now: CanonicalTimestamp;
  readonly expiresAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.expiresAt) >= 0;
}

export function isBookingProposalAcceptanceAllowedBeforeStart(input: {
  readonly now: CanonicalTimestamp;
  readonly serviceStartsAt: CanonicalTimestamp;
}): boolean {
  return compareCanonicalTimestamps(input.now, input.serviceStartsAt) < 0;
}

export function isTerminalBookingProposalStatus(status: BookingProposalStatus): boolean {
  return status !== 'open';
}
