import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  KztMoneySchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  TimeIntervalSchema,
  activeCourseEnrollmentGuardKey,
  guestActorRef,
  timestampFromDate,
} from '../canonical';

const participantId = ParticipantIdSchema.parse('participant_fixture_01');
const courseId = CourseIdSchema.parse('course_fixture_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_fixture_01');
const startsAt = timestampFromDate(new Date('2026-01-15T04:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-01-15T05:00:00.000Z'));

export const canonicalPrimitiveFixtures = Object.freeze({
  accountId: AccountIdSchema.parse('account_fixture_01'),
  instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
  participantId,
  bookingId: BookingIdSchema.parse('booking_fixture_01'),
  courseId,
  courseDayId: CourseDayIdSchema.parse('course_day_fixture_01'),
  courseEnrollmentId: CourseEnrollmentIdSchema.parse('course_enrollment_fixture_01'),
  paymentId: PaymentIdSchema.parse('payment_fixture_01'),
  correlationId: CorrelationIdSchema.parse('correlation_fixture_01'),
  guestSubjectId,
  guestActorRef: guestActorRef(guestSubjectId),
  activeCourseEnrollmentGuardKey: activeCourseEnrollmentGuardKey(participantId, courseId),
  revision: AggregateRevisionSchema.parse(1),
  money: KztMoneySchema.parse({ currency: 'KZT', minorUnits: 25_000 }),
  interval: TimeIntervalSchema.parse({ startsAt, endsAt }),
  timeZone: 'Asia/Almaty' as const,
});
