"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalPrimitiveFixtures = void 0;
const canonical_1 = require("../canonical");
const participantId = canonical_1.ParticipantIdSchema.parse('participant_fixture_01');
const courseId = canonical_1.CourseIdSchema.parse('course_fixture_01');
const guestSubjectId = canonical_1.GuestSubjectIdSchema.parse('guest_fixture_01');
const startsAt = (0, canonical_1.timestampFromDate)(new Date('2026-01-15T04:00:00.000Z'));
const endsAt = (0, canonical_1.timestampFromDate)(new Date('2026-01-15T05:00:00.000Z'));
exports.canonicalPrimitiveFixtures = Object.freeze({
    accountId: canonical_1.AccountIdSchema.parse('account_fixture_01'),
    instructorId: canonical_1.InstructorIdSchema.parse('instructor_fixture_01'),
    participantId,
    bookingId: canonical_1.BookingIdSchema.parse('booking_fixture_01'),
    courseId,
    courseDayId: canonical_1.CourseDayIdSchema.parse('course_day_fixture_01'),
    courseEnrollmentId: canonical_1.CourseEnrollmentIdSchema.parse('course_enrollment_fixture_01'),
    paymentId: canonical_1.PaymentIdSchema.parse('payment_fixture_01'),
    correlationId: canonical_1.CorrelationIdSchema.parse('correlation_fixture_01'),
    guestSubjectId,
    guestActorRef: (0, canonical_1.guestActorRef)(guestSubjectId),
    activeCourseEnrollmentGuardKey: (0, canonical_1.activeCourseEnrollmentGuardKey)(participantId, courseId),
    revision: canonical_1.AggregateRevisionSchema.parse(1),
    money: canonical_1.KztMoneySchema.parse({ currency: 'KZT', minorUnits: 25_000 }),
    interval: canonical_1.TimeIntervalSchema.parse({ startsAt, endsAt }),
    timeZone: 'Asia/Almaty',
});
