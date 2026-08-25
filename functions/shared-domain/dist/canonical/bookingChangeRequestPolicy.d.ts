import type { BookingChangeRequestResolution, BookingChangeRequestStatus } from './bookingOccurrenceProposalChange';
export declare function isTerminalBookingChangeRequestStatus(status: BookingChangeRequestStatus): boolean;
export declare function resolveRequiresBookingMutation(resolution: BookingChangeRequestResolution): boolean;
