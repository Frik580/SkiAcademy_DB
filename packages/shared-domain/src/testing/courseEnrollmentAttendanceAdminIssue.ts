import {
  AdminIssueSchema,
  AttendanceSchema,
  CourseDaySchema,
  CourseEnrollmentSchema,
  CourseSchema,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  attendanceIdFromBookingIdentity,
  attendanceIdFromCourseDayIdentity,
} from '../canonical/courseEnrollmentAttendanceAdminIssue';
import { initialCourseDayOccurrenceId } from '../canonical/deterministicIdentity';
import {
  AccountIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  OccurrenceIdSchema,
  PaymentIdSchema,
  accountActorRef,
  guestActorRef,
} from '../canonical/identifiers';
import { timestampFromDate } from '../canonical/primitives';
import { canonicalPrimitiveFixtures } from './primitives';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T04:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T08:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T04:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T08:00:00.000Z'));

const metadata = {
  revision: 1,
  createdAt,
  updatedAt: createdAt,
  audit: {
    createdByCommandId: 'command_course_fixture_create',
    lastChangedByCommandId: 'command_course_fixture_create',
    correlationId: 'correlation_course_fixture_create',
  },
} as const;

const courseId = CourseIdSchema.parse('course_fixture_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_fixture_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_fixture_02');
const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_fixture_01');
const participantId = canonicalPrimitiveFixtures.participantId;
const instructorId = canonicalPrimitiveFixtures.instructorId;
const paymentId = canonicalPrimitiveFixtures.paymentId;
const payerAccountId = AccountIdSchema.parse('account_course_fixture_payer');

const course = CourseSchema.parse({
  courseId,
  title: 'Alpine Foundations',
  price: canonicalPrimitiveFixtures.money.minorUnits,
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

const courseDayOne = CourseDaySchema.parse({
  courseId,
  courseDayId: courseDayOneId,
  dayOrder: 1,
  interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
  timeZone: canonicalPrimitiveFixtures.timeZone,
  actualInstructorIds: [instructorId],
  ...metadata,
});

const courseDayTwo = CourseDaySchema.parse({
  courseId,
  courseDayId: courseDayTwoId,
  dayOrder: 2,
  interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
  timeZone: canonicalPrimitiveFixtures.timeZone,
  actualInstructorIds: [instructorId],
  ...metadata,
});

const confirmedEnrollment = CourseEnrollmentSchema.parse({
  enrollmentId,
  participantId,
  courseId,
  originalCourseId: courseId,
  attribution: {
    bookingOrigin: 'account',
    bookedBy: accountActorRef(payerAccountId),
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

const guestPendingEnrollment = CourseEnrollmentSchema.parse({
  enrollmentId: CourseEnrollmentIdSchema.parse('course_enrollment_fixture_guest'),
  participantId,
  courseId,
  originalCourseId: courseId,
  attribution: {
    bookingOrigin: 'guest',
    bookedBy: guestActorRef(canonicalPrimitiveFixtures.guestSubjectId),
  },
  lifecycle: {
    status: 'pending',
    reservationExpiresAt: timestampFromDate(new Date('2026-01-02T00:00:00.000Z')),
  },
  paymentId: PaymentIdSchema.parse('payment_course_fixture_guest'),
  ...metadata,
});

const occurrenceId = OccurrenceIdSchema.parse('occurrence_course_fixture_01');
const bookingAttendanceId = attendanceIdFromBookingIdentity({
  strategyVersion: 'attendance:v1',
  subjectKind: 'booking',
  occurrenceId,
  participantId,
});

const presentBookingAttendance = AttendanceSchema.parse({
  attendanceId: bookingAttendanceId,
  subject: {
    subjectKind: 'booking',
    bookingId: canonicalPrimitiveFixtures.bookingId,
    occurrenceId,
    participantId,
  },
  attendanceStatus: 'present',
  recordedBy: { kind: 'instructor', instructorId },
  recordedAt: dayOneEnd,
  lastChangedBy: { kind: 'instructor', instructorId },
  updatedAt: dayOneEnd,
  revision: 1,
  correlationId: canonicalPrimitiveFixtures.correlationId,
});

const courseDayAttendanceId = attendanceIdFromCourseDayIdentity({
  strategyVersion: 'attendance:v1',
  subjectKind: 'course_enrollment',
  enrollmentId,
  courseDayId: courseDayOneId,
});

const presentCourseDayAttendance = AttendanceSchema.parse({
  attendanceId: courseDayAttendanceId,
  subject: {
    subjectKind: 'course_enrollment',
    enrollmentId,
    courseId,
    courseDayId: courseDayOneId,
    occurrenceId: initialCourseDayOccurrenceId(courseDayOneId),
    participantId,
  },
  attendanceStatus: 'present',
  recordedBy: { kind: 'instructor', instructorId },
  recordedAt: dayOneEnd,
  lastChangedBy: { kind: 'instructor', instructorId },
  updatedAt: dayOneEnd,
  revision: 1,
  correlationId: canonicalPrimitiveFixtures.correlationId,
});

const dedupeKey = adminIssueDedupeKeyFromIdentity({
  strategyVersion: 'issue:v1',
  kind: 'missing_attendance',
  subjectKind: 'course_enrollment',
  subjectId: enrollmentId,
  participantId,
  courseDayId: courseDayTwoId,
});

const openAdminIssue = AdminIssueSchema.parse({
  issueId: adminIssueIdFromDedupeKey(dedupeKey),
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
  correlationId: canonicalPrimitiveFixtures.correlationId,
  ...metadata,
});

export const canonicalCourseDeliveryFixtures = Object.freeze({
  course,
  courseDays: [courseDayOne, courseDayTwo] as const,
  confirmedEnrollment,
  guestPendingEnrollment,
  presentBookingAttendance,
  presentCourseDayAttendance,
  openAdminIssue,
  dedupeKey,
});
