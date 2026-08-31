import {
  CanonicalCommandError,
  assertCourseDayInstructorAttendanceWindow,
  attendanceCorrectionWouldContradictTerminalOutcome,
  assertExpectedRevision,
  instructorAssignedToCourseDay,
  instructorMayCorrectAttendance,
  isTerminalCourseEnrollmentLifecycle,
  type Attendance,
  type CommandEnvelope,
  type CourseDay,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertInstructorCapability,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export type CourseEnrollmentAttendanceActorMode =
  | 'instructor'
  | 'administrator'
  | 'admin_terminal_correction'
  | 'instructor_outcome_correction_required';

export function resolveCourseEnrollmentAttendanceActorMode(
  envelope: CommandEnvelope<'record_course_day_attendance'>
): CourseEnrollmentAttendanceActorMode {
  if (envelope.context.exercisedCapability === 'administrator') {
    assertAdministrator(envelope);
    requireAccountActor(envelope);
    return 'administrator';
  }
  if (envelope.context.exercisedCapability === 'instructor') {
    requireAccountActor(envelope);
    return 'instructor';
  }
  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}

export function assertRecordCourseDayAttendanceAuthorization(
  envelope: CommandEnvelope<'record_course_day_attendance'>,
  input: Readonly<{
    enrollment: CourseEnrollment;
    courseDay: CourseDay;
    existingAttendance: Attendance | undefined;
    now: import('@ski-academy/shared-domain').CanonicalTimestamp;
  }>
): CourseEnrollmentAttendanceActorMode {
  const baseMode = resolveCourseEnrollmentAttendanceActorMode(envelope);
  const { enrollment, courseDay } = input;
  const contradictsTerminal = attendanceCorrectionWouldContradictTerminalOutcome({
    enrollment,
    nextStatus: envelope.intent.attendanceStatus,
  });

  if (courseDay.courseDayId !== envelope.intent.courseDayId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'courseDayId', reason: 'conflict' },
    });
  }

  if (isTerminalCourseEnrollmentLifecycle(enrollment)) {
    if (baseMode === 'instructor') {
      const instructorId = courseDay.actualInstructorIds[0]!;
      assertInstructorCapability(envelope, instructorId);
      if (!instructorAssignedToCourseDay(courseDay, instructorId)) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const window = assertCourseDayInstructorAttendanceWindow({
        now: input.now,
        courseDay,
      });
      if (window === 'before_start' || window === 'after_instructor_window') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'startsAt', reason: 'out_of_range' },
        });
      }
      if (contradictsTerminal) {
        return 'instructor_outcome_correction_required';
      }
      throw new CanonicalCommandError('invalid_transition', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
      });
    }

    if (!contradictsTerminal) {
      throw new CanonicalCommandError('invalid_transition', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
      });
    }

    const explanation = envelope.intent.reasonExplanation?.trim();
    if (!explanation) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'reasonExplanation', reason: 'required' },
      });
    }
    assertExpectedRevision({
      correlationId: envelope.context.correlationId,
      expectedRevision: envelope.intent.expectedEnrollmentRevision,
      currentRevision: enrollment.revision,
      requireExpectedRevision: true,
    });
  } else if (
    enrollment.lifecycle.status !== 'confirmed' &&
    enrollment.lifecycle.status !== 'pending_cancellation'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }

  if (baseMode === 'instructor') {
    const instructorId = courseDay.actualInstructorIds[0]!;
    assertInstructorCapability(envelope, instructorId);
    if (!instructorAssignedToCourseDay(courseDay, instructorId)) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    const window = assertCourseDayInstructorAttendanceWindow({
      now: input.now,
      courseDay,
    });
    if (window === 'before_start' || window === 'after_instructor_window') {
      throw new CanonicalCommandError('invalid_transition', {
        correlationId: envelope.context.correlationId,
        details: { field: 'startsAt', reason: 'out_of_range' },
      });
    }
    if (
      input.existingAttendance &&
      !instructorMayCorrectAttendance({
        existing: input.existingAttendance,
        instructorId,
      })
    ) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return baseMode;
  }

  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
  assertExpectedRevision({
    correlationId: envelope.context.correlationId,
    expectedRevision: envelope.intent.expectedEnrollmentRevision,
    currentRevision: enrollment.revision,
    requireExpectedRevision: true,
  });
  if (
    assertCourseDayInstructorAttendanceWindow({
      now: input.now,
      courseDay,
    }) === 'before_start'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }

  if (isTerminalCourseEnrollmentLifecycle(enrollment) && contradictsTerminal) {
    return 'admin_terminal_correction';
  }

  return baseMode;
}
