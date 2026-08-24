"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalDeterministicHash = canonicalDeterministicHash;
exports.activityLogIdFromCommandId = activityLogIdFromCommandId;
exports.domainOutboxIdFromCommand = domainOutboxIdFromCommand;
exports.monetaryEventIdFromCommandEffect = monetaryEventIdFromCommandEffect;
exports.participantBlockIdFromDirection = participantBlockIdFromDirection;
exports.instructorRelationshipIdFromPair = instructorRelationshipIdFromPair;
exports.paymentIdFromBookingId = paymentIdFromBookingId;
exports.initialBookingOccurrenceIdFromBookingId = initialBookingOccurrenceIdFromBookingId;
exports.validateDeterministicIdentityInputs = validateDeterministicIdentityInputs;
const sha256Hex_1 = require("./sha256Hex");
const identifiers_1 = require("./identifiers");
const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';
function canonicalDeterministicHash(parts) {
    const payload = parts.join(DETERMINISTIC_ID_PART_SEPARATOR);
    return (0, sha256Hex_1.sha256Hex)(payload);
}
function activityLogIdFromCommandId(commandId) {
    return identifiers_1.ActivityLogIdSchema.parse(canonicalDeterministicHash(['audit:v1', commandId]));
}
function domainOutboxIdFromCommand(commandId, deliveryEffectOrdinal) {
    return identifiers_1.DomainOutboxIdSchema.parse(canonicalDeterministicHash(['outbox:v1', commandId, String(deliveryEffectOrdinal)]));
}
function monetaryEventIdFromCommandEffect(commandId, effectOrdinal) {
    return identifiers_1.MonetaryEventIdSchema.parse(canonicalDeterministicHash(['monetary:v1', commandId, String(effectOrdinal)]));
}
function participantBlockIdFromDirection(input) {
    return identifiers_1.ParticipantBlockIdSchema.parse(canonicalDeterministicHash([
        'participant_block:v1',
        input.createdByKind,
        input.participantId,
        input.instructorId,
    ]));
}
function instructorRelationshipIdFromPair(input) {
    return identifiers_1.InstructorRelationshipIdSchema.parse(canonicalDeterministicHash([
        'instructor_relationship:v1',
        input.participantId,
        input.instructorId,
    ]));
}
function paymentIdFromBookingId(bookingId) {
    return identifiers_1.PaymentIdSchema.parse(canonicalDeterministicHash(['payment:v1', 'booking', bookingId]));
}
function initialBookingOccurrenceIdFromBookingId(bookingId) {
    return identifiers_1.OccurrenceIdSchema.parse(canonicalDeterministicHash(['occurrence:v1', 'booking', bookingId, '1']));
}
const PERSONAL_DATA_PATTERNS = [
    /@/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b\+?\d[\d\s().-]{7,}\d\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
];
function validateDeterministicIdentityInputs(inputs, context) {
    for (const [key, value] of Object.entries(inputs)) {
        for (const pattern of PERSONAL_DATA_PATTERNS) {
            if (pattern.test(value)) {
                context.addIssue({
                    code: 'custom',
                    path: [key],
                    message: 'Deterministic identity inputs must not contain personal data',
                });
            }
        }
    }
}
