"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActiveCourseEnrollmentGuardKeySchema = exports.ActorRefSchema = exports.GuestActorRefSchema = exports.AccountActorRefSchema = exports.CanonicalReferenceSchema = exports.CANONICAL_REFERENCE_KINDS = exports.ProviderIdSchema = exports.SystemActorIdSchema = exports.GuestSubjectIdSchema = exports.IncrementalRequirementIdSchema = exports.OccurrenceIdSchema = exports.CausationIdSchema = exports.CorrelationIdSchema = exports.ProviderEventReceiptIdSchema = exports.MonetaryEventIdSchema = exports.NotificationIdSchema = exports.DomainOutboxIdSchema = exports.CommandIdSchema = exports.ActivityLogIdSchema = exports.ResourceClaimGuardIdSchema = exports.ResourceClaimIdSchema = exports.AdminIssueIdSchema = exports.BookingChangeRequestIdSchema = exports.BookingProposalIdSchema = exports.AttendanceIdSchema = exports.PaymentIdSchema = exports.CourseEnrollmentIdSchema = exports.CourseDayIdSchema = exports.CourseIdSchema = exports.BookingIdSchema = exports.ParticipantBlockIdSchema = exports.InstructorRelationshipIdSchema = exports.ParticipantManagementIdSchema = exports.ParticipantIdSchema = exports.InstructorIdSchema = exports.AccountIdSchema = exports.CanonicalOpaqueIdSchema = exports.CANONICAL_ID_KINDS = void 0;
exports.canonicalReference = canonicalReference;
exports.accountActorRef = accountActorRef;
exports.guestActorRef = guestActorRef;
exports.activeCourseEnrollmentGuardKey = activeCourseEnrollmentGuardKey;
const zod_1 = require("zod");
exports.CANONICAL_ID_KINDS = [
    'account',
    'instructor',
    'participant',
    'participant_management',
    'instructor_relationship',
    'participant_block',
    'booking',
    'course',
    'course_day',
    'course_enrollment',
    'payment',
    'attendance',
    'booking_proposal',
    'booking_change_request',
    'admin_issue',
    'resource_claim',
    'resource_claim_guard',
    'activity_log',
    'command',
    'domain_outbox',
    'notification',
    'monetary_event',
    'provider_event_receipt',
    'correlation',
    'causation',
    'occurrence',
    'incremental_requirement',
    'guest_subject',
    'system_actor',
    'provider',
];
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
exports.CanonicalOpaqueIdSchema = zod_1.z
    .string()
    .min(1)
    .max(128)
    .regex(OPAQUE_ID_PATTERN, 'ID must be a bounded URL-safe opaque value');
function canonicalIdSchema(kind) {
    return exports.CanonicalOpaqueIdSchema.transform((value) => value).describe(`${kind} ID`);
}
exports.AccountIdSchema = canonicalIdSchema('account');
exports.InstructorIdSchema = canonicalIdSchema('instructor');
exports.ParticipantIdSchema = canonicalIdSchema('participant');
exports.ParticipantManagementIdSchema = canonicalIdSchema('participant_management');
exports.InstructorRelationshipIdSchema = canonicalIdSchema('instructor_relationship');
exports.ParticipantBlockIdSchema = canonicalIdSchema('participant_block');
exports.BookingIdSchema = canonicalIdSchema('booking');
exports.CourseIdSchema = canonicalIdSchema('course');
exports.CourseDayIdSchema = canonicalIdSchema('course_day');
exports.CourseEnrollmentIdSchema = canonicalIdSchema('course_enrollment');
exports.PaymentIdSchema = canonicalIdSchema('payment');
exports.AttendanceIdSchema = canonicalIdSchema('attendance');
exports.BookingProposalIdSchema = canonicalIdSchema('booking_proposal');
exports.BookingChangeRequestIdSchema = canonicalIdSchema('booking_change_request');
exports.AdminIssueIdSchema = canonicalIdSchema('admin_issue');
exports.ResourceClaimIdSchema = canonicalIdSchema('resource_claim');
exports.ResourceClaimGuardIdSchema = canonicalIdSchema('resource_claim_guard');
exports.ActivityLogIdSchema = canonicalIdSchema('activity_log');
exports.CommandIdSchema = canonicalIdSchema('command');
exports.DomainOutboxIdSchema = canonicalIdSchema('domain_outbox');
exports.NotificationIdSchema = canonicalIdSchema('notification');
exports.MonetaryEventIdSchema = canonicalIdSchema('monetary_event');
exports.ProviderEventReceiptIdSchema = canonicalIdSchema('provider_event_receipt');
exports.CorrelationIdSchema = canonicalIdSchema('correlation');
exports.CausationIdSchema = canonicalIdSchema('causation');
exports.OccurrenceIdSchema = canonicalIdSchema('occurrence');
exports.IncrementalRequirementIdSchema = canonicalIdSchema('incremental_requirement');
exports.GuestSubjectIdSchema = canonicalIdSchema('guest_subject');
exports.SystemActorIdSchema = canonicalIdSchema('system_actor');
exports.ProviderIdSchema = canonicalIdSchema('provider');
const referenceSchemas = {
    account: exports.AccountIdSchema,
    instructor: exports.InstructorIdSchema,
    participant: exports.ParticipantIdSchema,
    participant_management: exports.ParticipantManagementIdSchema,
    instructor_relationship: exports.InstructorRelationshipIdSchema,
    participant_block: exports.ParticipantBlockIdSchema,
    booking: exports.BookingIdSchema,
    course: exports.CourseIdSchema,
    course_day: exports.CourseDayIdSchema,
    course_enrollment: exports.CourseEnrollmentIdSchema,
    payment: exports.PaymentIdSchema,
    attendance: exports.AttendanceIdSchema,
    booking_proposal: exports.BookingProposalIdSchema,
    booking_change_request: exports.BookingChangeRequestIdSchema,
    admin_issue: exports.AdminIssueIdSchema,
    resource_claim: exports.ResourceClaimIdSchema,
    activity_log: exports.ActivityLogIdSchema,
    domain_outbox: exports.DomainOutboxIdSchema,
    notification: exports.NotificationIdSchema,
    monetary_event: exports.MonetaryEventIdSchema,
};
exports.CANONICAL_REFERENCE_KINDS = Object.keys(referenceSchemas);
const canonicalReferenceSchemas = Object.entries(referenceSchemas).map(([kind, idSchema]) => zod_1.z.object({ kind: zod_1.z.literal(kind), id: idSchema }).strict());
exports.CanonicalReferenceSchema = zod_1.z.discriminatedUnion('kind', canonicalReferenceSchemas);
function canonicalReference(kind, id) {
    return { kind, id };
}
exports.AccountActorRefSchema = zod_1.z
    .object({ kind: zod_1.z.literal('account'), accountId: exports.AccountIdSchema })
    .strict();
exports.GuestActorRefSchema = zod_1.z
    .object({ kind: zod_1.z.literal('guest'), guestSubjectId: exports.GuestSubjectIdSchema })
    .strict();
exports.ActorRefSchema = zod_1.z.discriminatedUnion('kind', [
    exports.AccountActorRefSchema,
    exports.GuestActorRefSchema,
]);
function accountActorRef(accountId) {
    return { kind: 'account', accountId };
}
function guestActorRef(guestSubjectId) {
    return { kind: 'guest', guestSubjectId };
}
const ACTIVE_COURSE_ENROLLMENT_GUARD_PREFIX = 'aceg_v1_';
function readLengthPrefixedPart(input, start) {
    const lengthEnd = input.indexOf('_', start);
    if (lengthEnd < 0)
        return undefined;
    const encodedLength = input.slice(start, lengthEnd);
    if (!/^(0|[1-9][0-9]{0,2})$/.test(encodedLength))
        return undefined;
    const length = Number(encodedLength);
    const valueStart = lengthEnd + 1;
    const valueEnd = valueStart + length;
    if (valueEnd > input.length)
        return undefined;
    return { value: input.slice(valueStart, valueEnd), next: valueEnd };
}
function isActiveCourseEnrollmentGuardKey(value) {
    if (!value.startsWith(ACTIVE_COURSE_ENROLLMENT_GUARD_PREFIX))
        return false;
    const participant = readLengthPrefixedPart(value, ACTIVE_COURSE_ENROLLMENT_GUARD_PREFIX.length);
    if (!participant || value[participant.next] !== '_')
        return false;
    const course = readLengthPrefixedPart(value, participant.next + 1);
    if (!course || course.next !== value.length)
        return false;
    return (exports.ParticipantIdSchema.safeParse(participant.value).success &&
        exports.CourseIdSchema.safeParse(course.value).success);
}
exports.ActiveCourseEnrollmentGuardKeySchema = zod_1.z
    .string()
    .max(320)
    .refine(isActiveCourseEnrollmentGuardKey, 'Guard key must encode a Participant and Course pair')
    .transform((value) => value);
function activeCourseEnrollmentGuardKey(participantId, courseId) {
    return exports.ActiveCourseEnrollmentGuardKeySchema.parse(`${ACTIVE_COURSE_ENROLLMENT_GUARD_PREFIX}${participantId.length}_${participantId}_${courseId.length}_${courseId}`);
}
