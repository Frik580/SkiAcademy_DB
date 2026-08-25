"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUEST_COURSE_RESERVATION_TTL_MS = void 0;
exports.resolveGuestCourseReservationExpiresAt = resolveGuestCourseReservationExpiresAt;
exports.isCourseEnrollmentAllowedBeforeStart = isCourseEnrollmentAllowedBeforeStart;
exports.assertUniqueEnrollmentParticipantIds = assertUniqueEnrollmentParticipantIds;
exports.resolveEnrollmentIdsForCommand = resolveEnrollmentIdsForCommand;
exports.courseSeatClaimInterval = courseSeatClaimInterval;
exports.buildCourseSeatClaimIdentity = buildCourseSeatClaimIdentity;
exports.buildParticipantCourseDayEnrollmentClaimIdentity = buildParticipantCourseDayEnrollmentClaimIdentity;
exports.sortedCourseDays = sortedCourseDays;
exports.courseScheduleIsComplete = courseScheduleIsComplete;
const guestBooking_1 = require("./guestBooking");
const deterministicIdentity_1 = require("./deterministicIdentity");
const resourceClaims_1 = require("./resourceClaims");
const primitives_1 = require("./primitives");
/** Maximum guest Course enrollment reservation hold before course start. */
exports.GUEST_COURSE_RESERVATION_TTL_MS = 24 * 60 * 60 * 1_000;
function resolveGuestCourseReservationExpiresAt(input) {
    const ttlExpiresAt = (0, guestBooking_1.addMillisecondsToCanonicalTimestamp)(input.createdAt, exports.GUEST_COURSE_RESERVATION_TTL_MS);
    return (0, guestBooking_1.minCanonicalTimestamp)(ttlExpiresAt, input.courseStartsAt);
}
function isCourseEnrollmentAllowedBeforeStart(input) {
    return (0, primitives_1.compareCanonicalTimestamps)(input.now, input.courseStartsAt) < 0;
}
function assertUniqueEnrollmentParticipantIds(participantIds) {
    const seen = new Set();
    for (const participantId of participantIds) {
        const key = participantId;
        if (seen.has(key)) {
            throw new Error('Duplicate participantIds in enrollment command');
        }
        seen.add(key);
    }
}
function resolveEnrollmentIdsForCommand(input) {
    return input.participantIds.map((participantId) => (0, deterministicIdentity_1.courseEnrollmentIdFromCommandParticipant)({ commandId: input.commandId, participantId }));
}
function courseSeatClaimInterval(input) {
    return {
        startsAt: input.decidedAt,
        endsAt: input.course.scheduleProjection.finalCourseDayEndsAt,
    };
}
function buildCourseSeatClaimIdentity(input) {
    const identity = resourceClaims_1.ResourceClaimIdentityInputSchema.parse({
        strategyVersion: resourceClaims_1.RESOURCE_CLAIM_STRATEGY_VERSION,
        claimKind: 'course_seat_pre_start',
        resourceKind: 'course',
        resourceId: input.courseId,
        ownerKind: 'course_enrollment',
        ownerId: input.enrollmentId,
        occurrenceId: input.occurrenceId,
    });
    return {
        identity,
        claimId: (0, resourceClaims_1.resourceClaimIdFromIdentity)(identity),
    };
}
function buildParticipantCourseDayEnrollmentClaimIdentity(input) {
    const occurrenceId = (0, deterministicIdentity_1.initialCourseDayOccurrenceId)(input.courseDay.courseDayId);
    const identity = resourceClaims_1.ResourceClaimIdentityInputSchema.parse({
        strategyVersion: resourceClaims_1.RESOURCE_CLAIM_STRATEGY_VERSION,
        claimKind: 'participant_course_day_enrollment',
        resourceKind: 'participant',
        resourceId: input.participantId,
        ownerKind: 'course_enrollment',
        ownerId: input.enrollmentId,
        occurrenceId,
    });
    return {
        identity,
        claimId: (0, resourceClaims_1.resourceClaimIdFromIdentity)(identity),
        occurrenceId,
    };
}
function sortedCourseDays(courseDays) {
    return [...courseDays].sort((left, right) => left.dayOrder - right.dayOrder);
}
function courseScheduleIsComplete(course, courseDays) {
    if (courseDays.length === 0) {
        return false;
    }
    if (course.scheduleProjection.courseDayCount !== courseDays.length) {
        return false;
    }
    return courseDays.every((courseDay) => courseDay.courseId === course.courseId);
}
