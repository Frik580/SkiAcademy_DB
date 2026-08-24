"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalBookingCollaborationFixtures = void 0;
const bookingOccurrenceProposalChange_1 = require("../canonical/bookingOccurrenceProposalChange");
const identifiers_1 = require("../canonical/identifiers");
const primitives_1 = require("../canonical/primitives");
const primitives_2 = require("./primitives");
const createdAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T00:00:00.000Z'));
const reservationExpiresAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T01:00:00.000Z'));
const metadata = {
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
        createdByCommandId: 'command_booking_fixture_create',
        lastChangedByCommandId: 'command_booking_fixture_create',
        correlationId: 'correlation_booking_fixture_create',
    },
};
const payerAccountId = identifiers_1.AccountIdSchema.parse('account_booking_payer_fixture');
const secondParticipantId = identifiers_1.ParticipantIdSchema.parse('participant_booking_fixture_02');
const thirdParticipantId = identifiers_1.ParticipantIdSchema.parse('participant_booking_fixture_03');
function occurrenceFor(participantIds) {
    return {
        occurrenceId: 'occurrence_booking_fixture_01',
        instructorId: primitives_2.canonicalPrimitiveFixtures.instructorId,
        interval: primitives_2.canonicalPrimitiveFixtures.interval,
        timeZone: primitives_2.canonicalPrimitiveFixtures.timeZone,
        scheduleRevision: 1,
        serviceParty: {
            participantIds: [...participantIds],
            frozenAt: createdAt,
        },
    };
}
const individualBooking = bookingOccurrenceProposalChange_1.BookingSchema.parse({
    bookingId: primitives_2.canonicalPrimitiveFixtures.bookingId,
    attribution: {
        bookingOrigin: 'account',
        bookedBy: (0, identifiers_1.accountActorRef)(primitives_2.canonicalPrimitiveFixtures.accountId),
    },
    party: {
        kind: 'individual',
        participantIds: [primitives_2.canonicalPrimitiveFixtures.participantId],
    },
    occurrence: occurrenceFor([primitives_2.canonicalPrimitiveFixtures.participantId]),
    lifecycle: { status: 'confirmed' },
    paymentId: primitives_2.canonicalPrimitiveFixtures.paymentId,
    payerAccountId,
    ...metadata,
});
const familyGroupBooking = bookingOccurrenceProposalChange_1.BookingSchema.parse({
    bookingId: 'booking_family_fixture_01',
    attribution: {
        bookingOrigin: 'account',
        bookedBy: (0, identifiers_1.accountActorRef)(primitives_2.canonicalPrimitiveFixtures.accountId),
    },
    party: {
        kind: 'family_group',
        participantIds: [
            primitives_2.canonicalPrimitiveFixtures.participantId,
            secondParticipantId,
            thirdParticipantId,
        ],
    },
    occurrence: occurrenceFor([
        primitives_2.canonicalPrimitiveFixtures.participantId,
        secondParticipantId,
        thirdParticipantId,
    ]),
    lifecycle: { status: 'confirmed' },
    paymentId: 'payment_family_fixture_01',
    payerAccountId,
    ...metadata,
});
const guestPendingBooking = bookingOccurrenceProposalChange_1.BookingSchema.parse({
    bookingId: 'booking_guest_fixture_01',
    attribution: {
        bookingOrigin: 'guest',
        bookedBy: (0, identifiers_1.guestActorRef)(primitives_2.canonicalPrimitiveFixtures.guestSubjectId),
    },
    party: {
        kind: 'individual',
        participantIds: [primitives_2.canonicalPrimitiveFixtures.participantId],
    },
    occurrence: occurrenceFor([primitives_2.canonicalPrimitiveFixtures.participantId]),
    lifecycle: { status: 'pending', reservationExpiresAt },
    paymentId: 'payment_guest_fixture_01',
    ...metadata,
});
const adminGuestBookedByBooking = bookingOccurrenceProposalChange_1.BookingSchema.parse({
    bookingId: 'booking_admin_guest_fixture_01',
    attribution: {
        bookingOrigin: 'admin',
        bookedBy: (0, identifiers_1.guestActorRef)(primitives_2.canonicalPrimitiveFixtures.guestSubjectId),
    },
    party: {
        kind: 'individual',
        participantIds: [primitives_2.canonicalPrimitiveFixtures.participantId],
    },
    occurrence: occurrenceFor([primitives_2.canonicalPrimitiveFixtures.participantId]),
    lifecycle: { status: 'confirmed' },
    paymentId: 'payment_admin_guest_fixture_01',
    ...metadata,
});
const openProposal = bookingOccurrenceProposalChange_1.BookingProposalSchema.parse({
    proposalId: 'proposal_fixture_01',
    participantId: primitives_2.canonicalPrimitiveFixtures.participantId,
    instructorId: primitives_2.canonicalPrimitiveFixtures.instructorId,
    proposedService: {
        interval: primitives_2.canonicalPrimitiveFixtures.interval,
        timeZone: primitives_2.canonicalPrimitiveFixtures.timeZone,
    },
    lifecycle: { status: 'open' },
    ...metadata,
});
const openChangeRequest = bookingOccurrenceProposalChange_1.BookingChangeRequestSchema.parse({
    requestId: 'change_request_fixture_01',
    bookingId: individualBooking.bookingId,
    requestType: 'instructor_unavailable',
    reason: 'Instructor cannot deliver the confirmed occurrence.',
    lifecycle: { status: 'open' },
    ...metadata,
});
exports.canonicalBookingCollaborationFixtures = Object.freeze({
    individualBooking,
    familyGroupBooking,
    guestPendingBooking,
    adminGuestBookedByBooking,
    openProposal,
    openChangeRequest,
});
