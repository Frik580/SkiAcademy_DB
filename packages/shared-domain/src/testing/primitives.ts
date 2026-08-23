import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  KztMoneySchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  TimeIntervalSchema,
  timestampFromDate,
} from '../canonical';

const startsAt = timestampFromDate(new Date('2026-01-15T04:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-01-15T05:00:00.000Z'));

export const canonicalPrimitiveFixtures = Object.freeze({
  accountId: AccountIdSchema.parse('account_fixture_01'),
  instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
  participantId: ParticipantIdSchema.parse('participant_fixture_01'),
  bookingId: BookingIdSchema.parse('booking_fixture_01'),
  courseId: CourseIdSchema.parse('course_fixture_01'),
  courseDayId: CourseDayIdSchema.parse('course_day_fixture_01'),
  courseEnrollmentId: CourseEnrollmentIdSchema.parse('course_enrollment_fixture_01'),
  paymentId: PaymentIdSchema.parse('payment_fixture_01'),
  correlationId: CorrelationIdSchema.parse('correlation_fixture_01'),
  revision: AggregateRevisionSchema.parse(1),
  money: KztMoneySchema.parse({ currency: 'KZT', minorUnits: 25_000 }),
  interval: TimeIntervalSchema.parse({ startsAt, endsAt }),
  timeZone: 'Asia/Almaty' as const,
});
