import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
} from './identifiers';
import { timestampFromDate } from './primitives';
import { courseDayOccurrenceId } from './courseEnrollmentAttendancePolicy';
import {
  CourseProgressPresentationSchema,
  deriveCourseProgressPresentation,
} from './courseProgressPresentation';
import type {
  Attendance,
  Course,
  CourseDay,
  CourseEnrollment,
} from './courseEnrollmentAttendanceAdminIssue';

const courseId = CourseIdSchema.parse('course_progress_presentation_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_progress_presentation_01');
const participantId = ParticipantIdSchema.parse('participant_progress_presentation_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function day(dayOrder: number, revision = 1): CourseDay {
  const date = String(dayOrder).padStart(2, '0');
  return {
    courseId,
    courseDayId: CourseDayIdSchema.parse(`course_day_progress_${date}`),
    dayOrder,
    interval: {
      startsAt: timestampFromDate(new Date(`2026-02-${date}T09:00:00.000Z`)),
      endsAt: timestampFromDate(new Date(`2026-02-${date}T11:00:00.000Z`)),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: ['instructor_progress_presentation_01' as never],
    revision,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_progress_presentation_01',
    },
  };
}

const courseDays = [1, 2, 3, 4, 5].map((value) => day(value));

function course(): Course {
  return {
    courseId,
    title: 'Course progress semantics',
    price: 100_000,
    capacity: { totalSeats: 8, availableSeats: 6 },
    instructorRosterIds: ['instructor_progress_presentation_01' as never],
    startAt: courseDays[0]!.interval.startsAt,
    scheduleProjection: {
      courseDayCount: 5,
      finalCourseDayEndsAt: courseDays[4]!.interval.endsAt,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_progress_presentation_01',
    },
  };
}

function enrollment(
  input: {
    id?: typeof enrollmentId;
    participant?: typeof participantId;
    lifecycle?: CourseEnrollment['lifecycle'];
  } = {}
): CourseEnrollment {
  return {
    enrollmentId: input.id ?? enrollmentId,
    participantId: input.participant ?? participantId,
    courseId,
    originalCourseId: courseId,
    paymentId: 'payment_progress_presentation_01' as never,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId: 'account_progress_presentation_01' },
    },
    lifecycle: input.lifecycle ?? { status: 'confirmed' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_progress_presentation_01',
    },
  };
}

function attendance(input: {
  courseDay: CourseDay;
  status: 'present' | 'absent';
  enrollment?: CourseEnrollment;
  occurrenceRevision?: number;
}): Attendance {
  const owner = input.enrollment ?? enrollment();
  return {
    attendanceId: `attendance_${owner.enrollmentId}_${input.courseDay.courseDayId}` as never,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId: owner.enrollmentId,
      courseId,
      courseDayId: input.courseDay.courseDayId,
      occurrenceId: courseDayOccurrenceId({
        ...input.courseDay,
        revision: input.occurrenceRevision ?? input.courseDay.revision,
      }),
      participantId: owner.participantId,
    },
    attendanceStatus: input.status,
    recordedBy: { kind: 'instructor', instructorId: input.courseDay.actualInstructorIds[0]! },
    recordedAt: input.courseDay.interval.endsAt,
    lastChangedBy: { kind: 'instructor', instructorId: input.courseDay.actualInstructorIds[0]! },
    updatedAt: input.courseDay.interval.endsAt,
    revision: 1,
    correlationId: 'correlation_progress_presentation_01',
  };
}

function presentation(input: {
  now: string;
  owner?: CourseEnrollment;
  attendances?: readonly Attendance[];
  days?: readonly CourseDay[];
}) {
  const attendances = input.attendances ?? [];
  return deriveCourseProgressPresentation({
    now: timestampFromDate(new Date(input.now)),
    enrollment: input.owner ?? enrollment(),
    course: course(),
    courseDays: input.days ?? courseDays,
    attendancesByCourseDayId: new Map(attendances.map((item) => [item.subject.courseDayId, item])),
  });
}

describe('CourseProgressPresentation', () => {
  it.each([
    ['2026-02-01T10:59:59.999Z', 0, 0],
    ['2026-02-02T11:00:00.000Z', 2, 40],
    ['2026-02-05T11:00:00.000Z', 5, 100],
  ])('derives %s as %i/5 elapsed = %i%%', (now, elapsedDays, progressPercent) => {
    expect(presentation({ now })).toMatchObject({
      scheduledDays: 5,
      elapsedDays,
      progressPercent,
    });
  });

  it('does not count a running or future CourseDay as elapsed', () => {
    expect(presentation({ now: '2026-02-03T10:00:00.000Z' }).elapsedDays).toBe(2);
  });

  it('derives present, absent, recorded, and missing counters from current evidence', () => {
    const attendances = [
      attendance({ courseDay: courseDays[0]!, status: 'present' }),
      attendance({ courseDay: courseDays[1]!, status: 'absent' }),
      attendance({ courseDay: courseDays[2]!, status: 'present' }),
    ];
    expect(presentation({ now: '2026-02-03T12:00:00.000Z', attendances })).toMatchObject({
      recordedDays: 3,
      presentDays: 2,
      absentDays: 1,
      missingDays: 2,
    });
  });

  it('accepts the verified current-occurrence Attendance summary projection', () => {
    const value = deriveCourseProgressPresentation({
      now: timestampFromDate(new Date('2026-02-02T11:00:00.000Z')),
      enrollment: enrollment(),
      course: course(),
      courseDays,
      attendanceSummary: {
        recordedDayCount: 2,
        presentDayCount: 1,
        absentDayCount: 1,
        projectionRevision: 2,
      },
    });
    expect(value).toMatchObject({
      recordedDays: 2,
      presentDays: 1,
      absentDays: 1,
      missingDays: 3,
      attendanceCoveragePercent: 40,
      attendanceRatePercent: 50,
    });
  });

  it('keeps Attendance coverage separate from curriculum progress', () => {
    const value = presentation({
      now: '2026-02-02T11:00:00.000Z',
      attendances: [attendance({ courseDay: courseDays[0]!, status: 'present' })],
    });
    expect(value.progressPercent).toBe(40);
    expect(value.attendanceCoveragePercent).toBe(20);
    expect(value.attendanceRatePercent).toBe(100);
  });

  it('uses null Attendance rate when there is no recorded Attendance', () => {
    expect(presentation({ now: '2026-02-05T11:00:00.000Z' }).attendanceRatePercent).toBeNull();
  });

  it('keeps 100% schedule progress distinct from no_show completion semantics', () => {
    const noShowAt = timestampFromDate(new Date('2026-02-05T11:00:00.000Z'));
    const owner = enrollment({ lifecycle: { status: 'no_show', noShowAt } });
    const attendances = courseDays.map((courseDay) =>
      attendance({ courseDay, status: 'absent', enrollment: owner })
    );
    expect(presentation({ now: '2026-02-05T11:00:00.000Z', owner, attendances })).toMatchObject({
      progressPercent: 100,
      attendanceCoveragePercent: 100,
      attendanceRatePercent: 0,
      lifecycleStatus: 'no_show',
    });
  });

  it('isolates Participants through CourseEnrollment identity', () => {
    const participantB = ParticipantIdSchema.parse('participant_progress_presentation_02');
    const enrollmentB = enrollment({
      id: CourseEnrollmentIdSchema.parse('enrollment_progress_presentation_02'),
      participant: participantB,
    });
    const attendanceForA = attendance({ courseDay: courseDays[0]!, status: 'present' });
    expect(
      presentation({
        now: '2026-02-01T12:00:00.000Z',
        owner: enrollmentB,
        attendances: [attendanceForA],
      })
    ).toMatchObject({
      enrollmentId: enrollmentB.enrollmentId,
      participantId: participantB,
      recordedDays: 0,
      presentDays: 0,
    });
  });

  it('does not count old-occurrence Attendance after CourseDay revision', () => {
    const revisedDay = day(1, 2);
    const stale = attendance({
      courseDay: revisedDay,
      status: 'present',
      occurrenceRevision: 1,
    });
    const days = [revisedDay, ...courseDays.slice(1)];
    expect(
      presentation({ now: '2026-02-01T12:00:00.000Z', days, attendances: [stale] })
    ).toMatchObject({ recordedDays: 0, presentDays: 0, missingDays: 5 });
  });

  it('rejects percentage and counter invariant violations', () => {
    const valid = presentation({ now: '2026-02-02T11:00:00.000Z' });
    expect(
      CourseProgressPresentationSchema.safeParse({
        ...valid,
        elapsedDays: 6,
        recordedDays: 6,
        presentDays: 4,
        absentDays: 1,
        missingDays: -1,
        progressPercent: 120,
      }).success
    ).toBe(false);
  });
});
