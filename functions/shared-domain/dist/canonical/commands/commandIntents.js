"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandIntentSchemaByKind = void 0;
exports.parseCommandIntent = parseCommandIntent;
const zod_1 = require("zod");
const identifiers_1 = require("../identifiers");
const bookingTargetIntent = zod_1.z.object({ bookingId: identifiers_1.BookingIdSchema }).strict();
const courseEnrollmentTargetIntent = zod_1.z
    .object({ courseEnrollmentId: identifiers_1.CourseEnrollmentIdSchema })
    .strict();
const bookingProposalTargetIntent = zod_1.z.object({ bookingProposalId: identifiers_1.BookingProposalIdSchema }).strict();
const bookingChangeRequestTargetIntent = zod_1.z
    .object({ bookingChangeRequestId: identifiers_1.BookingChangeRequestIdSchema })
    .strict();
const participantTargetIntent = zod_1.z.object({ participantId: identifiers_1.ParticipantIdSchema }).strict();
const paymentTargetIntent = zod_1.z.object({ paymentId: identifiers_1.PaymentIdSchema }).strict();
const courseDayTargetIntent = zod_1.z.object({ courseDayId: identifiers_1.CourseDayIdSchema }).strict();
const emptyIntent = zod_1.z.object({}).strict();
exports.CommandIntentSchemaByKind = {
    create_confirmed_booking: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
    })
        .strict(),
    create_guest_booking_request: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
    })
        .strict(),
    confirm_guest_booking: bookingTargetIntent,
    link_guest_booking_to_account: zod_1.z
        .object({
        bookingId: identifiers_1.BookingIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    request_booking_cancellation: bookingTargetIntent,
    withdraw_booking_cancellation_request: bookingTargetIntent,
    resolve_booking_cancellation: bookingTargetIntent,
    reschedule_booking: bookingTargetIntent,
    change_booking_instructor: bookingTargetIntent,
    change_booking_duration: bookingTargetIntent,
    change_booking_party: bookingTargetIntent,
    complete_booking: bookingTargetIntent,
    record_booking_no_show: bookingTargetIntent,
    create_course_enrollments: zod_1.z
        .object({
        courseId: identifiers_1.CourseIdSchema,
        participantIds: zod_1.z.array(identifiers_1.ParticipantIdSchema).min(1).max(8),
    })
        .strict(),
    transfer_course_enrollment: courseEnrollmentTargetIntent,
    withdraw_course_enrollment: courseEnrollmentTargetIntent,
    request_course_enrollment_cancellation: courseEnrollmentTargetIntent,
    resolve_course_enrollment_cancellation: courseEnrollmentTargetIntent,
    create_booking_proposal: zod_1.z
        .object({
        bookingProposalId: identifiers_1.BookingProposalIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    accept_booking_proposal: bookingProposalTargetIntent,
    cancel_booking_proposal: bookingProposalTargetIntent,
    expire_booking_proposal: bookingProposalTargetIntent,
    create_booking_change_request: zod_1.z
        .object({
        bookingChangeRequestId: identifiers_1.BookingChangeRequestIdSchema,
        bookingId: identifiers_1.BookingIdSchema,
    })
        .strict(),
    withdraw_booking_change_request: bookingChangeRequestTargetIntent,
    resolve_booking_change_request: bookingChangeRequestTargetIntent,
    expire_guest_reservation: bookingTargetIntent,
    enforce_payment_start_gate: zod_1.z
        .object({
        subjectKind: zod_1.z.enum(['booking', 'course_enrollment']),
        subjectId: zod_1.z.string().min(1).max(128),
    })
        .strict(),
    resolve_attendance_outcome: zod_1.z
        .object({
        subjectKind: zod_1.z.enum(['booking', 'course_enrollment']),
        subjectId: zod_1.z.string().min(1).max(128),
    })
        .strict(),
    create_participant: zod_1.z
        .object({
        participantId: identifiers_1.ParticipantIdSchema,
        displayName: zod_1.z.string().min(1).max(128),
    })
        .strict(),
    update_participant_profile: participantTargetIntent,
    assign_participant_management: zod_1.z
        .object({
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    revoke_participant_management: zod_1.z
        .object({
        participantManagementId: identifiers_1.ParticipantManagementIdSchema,
    })
        .strict(),
    create_instructor_relationship: zod_1.z
        .object({
        instructorRelationshipId: identifiers_1.InstructorRelationshipIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
    })
        .strict(),
    revoke_instructor_relationship: zod_1.z
        .object({
        instructorRelationshipId: identifiers_1.InstructorRelationshipIdSchema,
    })
        .strict(),
    block_participant: zod_1.z
        .object({
        participantBlockId: identifiers_1.ParticipantBlockIdSchema,
        participantId: identifiers_1.ParticipantIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
    })
        .strict(),
    unblock_participant: zod_1.z
        .object({
        participantBlockId: identifiers_1.ParticipantBlockIdSchema,
    })
        .strict(),
    record_provider_payment_event: paymentTargetIntent,
    record_manual_wallet_funding: emptyIntent,
    adjust_service_price: paymentTargetIntent,
    record_financial_correction: paymentTargetIntent,
    record_audit_correction: emptyIntent,
    create_course_day: zod_1.z
        .object({
        courseDayId: identifiers_1.CourseDayIdSchema,
        courseId: identifiers_1.CourseIdSchema,
        instructorId: identifiers_1.InstructorIdSchema,
    })
        .strict(),
    reassign_course_day_instructor: courseDayTargetIntent,
};
function parseCommandIntent(kind, input) {
    return exports.CommandIntentSchemaByKind[kind].safeParse(input);
}
