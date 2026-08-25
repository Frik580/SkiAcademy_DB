import type { Booking } from './bookingOccurrenceProposalChange';
import type { CanonicalTimestamp } from './primitives';
export declare const INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS: number;
export type ClientSelfServiceRescheduleTimingDecision = 'allowed' | 'inside_window_rejected' | 'after_start_rejected';
export declare function isRescheduleEligibleBooking(booking: Booking): boolean;
export declare function evaluateClientSelfServiceRescheduleTiming(input: {
    readonly requestAt: CanonicalTimestamp;
    readonly startAt: CanonicalTimestamp;
}): ClientSelfServiceRescheduleTimingDecision;
export declare function isClientSelfServiceRescheduleAllowanceAvailable(booking: Booking): boolean;
export declare function assertClientSelfServiceRescheduleParty(booking: Booking): void;
