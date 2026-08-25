"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTerminalBookingChangeRequestStatus = isTerminalBookingChangeRequestStatus;
exports.resolveRequiresBookingMutation = resolveRequiresBookingMutation;
function isTerminalBookingChangeRequestStatus(status) {
    return status !== 'open';
}
function resolveRequiresBookingMutation(resolution) {
    return resolution === 'rescheduled' || resolution === 'booking_cancelled';
}
