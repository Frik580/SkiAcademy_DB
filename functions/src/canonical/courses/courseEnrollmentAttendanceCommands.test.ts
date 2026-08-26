import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  paymentIdFromCourseEnrollmentId,
  systemCommandActor,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_course_attendance_unit_01');
const accountId = AccountIdSchema.parse('account_course_attendance_unit_01');
const adminAccountId = AccountIdSchema.parse('account_course_attendance_unit_admin');
const instructorAccountId = AccountIdSchema.parse('account_course_attendance_unit_instructor');
const participantId = ParticipantIdSchema.parse('participant_course_attendance_unit_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_attendance_unit_01');
const instructorId = InstructorIdSchema.parse('instructor_course_attendance_unit_01');
const courseId = CourseIdSchema.parse('course_course_attendance_unit_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_attendance_unit_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_attendance_unit_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_attendance_unit_03');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_course_attendance_unit_01');
const COURSE_PRICE_KZT = 50_000;
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));
const dayThreeStart = timestampFromDate(new Date('2026-02-03T03:00:00.000Z'));
const dayThreeEnd = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function instructorContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(instructorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
  };
}

function adminContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
  };
}

function seedEnrollment(status: 'confirmed' | 'pending_cancellation' = 'confirmed') {
  return {
    enrollmentId,
    participantId,
    courseId,
    originalCourseId: courseId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId },
    },
    lifecycle:
      status === 'pending_cancellation'
        ? { status: 'pending_cancellation', requestedAt: decidedAt }
        : { status: 'confirmed' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

function seedCourse() {
  return {
    courseId,
    title: 'Attendance Unit Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: 3,
      finalCourseDayEndsAt: dayThreeEnd,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

function seedCourseDay(courseDayId: typeof courseDayOneId, dayOrder: 1 | 2 | 3) {
  const intervals = {
    1: { startsAt: dayOneStart, endsAt: dayOneEnd },
    2: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
    3: { startsAt: dayThreeStart, endsAt: dayThreeEnd },
  } as const;
  return {
    courseId,
    courseDayId,
    dayOrder,
    interval: intervals[dayOrder],
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };
}

function baseFixture(extra: Record<string, unknown> = {}) {
  return {
    [`users/${accountId}`]: AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    }),
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    }),
    [`users/${instructorAccountId}`]: AccountSchema.parse({
      accountId: instructorAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    }),
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Attendance Participant',
      age: { kind: 'age_years', years: 20 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    },
    [`participant_management/${managementId}`]: {
      participantManagementId: managementId,
      participantId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach Attendance',
      avatarUrl: 'https://example.com/avatar.png',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`courses/${courseId}`]: seedCourse(),
    [`courses/${courseId}/days/${courseDayOneId}`]: seedCourseDay(courseDayOneId, 1),
    [`courses/${courseId}/days/${courseDayTwoId}`]: seedCourseDay(courseDayTwoId, 2),
    [`courses/${courseId}/days/${courseDayThreeId}`]: seedCourseDay(courseDayThreeId, 3),
    [`course_enrollments/${enrollmentId}`]: seedEnrollment(),
    [`payments/${paymentIdFromCourseEnrollmentId(enrollmentId)}`]: {
      paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
      subject: { subjectType: 'course_enrollment', subjectId: enrollmentId },
      price: COURSE_PRICE_KZT,
      paidAmount: COURSE_PRICE_KZT,
      refundedAmount: 0,
      settledAmount: COURSE_PRICE_KZT,
      outstandingAmount: 0,
      payerAccountId: accountId,
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    },
    [`users/${accountId}/wallet/state`]: WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 0,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    }),
    ...extra,
  };
}

function recordEnvelope(
  courseDayId: typeof courseDayOneId,
  attendanceStatus: 'present' | 'absent',
  idempotencyKey: string,
  expectedAttendanceRevision?: number
): CommandEnvelope<'record_course_day_attendance'> {
  return {
    kind: 'record_course_day_attendance',
    context: instructorContext(idempotencyKey),
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus,
      ...(expectedAttendanceRevision === undefined
        ? {}
        : { expectedAttendanceRevision: AggregateRevisionSchema.parse(expectedAttendanceRevision) }),
    },
  };
}

function resolveEnvelope(idempotencyKey: string): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor('system_actor_course_attendance_unit_01'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent: {
      subjectKind: 'course_enrollment',
      subjectId: enrollmentId,
    },
  };
}

describe('courseEnrollmentAttendanceCommands', () => {
  it('records deterministic attendance and keeps enrollment confirmed before final day', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'idem-course-attendance-record-01')
    );
    expect(result.status).toBe('success');
    const attendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseDayId: courseDayOneId,
    });
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`attendance/${attendanceId}`)?.data.attendanceStatus).toBe('present');
    expect(snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
    expect(
      snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data.attendanceSummary?.presentDayCount
    ).toBe(1);
  });

  it('does not terminalize before final course day end even with present evidence', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(
      environment('2026-02-02T04:00:00.000Z'),
      executor
    );
    await commands.execute(recordEnvelope(courseDayOneId, 'present', 'idem-course-attendance-day1'));
    const result = await commands.execute(
      recordEnvelope(courseDayTwoId, 'absent', 'idem-course-attendance-day2')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
  });

  it('resolves completed after final day when any day is present', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const dayOneCommands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    const dayTwoCommands = createProductionCanonicalCommands(
      environment('2026-02-02T04:00:00.000Z'),
      executor
    );
    const dayThreeCommands = createProductionCanonicalCommands(
      environment('2026-02-03T06:00:00.000Z'),
      executor
    );
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'idem-course-attendance-a'));
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'present', 'idem-course-attendance-b'));
    const result = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'absent', 'idem-course-attendance-c')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'completed'
    );
    expect(executor.snapshot().docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(7);
  });

  it('resolves no_show when all days are absent after final day', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const dayOneCommands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    const dayTwoCommands = createProductionCanonicalCommands(
      environment('2026-02-02T04:00:00.000Z'),
      executor
    );
    const dayThreeCommands = createProductionCanonicalCommands(
      environment('2026-02-03T06:00:00.000Z'),
      executor
    );
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'idem-course-attendance-ns-a'));
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'idem-course-attendance-ns-b'));
    const result = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'absent', 'idem-course-attendance-ns-c')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'no_show'
    );
  });

  it('blocks generic resolver terminalization for pending_cancellation', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`course_enrollments/${enrollmentId}`]: seedEnrollment('pending_cancellation'),
      })
    );
    const dayOneCommands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    const dayTwoCommands = createProductionCanonicalCommands(
      environment('2026-02-02T04:00:00.000Z'),
      executor
    );
    const dayThreeCommands = createProductionCanonicalCommands(
      environment('2026-02-03T06:00:00.000Z'),
      executor
    );
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'idem-course-attendance-pc-a'));
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'idem-course-attendance-pc-b'));
    const result = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'absent', 'idem-course-attendance-pc-c')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'pending_cancellation'
    );
  });

  it('system resolver creates missing issues at finalCourseDayEndsAt + 24h', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const dayOneCommands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    const dayTwoCommands = createProductionCanonicalCommands(
      environment('2026-02-02T04:00:00.000Z'),
      executor
    );
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'idem-course-attendance-sys-a'));
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'idem-course-attendance-sys-b'));
    const lateCommands = createProductionCanonicalCommands(
      environment('2026-02-04T05:00:00.000Z'),
      executor
    );
    const result = await lateCommands.execute(resolveEnvelope('idem-course-attendance-sys-late'));
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.lifecycle.status).toBe(
      'confirmed'
    );
    const issueCount = [...executor.snapshot().docs.keys()].filter((path) =>
      path.startsWith('admin_issues/')
    ).length;
    expect(issueCount).toBeGreaterThan(0);
  });

  it('rejects instructor recording before course day start', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(
      environment('2026-02-01T02:59:59.999Z'),
      executor
    );
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'idem-course-attendance-before-start')
    );
    expect(result.status).toBe('error');
  });

  it('requires admin reason when correcting attendance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const commands = createProductionCanonicalCommands(
      environment('2026-02-01T04:00:00.000Z'),
      executor
    );
    await commands.execute(recordEnvelope(courseDayOneId, 'present', 'idem-course-attendance-admin-a'));
    const result = await commands.execute({
      kind: 'record_course_day_attendance',
      context: adminContext('idem-course-attendance-admin-b'),
      intent: {
        courseEnrollmentId: enrollmentId,
        courseDayId: courseDayOneId,
        attendanceStatus: 'absent',
        expectedAttendanceRevision: AggregateRevisionSchema.parse(1),
      },
    });
    expect(result.status).toBe('error');
  });
});
