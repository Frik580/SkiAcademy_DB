"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOKING_PROPOSAL_TTL_MS = void 0;
exports.resolveBookingProposalExpiresAt = resolveBookingProposalExpiresAt;
exports.isBookingProposalExpired = isBookingProposalExpired;
exports.isBookingProposalAcceptanceAllowedBeforeStart = isBookingProposalAcceptanceAllowedBeforeStart;
exports.isTerminalBookingProposalStatus = isTerminalBookingProposalStatus;
const guestBooking_1 = require("./guestBooking");
const primitives_1 = require("./primitives");
/** Maximum hold before an open BookingProposal expires. */
exports.BOOKING_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;
function resolveBookingProposalExpiresAt(input) {
    const ttlExpiresAt = (0, guestBooking_1.addMillisecondsToCanonicalTimestamp)(input.createdAt, exports.BOOKING_PROPOSAL_TTL_MS);
    return (0, guestBooking_1.minCanonicalTimestamp)(ttlExpiresAt, input.serviceStartsAt);
}
function isBookingProposalExpired(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.expiresAt) >= 0;
}
function isBookingProposalAcceptanceAllowedBeforeStart(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.serviceStartsAt) < 0;
}
function isTerminalBookingProposalStatus(status) {
    return status !== 'open';
}
