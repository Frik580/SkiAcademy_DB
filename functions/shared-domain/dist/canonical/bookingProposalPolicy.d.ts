import { type CanonicalTimestamp } from './primitives';
import type { BookingProposalStatus } from './bookingOccurrenceProposalChange';
/** Maximum hold before an open BookingProposal expires. */
export declare const BOOKING_PROPOSAL_TTL_MS: number;
export declare function resolveBookingProposalExpiresAt(input: {
    readonly createdAt: CanonicalTimestamp;
    readonly serviceStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp;
export declare function isBookingProposalExpired(input: {
    readonly now: CanonicalTimestamp;
    readonly expiresAt: CanonicalTimestamp;
}): boolean;
export declare function isBookingProposalAcceptanceAllowedBeforeStart(input: {
    readonly now: CanonicalTimestamp;
    readonly serviceStartsAt: CanonicalTimestamp;
}): boolean;
export declare function isTerminalBookingProposalStatus(status: BookingProposalStatus): boolean;
