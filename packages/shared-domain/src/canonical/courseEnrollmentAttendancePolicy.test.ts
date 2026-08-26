import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
} from './identifiers';
import { timestampFromDate } from './guestBooking';
import type { Attendance } from './courseEnrollmentAttendanceAdminIssue';
import {
  applyAttendanceSummaryDelta,
  buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence,
  courseDayAttendanceMatchesCurrentOccurrence,
  courseDayOccurrenceId,
  deriveCourseEnrollmentAttendanceSufficiency,
  evaluateCourseEnrollmentAutomationEligibility,
  evaluateCourseEnrollmentOutcomeCalculator,
  evaluateCourseEnrollmentOutcomeEligibility,
  missingCourseDayAttendanceIssueIdentity,
  resolveMissingCourseDayIds,
} from './courseEnrollmentAttendancePolicy';
import type {
  Course,
  CourseDay,
  CourseEnrollment,
  CourseEnrollmentAttendanceSummary,
} from './courseEnrollmentAttendanceAdminIssue';

const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_attendance_policy_01');
const participantId = ParticipantIdSchema.parse('participant_attendance_policy_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_attendance_policy_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_attendance_policy_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_attendance_policy_03');
const finalEndsAt = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));

function enrollment(summary?: CourseEnrollmentAttendanceSummary): CourseEnrollment {
  return {
    enrollmentId,
    participantId,
    courseId: 'course_attendance_policy_01' as CourseEnrollment['courseId'],
    originalCourseId: 'course_attendance_policy_01' as CourseEnrollment['courseId'],
    paymentId: 'payment_attendance_policy_01' as CourseEnrollment['paymentId'],
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: 'account_attendance_policy_01' },
    },
    lifecycle: { status: 'confirmed' },
    revision: 1,
    createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_attendance_policy_01',
    },
    ...(summary ? { attendanceSummary: summary } : {}),
  };
}

function course(): Course {
  return {
    courseId: 'course_attendance_policy_01' as Course['courseId'],
    title: 'Policy Course',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: ['instructor_attendance_policy_01' as Course['instructorRosterIds'][number]],
    startAt: timestampFromDate(new Date('2026-02-01T03:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 3,
      finalCourseDayEndsAt: finalEndsAt,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_attendance_policy_01',
    },
  };
}

function courseDay(courseDayId: typeof courseDayOneId, dayOrder: number): CourseDay {
  const starts = timestampFromDate(new Date(`2026-02-0${dayOrder}T03:00:00.000Z`));
  const ends = timestampFromDate(new Date(`2026-02-0${dayOrder}T05:00:00.000Z`));
  return {
    courseId: 'course_attendance_policy_01' as CourseDay['courseId'],
    courseDayId,
    dayOrder,
    interval: { startsAt: starts, endsAt: ends },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: ['instructor_attendance_policy_01' as CourseDay['actualInstructorIds'][number]],
    revision: 1,
    createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_attendance_policy_01',
    },
  };
}

function courseAttendance(
  courseDayId: typeof courseDayOneId,
  dayOrder: number,
  status: 'present' | 'absent',
  occurrenceRevision = 1
): Attendance {
  const day = courseDay(courseDayId, dayOrder);
  return {
    attendanceId: `attendance_policy_${courseDayId}` as Attendance['attendanceId'],
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId: 'course_attendance_policy_01' as CourseEnrollment['courseId'],
      courseDayId,
      occurrenceId: courseDayOccurrenceId({ ...day, revision: occurrenceRevision }),
      participantId,
    },
    attendanceStatus: status,
    recordedBy: { kind: 'instructor', instructorId: day.actualInstructorIds[0]! },
    recordedAt: day.interval.endsAt,
    lastChangedBy: { kind: 'instructor', instructorId: day.actualInstructorIds[0]! },
    updatedAt: day.interval.endsAt,
    revision: 1,
    correlationId: 'correlation_attendance_policy_01',
  };
}

describe('courseEnrollmentAttendancePolicy', () => {
  it('derives completed when any day is present', () => {
    expect(
      deriveCourseEnrollmentAttendanceSufficiency({
        courseDayCount: 3,
        attendanceSummary: {
          recordedDayCount: 1,
          presentDayCount: 1,
          absentDayCount: 0,
          projectionRevision: 1,
        },
      })
    ).toBe('completed');
  });

  it('derives no_show only when all days are absent', () => {
    expect(
      deriveCourseEnrollmentAttendanceSufficiency({
        courseDayCount: 3,
        attendanceSummary: {
          recordedDayCount: 3,
          presentDayCount: 0,
          absentDayCount: 3,
          projectionRevision: 3,
        },
      })
    ).toBe('no_show');
  });

  it('derives missing_attendance when no present and not all absent', () => {
    expect(
      deriveCourseEnrollmentAttendanceSufficiency({
        courseDayCount: 3,
        attendanceSummary: {
          recordedDayCount: 2,
          presentDayCount: 0,
          absentDayCount: 2,
          projectionRevision: 2,
        },
      })
    ).toBe('missing_attendance');
  });

  it('uses actor-driven outcome eligibility at finalCourseDayEndsAt', () => {
    expect(
      evaluateCourseEnrollmentOutcomeEligibility({
        now: timestampFromDate(new Date('2026-02-03T04:59:59.999Z')),
        finalCourseDayEndsAt: finalEndsAt,
      })
    ).toBe('not_yet_eligible');
    expect(
      evaluateCourseEnrollmentOutcomeEligibility({
        now: finalEndsAt,
        finalCourseDayEndsAt: finalEndsAt,
      })
    ).toBe('eligible');
  });

  it('uses system automation eligibility at finalCourseDayEndsAt + 24h', () => {
    const automationAt = timestampFromDate(new Date('2026-02-04T05:00:00.000Z'));
    expect(
      evaluateCourseEnrollmentAutomationEligibility({
        now: timestampFromDate(new Date('2026-02-04T04:59:59.999Z')),
        finalCourseDayEndsAt: finalEndsAt,
      })
    ).toBe('not_yet_eligible');
    expect(
      evaluateCourseEnrollmentAutomationEligibility({
        now: automationAt,
        finalCourseDayEndsAt: finalEndsAt,
      })
    ).toBe('eligible');
  });

  it('blocks outcome before final day even with present evidence', () => {
    const decision = evaluateCourseEnrollmentOutcomeCalculator({
      now: timestampFromDate(new Date('2026-02-01T06:00:00.000Z')),
      enrollment: enrollment({
        recordedDayCount: 1,
        presentDayCount: 1,
        absentDayCount: 0,
        projectionRevision: 1,
      }),
      course: course(),
      courseDays: [courseDay(courseDayOneId, 1), courseDay(courseDayTwoId, 2), courseDay(courseDayThreeId, 3)],
      attendancesByCourseDayId: new Map(),
      openAdminIssues: [],
      automationOnly: false,
    });
    expect(decision).toEqual({ outcome: 'not_yet_eligible' });
  });

  it('resolves completed after final day with any present', () => {
    const days = [courseDay(courseDayOneId, 1), courseDay(courseDayTwoId, 2), courseDay(courseDayThreeId, 3)];
    const attendances = new Map([
      [courseDayTwoId, courseAttendance(courseDayTwoId, 2, 'present')],
    ]);
    const decision = evaluateCourseEnrollmentOutcomeCalculator({
      now: timestampFromDate(new Date('2026-02-03T06:00:00.000Z')),
      enrollment: enrollment(),
      course: course(),
      courseDays: days,
      attendancesByCourseDayId: attendances,
      openAdminIssues: [],
      automationOnly: false,
    });
    expect(decision).toEqual({ outcome: 'resolve', lifecycle: 'completed' });
  });

  it('blocks pending_cancellation terminalization', () => {
    const pending = {
      ...enrollment({
        recordedDayCount: 3,
        presentDayCount: 0,
        absentDayCount: 3,
        projectionRevision: 3,
      }),
      lifecycle: { status: 'pending_cancellation' as const, requestedAt: finalEndsAt },
    };
    const decision = evaluateCourseEnrollmentOutcomeCalculator({
      now: timestampFromDate(new Date('2026-02-03T06:00:00.000Z')),
      enrollment: pending,
      course: course(),
      courseDays: [courseDay(courseDayOneId, 1), courseDay(courseDayTwoId, 2), courseDay(courseDayThreeId, 3)],
      attendancesByCourseDayId: new Map(),
      openAdminIssues: [],
      automationOnly: false,
    });
    expect(decision).toEqual({ outcome: 'blocked_pending_cancellation' });
  });

  it('creates deterministic missing_attendance issue identity per course day', () => {
    const identity = missingCourseDayAttendanceIssueIdentity({
      enrollmentId,
      courseDayId: courseDayOneId,
      participantId,
      occurrenceId: OccurrenceIdSchema.parse('occurrence_attendance_policy_01'),
    });
    expect(identity.kind).toBe('missing_attendance');
    expect(identity.courseDayId).toBe(courseDayOneId);
    expect(
      missingCourseDayAttendanceIssueIdentity({
        enrollmentId,
        courseDayId: courseDayOneId,
        participantId,
        occurrenceId: OccurrenceIdSchema.parse('occurrence_attendance_policy_01'),
      })
    ).toEqual(identity);
  });

  it('updates attendance summary deltas idempotently for status changes', () => {
    const initial = applyAttendanceSummaryDelta({
      existing: undefined,
      previousStatus: undefined,
      nextStatus: 'present',
    });
    expect(initial).toEqual({
      recordedDayCount: 1,
      presentDayCount: 1,
      absentDayCount: 0,
      projectionRevision: 1,
    });
    const corrected = applyAttendanceSummaryDelta({
      existing: initial,
      previousStatus: 'present',
      nextStatus: 'absent',
    });
    expect(corrected).toEqual({
      recordedDayCount: 1,
      presentDayCount: 0,
      absentDayCount: 1,
      projectionRevision: 2,
    });
  });

  it('lists missing course day ids from attendance map', () => {
    const days = [courseDay(courseDayOneId, 1), courseDay(courseDayTwoId, 2)];
    const missing = resolveMissingCourseDayIds({
      courseDays: days,
      attendancesByCourseDayId: new Map([
        [courseDayOneId, courseAttendance(courseDayOneId, 1, 'present')],
      ]),
    });
    expect(missing).toEqual([courseDayTwoId]);
  });

  it('ignores stale occurrence attendance when resolving missing days', () => {
    const day = courseDay(courseDayOneId, 1);
    const stale = courseAttendance(courseDayOneId, 1, 'present', 1);
    const rotatedDay = { ...day, revision: 2 };
    expect(courseDayAttendanceMatchesCurrentOccurrence(stale, rotatedDay)).toBe(false);
    const missing = resolveMissingCourseDayIds({
      courseDays: [rotatedDay],
      attendancesByCourseDayId: new Map([[courseDayOneId, stale]]),
    });
    expect(missing).toEqual([courseDayOneId]);
    const summary = buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence({
      courseDays: [rotatedDay],
      attendancesByCourseDayId: new Map([[courseDayOneId, stale]]),
    });
    expect(summary.presentDayCount).toBe(0);
  });
});
