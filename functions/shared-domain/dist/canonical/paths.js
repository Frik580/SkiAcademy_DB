"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalPaths = exports.CanonicalDocumentPathSchema = exports.CanonicalCollectionPathSchema = exports.CANONICAL_COLLECTIONS = void 0;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
exports.CANONICAL_COLLECTIONS = {
    users: 'users',
    instructors: 'instructors',
    participants: 'participants',
    participantManagement: 'participant_management',
    participantManagementActiveOwner: 'participant_management_active_owner',
    instructorRelationships: 'instructor_relationships',
    participantBlocks: 'participant_blocks',
    bookings: 'bookings',
    courses: 'courses',
    courseEnrollments: 'course_enrollments',
    payments: 'payments',
    attendance: 'attendance',
    bookingProposals: 'booking_proposals',
    bookingChangeRequests: 'booking_change_requests',
    adminIssues: 'admin_issues',
    resourceClaims: 'resource_claims',
    resourceClaimGuards: 'resource_claim_guards',
    activeCourseEnrollmentGuards: 'active_course_enrollment_guards',
    activityLogs: 'activity_logs',
    commandIdempotency: 'command_idempotency',
    domainOutbox: 'domain_outbox',
    notifications: 'notifications',
    monetaryEvents: 'monetary_events',
    providerEventReceipts: 'provider_event_receipts',
};
const topLevelDocumentSchemas = {
    users: identifiers_1.AccountIdSchema,
    instructors: identifiers_1.InstructorIdSchema,
    participants: identifiers_1.ParticipantIdSchema,
    participant_management: identifiers_1.ParticipantManagementIdSchema,
    participant_management_active_owner: identifiers_1.ParticipantIdSchema,
    instructor_relationships: identifiers_1.InstructorRelationshipIdSchema,
    participant_blocks: identifiers_1.ParticipantBlockIdSchema,
    bookings: identifiers_1.BookingIdSchema,
    courses: identifiers_1.CourseIdSchema,
    course_enrollments: identifiers_1.CourseEnrollmentIdSchema,
    payments: identifiers_1.PaymentIdSchema,
    attendance: identifiers_1.AttendanceIdSchema,
    booking_proposals: identifiers_1.BookingProposalIdSchema,
    booking_change_requests: identifiers_1.BookingChangeRequestIdSchema,
    admin_issues: identifiers_1.AdminIssueIdSchema,
    resource_claims: identifiers_1.ResourceClaimIdSchema,
    resource_claim_guards: identifiers_1.ResourceClaimGuardIdSchema,
    active_course_enrollment_guards: identifiers_1.ActiveCourseEnrollmentGuardKeySchema,
    activity_logs: identifiers_1.ActivityLogIdSchema,
    command_idempotency: identifiers_1.CommandIdSchema,
    domain_outbox: identifiers_1.DomainOutboxIdSchema,
    notifications: identifiers_1.NotificationIdSchema,
    monetary_events: identifiers_1.MonetaryEventIdSchema,
    provider_event_receipts: identifiers_1.ProviderEventReceiptIdSchema,
};
const topLevelCollections = new Set(Object.values(exports.CANONICAL_COLLECTIONS));
function isCanonicalCollectionPath(path) {
    const segments = path.split('/');
    if (segments[0] !== '')
        return false;
    if (segments.length === 2)
        return topLevelCollections.has(segments[1]);
    if (segments.length === 4 && segments[1] === 'courses' && segments[3] === 'days') {
        return identifiers_1.CourseIdSchema.safeParse(segments[2]).success;
    }
    if (segments.length === 4 && segments[1] === 'users' && segments[3] === 'wallet') {
        return identifiers_1.AccountIdSchema.safeParse(segments[2]).success;
    }
    return false;
}
function isCanonicalDocumentPath(path) {
    const segments = path.split('/');
    if (segments[0] !== '')
        return false;
    if (segments.length === 3) {
        const idSchema = topLevelDocumentSchemas[segments[1]];
        return Boolean(idSchema?.safeParse(segments[2]).success);
    }
    if (segments.length === 5 && segments[1] === 'courses' && segments[3] === 'days') {
        return (identifiers_1.CourseIdSchema.safeParse(segments[2]).success &&
            identifiers_1.CourseDayIdSchema.safeParse(segments[4]).success);
    }
    if (segments.length === 5 &&
        segments[1] === 'users' &&
        segments[3] === 'wallet' &&
        segments[4] === 'state') {
        return identifiers_1.AccountIdSchema.safeParse(segments[2]).success;
    }
    return false;
}
exports.CanonicalCollectionPathSchema = zod_1.z
    .string()
    .refine(isCanonicalCollectionPath, 'Path must name a canonical collection')
    .transform((path) => path);
exports.CanonicalDocumentPathSchema = zod_1.z
    .string()
    .refine(isCanonicalDocumentPath, 'Path must name a canonical document')
    .transform((path) => path);
function documentPath(collection, id) {
    return `/${collection}/${id}`;
}
exports.canonicalPaths = {
    account: (id) => documentPath('users', id),
    wallet: (id) => `/users/${id}/wallet/state`,
    instructor: (id) => documentPath('instructors', id),
    participant: (id) => documentPath('participants', id),
    participantManagement: (id) => documentPath('participant_management', id),
    participantManagementActiveOwner: (id) => documentPath('participant_management_active_owner', id),
    instructorRelationship: (id) => documentPath('instructor_relationships', id),
    participantBlock: (id) => documentPath('participant_blocks', id),
    booking: (id) => documentPath('bookings', id),
    course: (id) => documentPath('courses', id),
    courseDays: (id) => `/courses/${id}/days`,
    courseDay: (courseId, dayId) => `/courses/${courseId}/days/${dayId}`,
    courseEnrollment: (id) => documentPath('course_enrollments', id),
    payment: (id) => documentPath('payments', id),
    attendance: (id) => documentPath('attendance', id),
    bookingProposal: (id) => documentPath('booking_proposals', id),
    bookingChangeRequest: (id) => documentPath('booking_change_requests', id),
    adminIssue: (id) => documentPath('admin_issues', id),
    resourceClaim: (id) => documentPath('resource_claims', id),
    resourceClaimGuard: (id) => documentPath('resource_claim_guards', id),
    activeCourseEnrollmentGuard: (participantId, courseId) => documentPath('active_course_enrollment_guards', (0, identifiers_1.activeCourseEnrollmentGuardKey)(participantId, courseId)),
    activityLog: (id) => documentPath('activity_logs', id),
    commandIdempotency: (id) => documentPath('command_idempotency', id),
    domainOutbox: (id) => documentPath('domain_outbox', id),
    notification: (id) => documentPath('notifications', id),
    monetaryEvent: (id) => documentPath('monetary_events', id),
    providerEventReceipt: (id) => documentPath('provider_event_receipts', id),
};
