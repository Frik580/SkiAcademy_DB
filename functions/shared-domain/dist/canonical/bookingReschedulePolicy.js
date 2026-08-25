"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS = void 0;
exports.isRescheduleEligibleBooking = isRescheduleEligibleBooking;
exports.evaluateClientSelfServiceRescheduleTiming = evaluateClientSelfServiceRescheduleTiming;
exports.isClientSelfServiceRescheduleAllowanceAvailable = isClientSelfServiceRescheduleAllowanceAvailable;
exports.assertClientSelfServiceRescheduleParty = assertClientSelfServiceRescheduleParty;
const bookingCancellationPolicy_1 = require("./bookingCancellationPolicy");
const primitives_1 = require("./primitives");
exports.INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS = 24 * 60 * 60 * 1000;
function isRescheduleEligibleBooking(booking) {
    if (booking.party.kind !== 'individual') {
        return false;
    }
    if ((0, bookingCancellationPolicy_1.isTerminalBookingLifecycle)(booking)) {
        return false;
    }
    if ((0, bookingCancellationPolicy_1.isPendingCancellationIndividualBooking)(booking)) {
        return false;
    }
    return booking.lifecycle.status === 'confirmed';
}
function evaluateClientSelfServiceRescheduleTiming(input) {
    if ((0, primitives_1.compareCanonicalTimestamps)(input.requestAt, input.startAt) >= 0) {
        return 'after_start_rejected';
    }
    const timeUntilStartMs = (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.startAt) - (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.requestAt);
    return timeUntilStartMs >= exports.INDIVIDUAL_BOOKING_CLIENT_RESCHEDULE_WINDOW_MS
        ? 'allowed'
        : 'inside_window_rejected';
}
function isClientSelfServiceRescheduleAllowanceAvailable(booking) {
    return booking.clientSelfServiceRescheduleConsumedAt === undefined;
}
function assertClientSelfServiceRescheduleParty(booking) {
    if (!(0, bookingCancellationPolicy_1.isConfirmedIndividualBooking)(booking)) {
        throw new Error('Client self-service reschedule requires a confirmed individual booking');
    }
}
