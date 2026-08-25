"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalDeterministicHash = canonicalDeterministicHash;
exports.activityLogIdFromCommandId = activityLogIdFromCommandId;
exports.domainOutboxIdFromCommand = domainOutboxIdFromCommand;
exports.monetaryEventIdFromCommandEffect = monetaryEventIdFromCommandEffect;
exports.participantBlockIdFromDirection = participantBlockIdFromDirection;
exports.instructorRelationshipIdFromPair = instructorRelationshipIdFromPair;
exports.bookingIdFromAcceptedProposal = bookingIdFromAcceptedProposal;
exports.paymentIdFromBookingId = paymentIdFromBookingId;
exports.guestSubjectIdFromBookingId = guestSubjectIdFromBookingId;
exports.participantManagementIdFromGuestLink = participantManagementIdFromGuestLink;
exports.bookingOccurrenceIdFromScheduleRevision = bookingOccurrenceIdFromScheduleRevision;
exports.initialBookingOccurrenceIdFromBookingId = initialBookingOccurrenceIdFromBookingId;
exports.courseDayOccurrenceIdFromRevision = courseDayOccurrenceIdFromRevision;
exports.initialCourseDayOccurrenceId = initialCourseDayOccurrenceId;
exports.nextBookingScheduleRevision = nextBookingScheduleRevision;
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
function bookingIdFromAcceptedProposal(proposalId) {
    return identifiers_1.BookingIdSchema.parse(canonicalDeterministicHash(['booking:v1', 'proposal_acceptance', proposalId]));
}
function paymentIdFromBookingId(bookingId) {
    return identifiers_1.PaymentIdSchema.parse(canonicalDeterministicHash(['payment:v1', 'booking', bookingId]));
}
function guestSubjectIdFromBookingId(bookingId) {
    return identifiers_1.GuestSubjectIdSchema.parse(canonicalDeterministicHash(['guest_subject:v1', 'booking', bookingId]));
}
function participantManagementIdFromGuestLink(input) {
    return identifiers_1.ParticipantManagementIdSchema.parse(canonicalDeterministicHash([
        'participant_management:v1',
        'guest_link',
        input.participantId,
        input.accountId,
    ]));
}
function bookingOccurrenceIdFromScheduleRevision(bookingId, scheduleRevision) {
    if (!Number.isInteger(scheduleRevision) || scheduleRevision < 1) {
        throw new Error('scheduleRevision must be a positive integer');
    }
    return identifiers_1.OccurrenceIdSchema.parse(canonicalDeterministicHash(['occurrence:v1', 'booking', bookingId, String(scheduleRevision)]));
}
function initialBookingOccurrenceIdFromBookingId(bookingId) {
    return bookingOccurrenceIdFromScheduleRevision(bookingId, 1);
}
function courseDayOccurrenceIdFromRevision(courseDayId, revision) {
    if (!Number.isInteger(revision) || revision < 1) {
        throw new Error('revision must be a positive integer');
    }
    return identifiers_1.OccurrenceIdSchema.parse(canonicalDeterministicHash(['occurrence:v1', 'course_day', courseDayId, String(revision)]));
}
function initialCourseDayOccurrenceId(courseDayId) {
    return courseDayOccurrenceIdFromRevision(courseDayId, 1);
}
function nextBookingScheduleRevision(currentScheduleRevision) {
    if (!Number.isInteger(currentScheduleRevision) || currentScheduleRevision < 1) {
        throw new Error('currentScheduleRevision must be a positive integer');
    }
    return currentScheduleRevision + 1;
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
