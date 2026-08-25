"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUEST_ACTION_SIGNATURE_TRANSPORT_KEY = exports.GUEST_ACTION_NONCE_TRANSPORT_KEY = exports.GUEST_ACTION_TOKEN_TRANSPORT_KEY = exports.GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS = exports.GUEST_LESSON_RESERVATION_TTL_MS = void 0;
exports.addMillisecondsToCanonicalTimestamp = addMillisecondsToCanonicalTimestamp;
exports.minCanonicalTimestamp = minCanonicalTimestamp;
exports.resolveGuestLessonReservationExpiresAt = resolveGuestLessonReservationExpiresAt;
exports.isGuestReservationExpired = isGuestReservationExpired;
exports.isGuestBookingRequestAllowedBeforeStart = isGuestBookingRequestAllowedBeforeStart;
exports.isGuestBookingConfirmationAllowedBeforeStart = isGuestBookingConfirmationAllowedBeforeStart;
exports.guestBookingCredentialSubjectKey = guestBookingCredentialSubjectKey;
const primitives_1 = require("./primitives");
/** Maximum individual guest lesson reservation hold before service start. */
exports.GUEST_LESSON_RESERVATION_TTL_MS = 60 * 60 * 1_000;
function addMillisecondsToCanonicalTimestamp(timestamp, milliseconds) {
    const instantMs = timestamp.seconds * 1_000 + timestamp.nanoseconds / 1_000_000 + milliseconds;
    return (0, primitives_1.timestampFromDate)(new Date(instantMs));
}
function minCanonicalTimestamp(left, right) {
    return (0, primitives_1.compareCanonicalTimestamps)(left, right) <= 0 ? left : right;
}
function resolveGuestLessonReservationExpiresAt(input) {
    const ttlExpiresAt = addMillisecondsToCanonicalTimestamp(input.createdAt, exports.GUEST_LESSON_RESERVATION_TTL_MS);
    return minCanonicalTimestamp(ttlExpiresAt, input.serviceStartsAt);
}
function isGuestReservationExpired(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.reservationExpiresAt) >= 0;
}
function isGuestBookingRequestAllowedBeforeStart(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.serviceStartsAt) < 0;
}
function isGuestBookingConfirmationAllowedBeforeStart(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.serviceStartsAt) < 0;
}
exports.GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS = {
    displayName: 'participant_display_name',
    skillLevel: 'participant_skill_level',
    discipline: 'participant_discipline',
    ageYears: 'participant_age_years',
};
exports.GUEST_ACTION_TOKEN_TRANSPORT_KEY = 'guest_action_token';
exports.GUEST_ACTION_NONCE_TRANSPORT_KEY = 'guest_action_nonce';
exports.GUEST_ACTION_SIGNATURE_TRANSPORT_KEY = 'guest_action_sig';
function guestBookingCredentialSubjectKey(bookingId) {
    return `guest-booking:${bookingId}`;
}
