"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalCourseDeliveryFixtures = void 0;
const courseEnrollmentAttendanceAdminIssue_1 = require("../canonical/courseEnrollmentAttendanceAdminIssue");
const deterministicIdentity_1 = require("../canonical/deterministicIdentity");
const identifiers_1 = require("../canonical/identifiers");
const primitives_1 = require("../canonical/primitives");
const primitives_2 = require("./primitives");
const createdAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = (0, primitives_1.timestampFromDate)(new Date('2026-02-01T04:00:00.000Z'));
const dayOneEnd = (0, primitives_1.timestampFromDate)(new Date('2026-02-01T08:00:00.000Z'));
const dayTwoStart = (0, primitives_1.timestampFromDate)(new Date('2026-02-02T04:00:00.000Z'));
const dayTwoEnd = (0, primitives_1.timestampFromDate)(new Date('2026-02-02T08:00:00.000Z'));
const metadata = {
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
        createdByCommandId: 'command_course_fixture_create',
        lastChangedByCommandId: 'command_course_fixture_create',
        correlationId: 'correlation_course_fixture_create',
    },
};
const courseId = identifiers_1.CourseIdSchema.parse('course_fixture_01');
const courseDayOneId = identifiers_1.CourseDayIdSchema.parse('course_day_fixture_01');
const courseDayTwoId = identifiers_1.CourseDayIdSchema.parse('course_day_fixture_02');
const enrollmentId = identifiers_1.CourseEnrollmentIdSchema.parse('course_enrollment_fixture_01');
const participantId = primitives_2.canonicalPrimitiveFixtures.participantId;
const instructorId = primitives_2.canonicalPrimitiveFixtures.instructorId;
const paymentId = primitives_2.canonicalPrimitiveFixtures.paymentId;
const payerAccountId = identifiers_1.AccountIdSchema.parse('account_course_fixture_payer');
const course = courseEnrollmentAttendanceAdminIssue_1.CourseSchema.parse({
    courseId,
    title: 'Alpine Foundations',
    price: primitives_2.canonicalPrimitiveFixtures.money.minorUnits,
    capacity: { totalSeats: 8, availableSeats: 5 },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
        courseDayCount: 2,
        finalCourseDayEndsAt: dayTwoEnd,
        courseScheduleRevision: 1,
    },
    ...metadata,
});
const courseDayOne = courseEnrollmentAttendanceAdminIssue_1.CourseDaySchema.parse({
    courseId,
    courseDayId: courseDayOneId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
    timeZone: primitives_2.canonicalPrimitiveFixtures.timeZone,
    actualInstructorIds: [instructorId],
    ...metadata,
});
const courseDayTwo = courseEnrollmentAttendanceAdminIssue_1.CourseDaySchema.parse({
    courseId,
    courseDayId: courseDayTwoId,
    dayOrder: 2,
    interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
    timeZone: primitives_2.canonicalPrimitiveFixtures.timeZone,
    actualInstructorIds: [instructorId],
    ...metadata,
});
const confirmedEnrollment = courseEnrollmentAttendanceAdminIssue_1.CourseEnrollmentSchema.parse({
    enrollmentId,
    participantId,
    courseId,
    originalCourseId: courseId,
    attribution: {
        bookingOrigin: 'account',
        bookedBy: (0, identifiers_1.accountActorRef)(payerAccountId),
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId,
    attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 1,
        absentDayCount: 0,
        projectionRevision: 1,
    },
    ...metadata,
});
const guestPendingEnrollment = courseEnrollmentAttendanceAdminIssue_1.CourseEnrollmentSchema.parse({
    enrollmentId: identifiers_1.CourseEnrollmentIdSchema.parse('course_enrollment_fixture_guest'),
    participantId,
    courseId,
    originalCourseId: courseId,
    attribution: {
        bookingOrigin: 'guest',
        bookedBy: (0, identifiers_1.guestActorRef)(primitives_2.canonicalPrimitiveFixtures.guestSubjectId),
    },
    lifecycle: {
        status: 'pending',
        reservationExpiresAt: (0, primitives_1.timestampFromDate)(new Date('2026-01-02T00:00:00.000Z')),
    },
    paymentId: identifiers_1.PaymentIdSchema.parse('payment_course_fixture_guest'),
    ...metadata,
});
const occurrenceId = identifiers_1.OccurrenceIdSchema.parse('occurrence_course_fixture_01');
const bookingAttendanceId = (0, courseEnrollmentAttendanceAdminIssue_1.attendanceIdFromBookingIdentity)({
    strategyVersion: 'attendance:v1',
    subjectKind: 'booking',
    occurrenceId,
    participantId,
});
const presentBookingAttendance = courseEnrollmentAttendanceAdminIssue_1.AttendanceSchema.parse({
    attendanceId: bookingAttendanceId,
    subject: {
        subjectKind: 'booking',
        bookingId: primitives_2.canonicalPrimitiveFixtures.bookingId,
        occurrenceId,
        participantId,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId: primitives_2.canonicalPrimitiveFixtures.correlationId,
});
const courseDayAttendanceId = (0, courseEnrollmentAttendanceAdminIssue_1.attendanceIdFromCourseDayIdentity)({
    strategyVersion: 'attendance:v1',
    subjectKind: 'course_enrollment',
    enrollmentId,
    courseDayId: courseDayOneId,
});
const presentCourseDayAttendance = courseEnrollmentAttendanceAdminIssue_1.AttendanceSchema.parse({
    attendanceId: courseDayAttendanceId,
    subject: {
        subjectKind: 'course_enrollment',
        enrollmentId,
        courseId,
        courseDayId: courseDayOneId,
        occurrenceId: (0, deterministicIdentity_1.initialCourseDayOccurrenceId)(courseDayOneId),
        participantId,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId: primitives_2.canonicalPrimitiveFixtures.correlationId,
});
const dedupeKey = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueDedupeKeyFromIdentity)({
    strategyVersion: 'issue:v1',
    kind: 'missing_attendance',
    subjectKind: 'course_enrollment',
    subjectId: enrollmentId,
    participantId,
    courseDayId: courseDayTwoId,
});
const openAdminIssue = courseEnrollmentAttendanceAdminIssue_1.AdminIssueSchema.parse({
    issueId: (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueIdFromDedupeKey)(dedupeKey),
    kind: 'missing_attendance',
    subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
    participantId,
    courseDayId: courseDayTwoId,
    lifecycle: {
        status: 'open',
        openedAt: dayTwoEnd,
        lastDetectedAt: dayTwoEnd,
    },
    severity: 'normal',
    blocksOutcome: true,
    blocksDelivery: false,
    dedupeKey,
    correlationId: primitives_2.canonicalPrimitiveFixtures.correlationId,
    ...metadata,
});
exports.canonicalCourseDeliveryFixtures = Object.freeze({
    course,
    courseDays: [courseDayOne, courseDayTwo],
    confirmedEnrollment,
    guestPendingEnrollment,
    presentBookingAttendance,
    presentCourseDayAttendance,
    openAdminIssue,
    dedupeKey,
});
