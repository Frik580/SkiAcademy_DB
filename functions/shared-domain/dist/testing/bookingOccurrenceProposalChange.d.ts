import { type Booking, type BookingChangeRequest, type BookingProposal } from '../canonical/bookingOccurrenceProposalChange';
export interface CanonicalBookingCollaborationFixtures {
    readonly individualBooking: Booking;
    readonly familyGroupBooking: Booking;
    readonly guestPendingBooking: Booking;
    readonly adminGuestBookedByBooking: Booking;
    readonly openProposal: BookingProposal;
    readonly openChangeRequest: BookingChangeRequest;
}
export declare const canonicalBookingCollaborationFixtures: CanonicalBookingCollaborationFixtures;
