import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  IdempotencyKeySchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type CommandEnvelope,
  type CourseDay,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import { buildCommandEnvelopeFromCallable } from '../commands/callableTransportAdapter';
import { resolveCallableAccountContext } from '../commands/resolveCallableAccountContext';
import { assertRecordCourseDayAttendanceAuthorization } from './courseEnrollmentAttendanceAuthorization';

const firstInstructorId = InstructorIdSchema.parse('instructor_course_auth_first');
const secondInstructorId = InstructorIdSchema.parse('instructor_course_auth_second');
const unrelatedInstructorId = InstructorIdSchema.parse('instructor_course_auth_unrelated');
const courseId = CourseIdSchema.parse('course_attendance_auth_multi');
const courseDayId = CourseDayIdSchema.parse('course_day_attendance_auth_multi');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_attendance_auth_multi');
const participantId = ParticipantIdSchema.parse('participant_attendance_auth_multi');
const instructorAccountId = AccountIdSchema.parse('account_attendance_auth_instructor');
const correlationId = CorrelationIdSchema.parse('correlation_attendance_auth_multi');
const startsAt = timestampFromDate(new Date('2026-02-01T09:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-02-01T11:00:00.000Z'));
const now = timestampFromDate(new Date('2026-02-01T10:00:00.000Z'));

const enrollment: CourseEnrollment = {
  enrollmentId,
  participantId,
  courseId,
  originalCourseId: courseId,
  paymentId: 'payment_attendance_auth_multi' as never,
  attribution: {
    bookingOrigin: 'admin',
    bookedBy: { kind: 'account', accountId: 'account_attendance_auth_owner' },
  },
  lifecycle: { status: 'confirmed' },
  revision: 1,
  createdAt: startsAt,
  updatedAt: startsAt,
  audit: {
    createdByCommandId: 'seed',
    lastChangedByCommandId: 'seed',
    correlationId: 'correlation_attendance_auth_multi',
  },
};

function courseDay(actualInstructorIds: CourseDay['actualInstructorIds']): CourseDay {
  return {
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt, endsAt },
    timeZone: 'Asia/Almaty',
    actualInstructorIds,
    revision: 1,
    createdAt: startsAt,
    updatedAt: startsAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_attendance_auth_multi',
    },
  };
}

function envelope(
  instructorId: typeof firstInstructorId
): CommandEnvelope<'record_course_day_attendance'> {
  const accountContext = resolveCallableAccountContext(
    { role: 'user', instructorId, isInstructor: true },
    {
      authUid: instructorAccountId,
      commandKind: 'record_course_day_attendance',
      exercisedCapability: 'instructor',
    }
  );
  return buildCommandEnvelopeFromCallable(accountContext, {
    kind: 'record_course_day_attendance',
    idempotencyKey: IdempotencyKeySchema.parse(`idem-attendance-auth-${instructorId}`),
    correlationId,
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
    },
  });
}

function authorize(instructorId: typeof firstInstructorId, day: CourseDay) {
  return assertRecordCourseDayAttendanceAuthorization(envelope(instructorId), {
    enrollment,
    courseDay: day,
    existingAttendance: undefined,
    now,
  });
}

describe('Course Attendance multi-instructor authorization', () => {
  const assignedDay = courseDay([firstInstructorId, secondInstructorId]);

  it('allows the first assigned instructor', () => {
    expect(authorize(firstInstructorId, assignedDay)).toBe('instructor');
  });

  it('allows the second assigned instructor', () => {
    expect(authorize(secondInstructorId, assignedDay)).toBe('instructor');
  });

  it('denies an unrelated instructor', () => {
    expect(() => authorize(unrelatedInstructorId, assignedDay)).toThrow();
  });

  it('denies instructor authorization for an empty assignment', () => {
    expect(() => authorize(firstInstructorId, courseDay([]))).toThrow();
  });
});
