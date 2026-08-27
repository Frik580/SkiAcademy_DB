import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  CourseDayIdSchema,
  CourseIdSchema,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  courseEnrollmentReconciliationHasMutations,
  evaluateCourseEnrollmentReconciliation,
  initialCourseDayOccurrenceId,
  missingCourseDayAttendanceIssueIdentity,
  ParticipantIdSchema,
  paymentIdFromCourseEnrollmentId,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  PaymentSchema,
  shouldResolveStaleAttendancePaymentConflictIssue,
  shouldResolveStaleMissingAttendanceIssue,
  shouldResolveStalePaymentRequiredAtStartIssue,
  timestampFromDate,
  type AdminIssue,
  type Attendance,
  type Course,
  type CourseDay,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import { CourseEnrollmentIdSchema } from '@ski-academy/shared-domain';

const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_reconciliation_test_01');
const courseId = CourseIdSchema.parse('course_reconciliation_test_01');
const participantId = ParticipantIdSchema.parse('participant_reconciliation_test_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_reconciliation_01');
const accountId = AccountIdSchema.parse('account_reconciliation_test_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
const occurrenceId = initialCourseDayOccurrenceId(courseDayOneId);

function courseEnrollment(
  lifecycle: CourseEnrollment['lifecycle'] = { status: 'confirmed' }
): CourseEnrollment {
  return {
    enrollmentId,
    participantId,
    courseId,
    originalCourseId: courseId,
    paymentId,
    payerAccountId: accountId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId },
    },
    lifecycle,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_reconciliation_test_01',
    },
  };
}

function course(): Course {
  return {
    courseId,
    title: 'Reconciliation Course',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: ['instructor_reconciliation_test_01'],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: dayOneEnd,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_reconciliation_test_01',
    },
  };
}

function courseDay(): CourseDay {
  return {
    courseId,
    courseDayId: courseDayOneId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: ['instructor_reconciliation_test_01'],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_reconciliation_test_01',
    },
  };
}

function fundedPayment() {
  return PaymentSchema.parse({
    paymentId,
    subjectType: 'course_enrollment',
    subjectId: enrollmentId,
    currency: 'KZT',
    originalPrice: 50_000,
    price: 50_000,
    paidAmount: 50_000,
    refundedAmount: 0,
    retainedAmount: 50_000,
    settledAmount: 50_000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    payerAccountId: accountId,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function underfundedPayment() {
  return PaymentSchema.parse({
    ...fundedPayment(),
    paidAmount: 0,
    retainedAmount: 0,
    settledAmount: 0,
    outstandingAmount: 50_000,
    paymentStatus: 'unpaid',
  });
}

function openIssue(kind: AdminIssue['kind'], extra: Partial<AdminIssue> = {}): AdminIssue {
  const identity =
    kind === 'payment_required_at_start'
      ? paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(enrollmentId)
      : kind === 'attendance_payment_conflict'
        ? courseEnrollmentAttendancePaymentConflictIdentity({
            enrollmentId,
            occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
            participantId,
          })
        : missingCourseDayAttendanceIssueIdentity({
            enrollmentId,
            courseDayId: courseDayOneId,
            participantId,
            occurrenceId,
          });
  const dedupeKey = adminIssueDedupeKeyFromIdentity(identity);
  const issueId = adminIssueIdFromDedupeKey(dedupeKey);
  return {
    issueId,
    kind,
    subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
    ...(identity.occurrenceId === undefined ? {} : { occurrenceId: identity.occurrenceId }),
    ...(identity.courseDayId === undefined ? {} : { courseDayId: identity.courseDayId }),
    ...(identity.participantId === undefined ? {} : { participantId: identity.participantId }),
    lifecycle: {
      status: 'open',
      openedAt: decidedAt,
      lastDetectedAt: decidedAt,
    },
    severity: 'urgent',
    blocksOutcome: true,
    blocksDelivery: true,
    dedupeKey,
    revision: 1,
    correlationId: 'correlation_reconciliation_test_01',
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId: 'correlation_reconciliation_test_01',
    },
    ...extra,
  };
}

function presentAttendance(): Attendance {
  return {
    attendanceId: `attendance:v1:course-day:${enrollmentId}:${courseDayOneId}`,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId,
      courseDayId: courseDayOneId,
      occurrenceId,
      participantId,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId: 'instructor_reconciliation_test_01' },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId: 'instructor_reconciliation_test_01' },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId: 'correlation_reconciliation_test_01',
    causationId: 'seed',
  };
}

describe('courseEnrollmentReconciliationPolicy', () => {
  it('resolves stale payment_required_at_start when payment is fully funded', () => {
    const issue = openIssue('payment_required_at_start');
    expect(
      shouldResolveStalePaymentRequiredAtStartIssue({
        enrollment: courseEnrollment(),
        course: course(),
        payment: fundedPayment(),
        issue,
      })
    ).toBe(true);
  });

  it('keeps payment_required_at_start when payment remains underfunded', () => {
    const issue = openIssue('payment_required_at_start');
    expect(
      shouldResolveStalePaymentRequiredAtStartIssue({
        enrollment: courseEnrollment(),
        course: course(),
        payment: underfundedPayment(),
        issue,
      })
    ).toBe(false);
  });

  it('resolves attendance_payment_conflict when funded and present exists', () => {
    const issue = openIssue('attendance_payment_conflict');
    const attendances = new Map([[courseDayOneId, presentAttendance()]]);
    expect(
      shouldResolveStaleAttendancePaymentConflictIssue({
        enrollment: courseEnrollment(),
        course: course(),
        payment: fundedPayment(),
        issue,
        paymentRequiredAtStartStillOpen: false,
        attendancesByCourseDayId: attendances,
      })
    ).toBe(true);
  });

  it('resolves stale missing_attendance when current evidence exists', () => {
    const day = courseDay();
    const issue = openIssue('missing_attendance');
    const attendances = new Map([[courseDayOneId, presentAttendance()]]);
    expect(
      shouldResolveStaleMissingAttendanceIssue({
        enrollment: courseEnrollment(),
        course: course(),
        issue,
        attendancesByCourseDayId: attendances,
        courseDays: [day],
      })
    ).toBe(true);
  });

  it('ignores stale occurrence evidence for missing_attendance resolution', () => {
    const day = courseDay();
    const issue = openIssue('missing_attendance', {
      occurrenceId: 'occurrence:v1:course-day:stale:rev:0',
    });
    const staleAttendance: Attendance = {
      ...presentAttendance(),
      subject: {
        ...presentAttendance().subject,
        occurrenceId: 'occurrence:v1:course-day:stale:rev:0',
      },
    };
    const attendances = new Map([[courseDayOneId, staleAttendance]]);
    expect(
      shouldResolveStaleMissingAttendanceIssue({
        enrollment: courseEnrollment(),
        course: course(),
        issue,
        attendancesByCourseDayId: attendances,
        courseDays: [day],
      })
    ).toBe(false);
  });

  it('reports no mutations for canonical confirmed enrollment without stale issues', () => {
    const decision = evaluateCourseEnrollmentReconciliation({
      now: dayOneEnd,
      enrollment: courseEnrollment(),
      course: course(),
      courseDays: [courseDay()],
      payment: fundedPayment(),
      attendancesByCourseDayId: new Map(),
      openAdminIssues: [],
      automationOnly: false,
    });
    expect(courseEnrollmentReconciliationHasMutations({ decision })).toBe(false);
  });

  it('plans payment issue resolution when funded', () => {
    const decision = evaluateCourseEnrollmentReconciliation({
      now: dayOneEnd,
      enrollment: courseEnrollment(),
      course: course(),
      courseDays: [courseDay()],
      payment: fundedPayment(),
      attendancesByCourseDayId: new Map(),
      openAdminIssues: [openIssue('payment_required_at_start')],
      automationOnly: false,
    });
    expect(decision.outcome).toBe('repair');
    if (decision.outcome === 'repair') {
      expect(decision.issueResolutions.length).toBe(1);
      expect(courseEnrollmentReconciliationHasMutations({ decision })).toBe(true);
    }
  });

  it('protects pending_cancellation from reconciliation repair', () => {
    const decision = evaluateCourseEnrollmentReconciliation({
      now: dayOneEnd,
      enrollment: courseEnrollment({ status: 'pending_cancellation', requestedAt: decidedAt }),
      course: course(),
      courseDays: [courseDay()],
      payment: fundedPayment(),
      attendancesByCourseDayId: new Map([[courseDayOneId, presentAttendance()]]),
      openAdminIssues: [openIssue('payment_required_at_start')],
      automationOnly: false,
    });
    expect(decision.outcome).toBe('no_repair_pending_cancellation');
  });
});
