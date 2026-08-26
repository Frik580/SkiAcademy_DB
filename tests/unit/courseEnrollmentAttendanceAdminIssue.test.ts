import { describe, expect, expectTypeOf, it } from 'vitest';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import {
  AccountIdSchema,
  ActiveCourseEnrollmentGuardKeySchema,
  AdminIssueIdSchema,
  AdminIssueKindSchema,
  AdminIssueLifecycleStatusSchema,
  AdminIssueSchema,
  AttendanceIdSchema,
  AttendanceSchema,
  AttendanceStatusSchema,
  BookingIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseEnrollmentAttendanceSummarySchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  LegacyCourseEnrollmentBookingShapeSchema,
  LegacyCourseScheduleShapeSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  StructuredCourseDeliverySchema,
  UnknownAttendanceStatusShapeSchema,
  WholeCourseCancellationShapeSchema,
  activeCourseEnrollmentGuardKey,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  attendanceIdFromBookingIdentity,
  attendanceIdFromCourseDayIdentity,
  attendanceSummaryIsDerivedProjection,
  bookingAttendanceIdentityKey,
  containsCourseEnrollmentBookingShapeFields,
  containsLegacyCourseScheduleFields,
  containsWholeCourseCancellationFields,
  courseDayAttendanceIdentityKey,
  courseEnrollmentBelongsToExactlyOneParticipant,
  enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair,
  missingAttendanceIsDocumentAbsence,
  timestampFromDate,
  validateCanonical,
  type AdminIssueId,
  type AttendanceId,
  type BookingId,
  type CourseDayId,
  type CourseEnrollmentId,
  type CourseId,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';

const timestamp = (value: string) => timestampFromDate(new Date(value));

const audit = {
  createdByCommandId: 'command_course_test_create',
  lastChangedByCommandId: 'command_course_test_create',
  correlationId: 'correlation_course_test_create',
};

const metadata = {
  revision: 1,
  createdAt: timestamp('2026-01-01T00:00:00.000Z'),
  updatedAt: timestamp('2026-01-01T00:00:00.000Z'),
  audit,
};

const courseId = CourseIdSchema.parse('course_test_01');
const courseDayId = CourseDayIdSchema.parse('course_day_test_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_test_01');
const participantId = ParticipantIdSchema.parse('participant_course_test_01');
const instructorId = InstructorIdSchema.parse('instructor_course_test_01');
const paymentId = PaymentIdSchema.parse('payment_course_test_01');
const accountId = AccountIdSchema.parse('account_course_test_01');

function baseCourse(overrides: Record<string, unknown> = {}) {
  return {
    courseId,
    title: 'Course test',
    price: 25_000,
    capacity: { totalSeats: 8, availableSeats: 4 },
    instructorRosterIds: [instructorId],
    startAt: timestamp('2026-02-01T04:00:00.000Z'),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestamp('2026-02-01T08:00:00.000Z'),
      courseScheduleRevision: 1,
    },
    ...metadata,
    ...overrides,
  };
}

function baseCourseDay(overrides: Record<string, unknown> = {}) {
  return {
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: {
      startsAt: timestamp('2026-02-01T04:00:00.000Z'),
      endsAt: timestamp('2026-02-01T08:00:00.000Z'),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    ...metadata,
    ...overrides,
  };
}

function baseEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    enrollmentId,
    participantId,
    courseId,
    originalCourseId: courseId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId },
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    payerAccountId: accountId,
    ...metadata,
    ...overrides,
  };
}

describe('canonical course delivery fixtures', () => {
  it('publishes course, course days, enrollment, attendance, and admin issue fixtures', () => {
    expect(canonicalCourseDeliveryFixtures.course.scheduleProjection.courseDayCount).toBe(2);
    expect(canonicalCourseDeliveryFixtures.courseDays).toHaveLength(2);
    expect(canonicalCourseDeliveryFixtures.confirmedEnrollment.lifecycle.status).toBe('confirmed');
    expect(canonicalCourseDeliveryFixtures.presentCourseDayAttendance.attendanceStatus).toBe(
      'present'
    );
    expect(canonicalCourseDeliveryFixtures.openAdminIssue.lifecycle.status).toBe('open');
  });
});

describe('Course and CourseDay contracts', () => {
  it('accepts a valid Course', () => {
    expect(CourseSchema.safeParse(baseCourse()).success).toBe(true);
  });

  it('accepts structured CourseDays with half-open intervals', () => {
    expect(CourseDaySchema.safeParse(baseCourseDay()).success).toBe(true);
  });

  it('rejects invalid capacity and synthetic instructor roster IDs', () => {
    expect(
      CourseSchema.safeParse(
        baseCourse({
          capacity: { totalSeats: 8, availableSeats: 9 },
        })
      ).success
    ).toBe(false);
    expect(
      CourseSchema.safeParse(
        baseCourse({
          instructorRosterIds: ['course_course_test_01'],
        })
      ).success
    ).toBe(false);
  });

  it('rejects legacy free-form Course schedule fields', () => {
    expect(containsLegacyCourseScheduleFields({ dates: 'Feb 1-2' })).toBe(true);
    expect(LegacyCourseScheduleShapeSchema.safeParse({ dates: 'Feb 1-2' }).success).toBe(false);
  });

  it('rejects invalid CourseDay intervals', () => {
    expect(
      CourseDaySchema.safeParse(
        baseCourseDay({
          interval: {
            startsAt: timestamp('2026-02-01T08:00:00.000Z'),
            endsAt: timestamp('2026-02-01T04:00:00.000Z'),
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects duplicate CourseDays in structured delivery', () => {
    expect(
      StructuredCourseDeliverySchema.safeParse({
        course: baseCourse(),
        courseDays: [baseCourseDay(), baseCourseDay()],
      }).success
    ).toBe(false);
  });

  it('rejects whole-Course cancellation fields', () => {
    expect(containsWholeCourseCancellationFields({ wholeCourseCancelled: true })).toBe(true);
    expect(
      WholeCourseCancellationShapeSchema.safeParse({ wholeCourseCancelled: true }).success
    ).toBe(false);
  });
});

describe('CourseEnrollment contracts', () => {
  it('accepts a valid CourseEnrollment', () => {
    expect(CourseEnrollmentSchema.safeParse(baseEnrollment()).success).toBe(true);
  });

  it('belongs to exactly one Participant', () => {
    expect(courseEnrollmentBelongsToExactlyOneParticipant({ participantId })).toBe(true);
  });

  it('keeps enrollmentId opaque and not derived from participant/course pair', () => {
    expect(
      enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair(
        enrollmentId,
        participantId,
        courseId
      )
    ).toBe(true);
    expect(
      enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair(
        CourseEnrollmentIdSchema.parse(`booking_course_${participantId}_${courseId}`),
        participantId,
        courseId
      )
    ).toBe(false);
  });

  it('supports transfer-compatible identity by preserving enrollmentId with a different courseId', () => {
    const transferred = CourseEnrollmentSchema.parse(
      baseEnrollment({
        courseId: CourseIdSchema.parse('course_test_transfer_target'),
        originalCourseId: courseId,
      })
    );
    expect(transferred.enrollmentId).toBe(enrollmentId);
    expect(transferred.courseId).not.toBe(transferred.originalCourseId);
  });

  it('rejects CourseEnrollment-as-Booking shapes', () => {
    expect(
      containsCourseEnrollmentBookingShapeFields({
        bookingId: 'booking_test_01',
        party: { kind: 'individual', participantIds: [participantId] },
      })
    ).toBe(true);
    expect(
      LegacyCourseEnrollmentBookingShapeSchema.safeParse({
        instructorId: 'course_course_test_01',
      }).success
    ).toBe(false);
  });

  it('rejects inconsistent attendance summaries on enrollment', () => {
    expect(
      CourseEnrollmentSchema.safeParse(
        baseEnrollment({
          attendanceSummary: {
            recordedDayCount: 2,
            presentDayCount: 1,
            absentDayCount: 0,
            projectionRevision: 1,
          },
        })
      ).success
    ).toBe(false);
  });

  it('keeps active participant+course guard identity deterministic', () => {
    const first = activeCourseEnrollmentGuardKey(participantId, courseId);
    const second = activeCourseEnrollmentGuardKey(participantId, courseId);
    expect(first).toBe(second);
    expect(ActiveCourseEnrollmentGuardKeySchema.safeParse(first).success).toBe(true);
    expect(
      activeCourseEnrollmentGuardKey(participantId, CourseIdSchema.parse('course_test_02'))
    ).not.toBe(first);
  });

  it('validates attendance summary against course day count in structured delivery', () => {
    expect(
      StructuredCourseDeliverySchema.safeParse({
        course: baseCourse(),
        courseDays: [baseCourseDay()],
        enrollment: baseEnrollment({
          attendanceSummary: {
            recordedDayCount: 2,
            presentDayCount: 1,
            absentDayCount: 1,
            projectionRevision: 1,
          },
        }),
      }).success
    ).toBe(false);
  });

  it('allows partial attendance recording while other days remain unknown', () => {
    const courseDays = Array.from({ length: 5 }, (_, index) =>
      baseCourseDay({
        courseDayId: CourseDayIdSchema.parse(`course_day_test_0${index + 1}`),
        dayOrder: index + 1,
        interval: {
          startsAt: timestamp(`2026-02-0${index + 1}T04:00:00.000Z`),
          endsAt: timestamp(`2026-02-0${index + 1}T08:00:00.000Z`),
        },
      })
    );

    expect(
      StructuredCourseDeliverySchema.safeParse({
        course: baseCourse({
          scheduleProjection: {
            courseDayCount: 5,
            finalCourseDayEndsAt: timestamp('2026-02-05T08:00:00.000Z'),
            courseScheduleRevision: 1,
          },
        }),
        courseDays,
        enrollment: baseEnrollment({
          attendanceSummary: {
            recordedDayCount: 3,
            presentDayCount: 2,
            absentDayCount: 1,
            projectionRevision: 1,
          },
        }),
      }).success
    ).toBe(true);
  });
});

describe('Attendance contracts', () => {
  const occurrenceId = OccurrenceIdSchema.parse('occurrence_course_test_01');
  const bookingId = BookingIdSchema.parse('booking_course_test_01');

  it('accepts valid present and absent Attendance', () => {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: 'attendance:v1',
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });

    expect(
      AttendanceSchema.safeParse({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: timestamp('2026-02-01T08:00:00.000Z'),
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: timestamp('2026-02-01T08:00:00.000Z'),
        revision: 1,
        correlationId: 'correlation_attendance_test',
      }).success
    ).toBe(true);

    expect(
      AttendanceSchema.safeParse({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId,
        },
        attendanceStatus: 'absent',
        recordedBy: { kind: 'administrator', accountId },
        recordedAt: timestamp('2026-02-01T08:00:00.000Z'),
        lastChangedBy: { kind: 'administrator', accountId },
        updatedAt: timestamp('2026-02-01T08:00:00.000Z'),
        revision: 1,
        correlationId: 'correlation_attendance_test',
      }).success
    ).toBe(true);
  });

  it('rejects explicit unknown Attendance status', () => {
    expect(
      UnknownAttendanceStatusShapeSchema.safeParse({ attendanceStatus: 'unknown' }).success
    ).toBe(false);
    expect(AttendanceStatusSchema.safeParse('unknown').success).toBe(false);
  });

  it('represents missing Attendance by document absence, not status', () => {
    expect(missingAttendanceIsDocumentAbsence()).toBe(true);
  });

  it('derives deterministic Booking and CourseDay Attendance identities', () => {
    expect(bookingAttendanceIdentityKey({ occurrenceId, participantId })).toBe(
      `attendance:v1:booking:${occurrenceId}:${participantId}`
    );
    expect(courseDayAttendanceIdentityKey({ enrollmentId, courseDayId })).toBe(
      `attendance:v1:course-day:${enrollmentId}:${courseDayId}`
    );

    const bookingAttendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: 'attendance:v1',
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });
    const courseAttendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: 'attendance:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseDayId,
    });

    expect(
      attendanceIdFromBookingIdentity({
        strategyVersion: 'attendance:v1',
        subjectKind: 'booking',
        occurrenceId,
        participantId,
      })
    ).toBe(bookingAttendanceId);
    expect(
      attendanceIdFromCourseDayIdentity({
        strategyVersion: 'attendance:v1',
        subjectKind: 'course_enrollment',
        enrollmentId,
        courseDayId: CourseDayIdSchema.parse('course_day_test_02'),
      })
    ).not.toBe(courseAttendanceId);
  });

  it('rejects wrong subject and identity combinations', () => {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: 'attendance:v1',
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });

    expect(
      AttendanceSchema.safeParse({
        attendanceId,
        subject: {
          subjectKind: 'course_enrollment',
          enrollmentId,
          courseId,
          courseDayId,
          occurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: timestamp('2026-02-01T08:00:00.000Z'),
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: timestamp('2026-02-01T08:00:00.000Z'),
        revision: 1,
        correlationId: 'correlation_attendance_test',
      }).success
    ).toBe(false);
  });

  it('keeps Attendance summary as a derived projection, not authoritative evidence', () => {
    const summary = CourseEnrollmentAttendanceSummarySchema.parse({
      recordedDayCount: 2,
      presentDayCount: 1,
      absentDayCount: 1,
      projectionRevision: 1,
    });
    expect(attendanceSummaryIsDerivedProjection(summary)).toBe(true);
  });

  it('round-trips strict Attendance serialization variants', () => {
    const parsed = AttendanceSchema.parse(
      canonicalCourseDeliveryFixtures.presentCourseDayAttendance
    );
    expect(parsed).toEqual(canonicalCourseDeliveryFixtures.presentCourseDayAttendance);
    expect(validateCanonical(AttendanceSchema, parsed).ok).toBe(true);
  });
});

describe('AdminIssue contracts', () => {
  it('derives deterministic issue identity from dedupe key', () => {
    const identity = {
      strategyVersion: 'issue:v1' as const,
      kind: 'missing_attendance' as const,
      subjectKind: 'course_enrollment' as const,
      subjectId: enrollmentId,
      participantId,
      courseDayId,
    };
    const dedupeKey = adminIssueDedupeKeyFromIdentity(identity);
    const issueId = adminIssueIdFromDedupeKey(dedupeKey);
    expect(adminIssueDedupeKeyFromIdentity(identity)).toBe(dedupeKey);
    expect(adminIssueIdFromDedupeKey(dedupeKey)).toBe(issueId);
    expect(
      adminIssueIdFromDedupeKey(
        adminIssueDedupeKeyFromIdentity({
          strategyVersion: 'issue:v1',
          kind: 'payment_required_at_start',
          subjectKind: 'course_enrollment',
          subjectId: enrollmentId,
        })
      )
    ).not.toBe(issueId);
  });

  it('rejects arbitrary caller-supplied dedupe keys', () => {
    const derivedKey = adminIssueDedupeKeyFromIdentity({
      strategyVersion: 'issue:v1',
      kind: 'missing_attendance',
      subjectKind: 'course_enrollment',
      subjectId: enrollmentId,
      participantId,
      courseDayId,
    });

    expect(
      AdminIssueSchema.safeParse({
        issueId: adminIssueIdFromDedupeKey(derivedKey),
        kind: 'missing_attendance',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
        participantId,
        courseDayId,
        lifecycle: {
          status: 'open',
          openedAt: timestamp('2026-02-01T08:00:00.000Z'),
          lastDetectedAt: timestamp('2026-02-01T08:00:00.000Z'),
        },
        severity: 'normal',
        blocksOutcome: true,
        blocksDelivery: false,
        dedupeKey: 'issue:v1:missing_attendance:course_enrollment:arbitrary_caller_key',
        correlationId: 'correlation_course_test_create',
        ...metadata,
      }).success
    ).toBe(false);
  });

  it('accepts open, resolved, and dismissed lifecycle variants', () => {
    const dedupeKey = adminIssueDedupeKeyFromIdentity({
      strategyVersion: 'issue:v1',
      kind: 'unresolved_pending_cancellation',
      subjectKind: 'course_enrollment',
      subjectId: enrollmentId,
    });

    expect(
      AdminIssueSchema.safeParse({
        issueId: adminIssueIdFromDedupeKey(dedupeKey),
        kind: 'unresolved_pending_cancellation',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
        lifecycle: {
          status: 'open',
          openedAt: timestamp('2026-02-01T08:00:00.000Z'),
          lastDetectedAt: timestamp('2026-02-01T08:00:00.000Z'),
        },
        severity: 'urgent',
        blocksOutcome: true,
        blocksDelivery: true,
        dedupeKey,
        correlationId: 'correlation_course_test_create',
        ...metadata,
      }).success
    ).toBe(true);

    expect(
      AdminIssueSchema.safeParse({
        issueId: adminIssueIdFromDedupeKey(dedupeKey),
        kind: 'unresolved_pending_cancellation',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
        lifecycle: {
          status: 'resolved',
          openedAt: timestamp('2026-02-01T08:00:00.000Z'),
          lastDetectedAt: timestamp('2026-02-01T09:00:00.000Z'),
          resolvedAt: timestamp('2026-02-01T10:00:00.000Z'),
          resolution: {
            reason: 'Resolved pending cancellation.',
            resolvedByAccountId: accountId,
          },
        },
        severity: 'urgent',
        blocksOutcome: true,
        blocksDelivery: true,
        dedupeKey,
        correlationId: 'correlation_course_test_create',
        ...metadata,
      }).success
    ).toBe(true);

    expect(
      AdminIssueSchema.safeParse({
        issueId: adminIssueIdFromDedupeKey(dedupeKey),
        kind: 'unresolved_pending_cancellation',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
        lifecycle: {
          status: 'dismissed',
          openedAt: timestamp('2026-02-01T08:00:00.000Z'),
          lastDetectedAt: timestamp('2026-02-01T09:00:00.000Z'),
          resolvedAt: timestamp('2026-02-01T10:00:00.000Z'),
          resolution: {
            reason: 'Dismissed after review.',
            resolvedByAccountId: accountId,
          },
        },
        severity: 'normal',
        blocksOutcome: false,
        blocksDelivery: false,
        dedupeKey,
        correlationId: 'correlation_course_test_create',
        ...metadata,
      }).success
    ).toBe(true);
  });

  it('rejects invalid lifecycle combinations and unknown kinds', () => {
    const dedupeKey = adminIssueDedupeKeyFromIdentity({
      strategyVersion: 'issue:v1',
      kind: 'missing_attendance',
      subjectKind: 'booking',
      subjectId: BookingIdSchema.parse('booking_course_test_01'),
    });

    expect(
      AdminIssueSchema.safeParse({
        issueId: adminIssueIdFromDedupeKey(dedupeKey),
        kind: 'missing_attendance',
        subjectRef: {
          subjectKind: 'booking',
          bookingId: BookingIdSchema.parse('booking_course_test_01'),
        },
        lifecycle: {
          status: 'resolved',
          openedAt: timestamp('2026-02-01T08:00:00.000Z'),
          lastDetectedAt: timestamp('2026-02-01T08:00:00.000Z'),
        },
        severity: 'normal',
        blocksOutcome: true,
        blocksDelivery: false,
        dedupeKey,
        correlationId: 'correlation_course_test_create',
        ...metadata,
      }).success
    ).toBe(false);

    expect(AdminIssueLifecycleStatusSchema.safeParse('reopened').success).toBe(false);
    expect(AdminIssueKindSchema.safeParse('legacy_issue_kind').success).toBe(false);
  });

  it('validates blocking and severity metadata without lifecycle mutation behavior', () => {
    expect(canonicalCourseDeliveryFixtures.openAdminIssue.blocksOutcome).toBe(true);
    expect(canonicalCourseDeliveryFixtures.openAdminIssue.severity).toBe('normal');
    expect(AdminIssueSchema.safeParse(canonicalCourseDeliveryFixtures.openAdminIssue).success).toBe(
      true
    );
  });
});

describe('compile-time branded ID boundaries', () => {
  it('keeps aggregate IDs nominally distinct', () => {
    const bookingId = BookingIdSchema.parse('booking_course_test_01');
    const courseEnrollment = CourseEnrollmentIdSchema.parse('course_enrollment_test_01');
    const courseDay = CourseDayIdSchema.parse('course_day_test_01');
    const attendance = AttendanceIdSchema.parse('attendance_course_test_01');
    const participant = ParticipantIdSchema.parse('participant_course_test_01');
    const instructor = InstructorIdSchema.parse('instructor_course_test_01');
    const adminIssue = AdminIssueIdSchema.parse('admin_issue_course_test_01');

    expectTypeOf(bookingId).toEqualTypeOf<BookingId>();
    expectTypeOf(courseEnrollment).toEqualTypeOf<CourseEnrollmentId>();
    expectTypeOf(courseDay).toEqualTypeOf<CourseDayId>();
    expectTypeOf(attendance).toEqualTypeOf<AttendanceId>();
    expectTypeOf(participant).toEqualTypeOf<ParticipantId>();
    expectTypeOf(instructor).toEqualTypeOf<InstructorId>();
    expectTypeOf(adminIssue).toEqualTypeOf<AdminIssueId>();

    expectTypeOf<BookingId>().not.toEqualTypeOf<CourseEnrollmentId>();
    expectTypeOf<AttendanceId>().not.toEqualTypeOf<AdminIssueId>();
  });
});
