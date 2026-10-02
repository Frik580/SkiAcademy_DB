import { describe, expect, it, vi } from 'vitest';
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
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  WalletSchema,
  testCanonicalExecutionScope,
  activityLogIdFromCommandId,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  monetaryEventIdFromCommandEffect,
  monetaryEventIdFromCourseEnrollmentInitialCharge,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  estimateTransactionPlan,
  TransactionPlanBuilder,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_course_enrollment_cmd_01');
const accountId = AccountIdSchema.parse('account_course_enrollment_cmd_01');
const participantId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_enrollment_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_course_enrollment_cmd_01');
const courseId = CourseIdSchema.parse('course_course_enrollment_cmd_01');
const courseDayId = CourseDayIdSchema.parse('course_day_enrollment_cmd_01');
const COURSE_PRICE_KZT = 50_000;
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(
  capability: 'account_owner' | 'parent_guardian' | 'administrator',
  actorAccountId = accountId,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 10)}`
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source:
      capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function seedAccount(account = accountId) {
  return AccountSchema.parse({
    accountId: account,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

function seedParticipant() {
  return {
    participantId,
    displayName: 'Course Enrollment Participant',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
      correlationId,
    },
  };
}

function seedManagement(account = accountId) {
  return {
    participantManagementId: managementId,
    participantId,
    accountId: account,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_management',
      lastChangedByCommandId: 'command_seed_management',
      correlationId,
    },
  };
}

function seedInstructor() {
  return {
    id: instructorId,
    name: 'Coach Enrollment',
    avatarUrl: 'https://example.com/avatar.png',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  };
}

function seedWallet(balance: number, account = accountId) {
  return WalletSchema.parse({
    accountId: account,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function seedCourse() {
  return {
    courseId,
    title: 'Enrollment Command Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId],
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
      createdByCommandId: 'command_seed_course',
      lastChangedByCommandId: 'command_seed_course',
      correlationId,
    },
  };
}

function seedCourseDay() {
  return {
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_course_day',
      lastChangedByCommandId: 'command_seed_course_day',
      correlationId,
    },
  };
}

function baseFixture(extra: Record<string, unknown> = {}) {
  return {
    [`users/${accountId}`]: seedAccount(),
    [`participants/${participantId}`]: seedParticipant(),
    [`participant_management/${managementId}`]: seedManagement(),
    [`instructors/${instructorId}`]: seedInstructor(),
    [`users/${accountId}/wallet/state`]: seedWallet(100_000),
    [`courses/${courseId}`]: seedCourse(),
    [`courses/${courseId}/days/${courseDayId}`]: seedCourseDay(),
    ...extra,
  };
}

function createEnvelope(
  overrides: Partial<CommandEnvelope<'create_course_enrollments'>> = {}
): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: accountContext('account_owner', accountId, 'enrollment-create-01'),
    intent: {
      courseId,
      participantIds: [participantId],
    },
    ...overrides,
  };
}

async function runCommand(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<'create_course_enrollments'>
) {
  const commands = createProductionCanonicalCommands(environment(), executor);
  return commands.execute(envelope);
}

describe('create_course_enrollments command', () => {
  it('creates a fully funded single-participant enrollment with payment, claims, and audit', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const envelope = createEnvelope();
    const result = await runCommand(executor, envelope);
    expect(result.status).toBe('success');

    const identity = resolveCommandIdempotencyIdentity(envelope);
    const enrollmentId = courseEnrollmentIdFromCommandParticipant({
      commandId: identity.commandKey,
      participantId,
    });
    const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
    const snapshot = executor.snapshot();

    const enrollment = snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data;
    expect(enrollment?.lifecycle).toEqual({ status: 'confirmed' });
    expect(enrollment?.attribution).toEqual({
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId },
    });
    expect(snapshot.docs.has(`payments/${paymentId}`)).toBe(true);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(7);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      100_000 - COURSE_PRICE_KZT
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
    expect(
      [...snapshot.docs.keys()].filter((path) =>
        path.startsWith('active_course_enrollment_guards/')
      ).length
    ).toBe(1);
    expect(
      snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCourseEnrollmentInitialCharge(enrollmentId)}`
      )
    ).toBe(true);
  });

  it('replays a different idempotency key for the same enrollmentId without a second debit', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_stable_payment_identity_01');
    const first = await runCommand(
      executor,
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-stable-a'),
        intent: { courseId, participantIds: [participantId], enrollmentIds: [enrollmentId] },
      })
    );
    const second = await runCommand(
      executor,
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-stable-b'),
        intent: { courseId, participantIds: [participantId], enrollmentIds: [enrollmentId] },
      })
    );
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCourseEnrollmentInitialCharge(enrollmentId)}`
      )
    ).toBe(true);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(7);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      100_000 - COURSE_PRICE_KZT
    );
  });

  it('retries after a completed enrollment payment as equivalent success', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_retry_after_paid_01');
    const firstEnvelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'enrollment-retry-first'),
      intent: { courseId, participantIds: [participantId], enrollmentIds: [enrollmentId] },
    });
    expect(await runCommand(executor, firstEnvelope)).toMatchObject({
      status: 'success',
      payload: { outcome: 'created' },
    });
    // Same idempotency key replays the stored success payload.
    expect(await runCommand(executor, firstEnvelope)).toMatchObject({
      status: 'success',
      payload: { outcome: 'created' },
    });
    expect(
      await runCommand(
        executor,
        createEnvelope({
          context: accountContext('account_owner', accountId, 'enrollment-retry-after-paid'),
          intent: { courseId, participantIds: [participantId], enrollmentIds: [enrollmentId] },
        })
      )
    ).toMatchObject({
      status: 'success',
      payload: { outcome: 'already_exists' },
    });

    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      100_000 - COURSE_PRICE_KZT
    );
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(7);
  });

  it('rejects account self-service enrollment when wallet funds are insufficient', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`users/${accountId}/wallet/state`]: seedWallet(1_000),
      })
    );
    const result = await runCommand(executor, createEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('insufficient_funds');
    }

    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(0);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/')).length).toBe(0);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(0);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(8);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(1_000);
  });

  it('rejects duplicate participantIds in the same command', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await runCommand(
      executor,
      createEnvelope({
        intent: { courseId, participantIds: [participantId, participantId] },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/'))
        .length
    ).toBe(0);
  });

  it('rejects enrollment when exercised capability does not match participant authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const result = await runCommand(
      executor,
      createEnvelope({
        context: accountContext('parent_guardian', accountId, 'enrollment-forbidden-01'),
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/'))
        .length
    ).toBe(0);
  });

  it('replays the same idempotency key without duplicate writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture());
    const envelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'enrollment-replay-01'),
    });
    const first = await runCommand(executor, envelope);
    const second = await runCommand(executor, envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/'))
        .length
    ).toBe(1);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/'))
        .length
    ).toBe(1);
  });

  it('does not duplicate writes when the transaction callback retries', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(), {
      simulateRetry: true,
    });
    const result = await runCommand(executor, createEnvelope());
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/')).length).toBe(1);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/')).length
    ).toBe(2);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });

  it('commits multi-child enrollment atomically when fully funded', async () => {
    const participantTwoId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_02');
    const managementTwoId = ParticipantManagementIdSchema.parse(
      'management_course_enrollment_cmd_02'
    );
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participants/${participantTwoId}`]: {
          ...seedParticipant(),
          participantId: participantTwoId,
          displayName: 'Second Enrollment Participant',
          management: { kind: 'managed', participantManagementId: managementTwoId },
        },
        [`participant_management/${managementTwoId}`]: {
          ...seedManagement(),
          participantManagementId: managementTwoId,
          participantId: participantTwoId,
        },
        [`users/${accountId}/wallet/state`]: seedWallet(COURSE_PRICE_KZT * 2),
      })
    );
    const result = await runCommand(
      executor,
      createEnvelope({
        intent: { courseId, participantIds: [participantId, participantTwoId] },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(2);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/')).length).toBe(2);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(6);
  });

  it('keeps a three-participant fifteen-day enrollment atomic and within the transaction budget', async () => {
    const participantTwoId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_02');
    const participantThreeId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_03');
    const managementTwoId = ParticipantManagementIdSchema.parse(
      'management_course_enrollment_cmd_02'
    );
    const managementThreeId = ParticipantManagementIdSchema.parse(
      'management_course_enrollment_cmd_03'
    );
    const courseDayCount = 15;
    const extra: Record<string, unknown> = {
      [`participants/${participantTwoId}`]: {
        ...seedParticipant(),
        participantId: participantTwoId,
        management: { kind: 'managed', participantManagementId: managementTwoId },
      },
      [`participant_management/${managementTwoId}`]: {
        ...seedManagement(),
        participantManagementId: managementTwoId,
        participantId: participantTwoId,
      },
      [`participants/${participantThreeId}`]: {
        ...seedParticipant(),
        participantId: participantThreeId,
        management: { kind: 'managed', participantManagementId: managementThreeId },
      },
      [`participant_management/${managementThreeId}`]: {
        ...seedManagement(),
        participantManagementId: managementThreeId,
        participantId: participantThreeId,
      },
      [`users/${accountId}/wallet/state`]: seedWallet(COURSE_PRICE_KZT * 3),
      [`courses/${courseId}`]: {
        ...seedCourse(),
        scheduleProjection: {
          courseDayCount,
          finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-15T05:00:00.000Z')),
          courseScheduleRevision: 1,
        },
      },
    };
    for (let dayOrder = 2; dayOrder <= courseDayCount; dayOrder += 1) {
      const dayId = CourseDayIdSchema.parse(
        `course_day_enrollment_cmd_${String(dayOrder).padStart(2, '0')}`
      );
      const dayStart = new Date(Date.UTC(2026, 1, dayOrder, 3));
      extra[`courses/${courseId}/days/${dayId}`] = {
        ...seedCourseDay(),
        courseDayId: dayId,
        dayOrder,
        interval: {
          startsAt: timestampFromDate(dayStart),
          endsAt: timestampFromDate(new Date(dayStart.getTime() + 2 * 60 * 60 * 1000)),
        },
      };
    }

    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(extra));
    const capturedPlans: ReturnType<TransactionPlanBuilder['build']>[] = [];
    const originalBuild = TransactionPlanBuilder.prototype.build;
    const buildSpy = vi
      .spyOn(TransactionPlanBuilder.prototype, 'build')
      .mockImplementation(function () {
        const plan = originalBuild.call(this);
        capturedPlans.push(plan);
        return plan;
      });
    const envelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'enrollment-three-participant-budget'),
      intent: { courseId, participantIds: [participantId, participantTwoId, participantThreeId] },
    });
    let result: Awaited<ReturnType<typeof runCommand>>;
    try {
      result = await runCommand(executor, envelope);
    } finally {
      buildSpy.mockRestore();
    }
    expect(capturedPlans.length).toBeGreaterThan(0);
    expect(result!.status).toBe('success');

    const estimate = estimateTransactionPlan(capturedPlans[0]!);
    expect(estimate).toMatchObject({
      readCount: 216,
      mutationCount: 204,
      estimatedPayloadBytes: 231_872,
      estimatedIndexImpactBytes: 0,
      totalEstimatedBytes: 231_872,
    });
    expect(estimate.byCategory.resource_guard.reads).toBe(136);
    expect(estimate.byCategory.resource_guard.mutations).toBe(136);
    const resourceGuardReads = capturedPlans[0]!.reads.filter(
      (read) => read.category === 'resource_guard'
    );
    const resourceGuardMutations = capturedPlans[0]!.mutations.filter(
      (mutation) => mutation.category === 'resource_guard'
    );
    expect(new Set(resourceGuardReads.map((read) => read.path)).size).toBe(
      resourceGuardReads.length
    );
    expect(new Set(resourceGuardMutations.map((mutation) => mutation.path)).size).toBe(
      resourceGuardMutations.length
    );

    const snapshot = executor.snapshot();
    const enrollments = [...snapshot.docs.entries()]
      .filter(([path]) => path.startsWith('course_enrollments/'))
      .map(([, document]) => document.data);
    const payments = [...snapshot.docs.entries()]
      .filter(([path]) => path.startsWith('payments/'))
      .map(([, document]) => document.data);
    const participants = [participantId, participantTwoId, participantThreeId];
    expect(enrollments).toHaveLength(3);
    expect(payments).toHaveLength(3);
    for (const participant of participants) {
      const enrollment = enrollments.find((item) => item.participantId === participant);
      expect(enrollment).toBeDefined();
      const payment = payments.find((item) => item.paymentId === enrollment?.paymentId);
      expect(payment?.price).toBe(COURSE_PRICE_KZT);
      expect(payment?.subjectId).toBe(enrollment?.enrollmentId);
    }
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/'))
    ).toHaveLength(3);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/'))
    ).toHaveLength(3 * (courseDayCount + 1));
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(5);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(0);

    expect((await runCommand(executor, envelope)).status).toBe('success');
    const replay = executor.snapshot();
    expect(
      [...replay.docs.keys()].filter((path) => path.startsWith('course_enrollments/'))
    ).toHaveLength(3);
    expect([...replay.docs.keys()].filter((path) => path.startsWith('payments/'))).toHaveLength(3);
    expect(replay.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(5);
    expect(replay.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(0);
  });

  it('does not partially enroll three participants when the wallet funds only two', async () => {
    const participantTwoId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_02');
    const participantThreeId = ParticipantIdSchema.parse('participant_course_enrollment_cmd_03');
    const managementTwoId = ParticipantManagementIdSchema.parse(
      'management_course_enrollment_cmd_02'
    );
    const managementThreeId = ParticipantManagementIdSchema.parse(
      'management_course_enrollment_cmd_03'
    );
    const executor = createInMemoryCanonicalTransactionExecutor(
      baseFixture({
        [`participants/${participantTwoId}`]: {
          ...seedParticipant(),
          participantId: participantTwoId,
          management: { kind: 'managed', participantManagementId: managementTwoId },
        },
        [`participant_management/${managementTwoId}`]: {
          ...seedManagement(),
          participantManagementId: managementTwoId,
          participantId: participantTwoId,
        },
        [`participants/${participantThreeId}`]: {
          ...seedParticipant(),
          participantId: participantThreeId,
          management: { kind: 'managed', participantManagementId: managementThreeId },
        },
        [`participant_management/${managementThreeId}`]: {
          ...seedManagement(),
          participantManagementId: managementThreeId,
          participantId: participantThreeId,
        },
        [`users/${accountId}/wallet/state`]: seedWallet(COURSE_PRICE_KZT * 2),
      })
    );

    const result = await runCommand(
      executor,
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-three-participant-wallet'),
        intent: {
          courseId,
          participantIds: [participantId, participantTwoId, participantThreeId],
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('insufficient_funds');

    const snapshot = executor.snapshot();
    expect(snapshot.writesAttempted).toBe(0);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/'))
    ).toHaveLength(0);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/'))).toHaveLength(
      0
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('resource_claims/'))
    ).toHaveLength(0);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(8);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      COURSE_PRICE_KZT * 2
    );
  });

  it('decrements only the TEST course when a TEST enrollment is created', async () => {
    const sessionId = TestSessionIdSchema.parse('test_enrollment_capacity_a01');
    const testCourseId = CourseIdSchema.parse('course_enrollment_capacity_test');
    const liveCourseId = CourseIdSchema.parse('course_enrollment_capacity_live');
    const testDayId = CourseDayIdSchema.parse('course_day_enrollment_capacity_test');
    const scope = { dataScope: 'test' as const, testSessionId: sessionId };
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: { ...seedAccount(), ...scope },
      [`participants/${participantId}`]: { ...seedParticipant(), ...scope },
      [`participant_management/${managementId}`]: seedManagement(),
      [`instructors/${instructorId}`]: { ...seedInstructor(), ...scope },
      [`users/${accountId}/wallet/state`]: { ...seedWallet(100_000), ...scope },
      [`courses/${testCourseId}`]: {
        ...seedCourse(),
        courseId: testCourseId,
        ...scope,
      },
      [`courses/${testCourseId}/days/${testDayId}`]: {
        ...seedCourseDay(),
        courseId: testCourseId,
        courseDayId: testDayId,
        ...scope,
      },
      [`courses/${liveCourseId}`]: {
        ...seedCourse(),
        courseId: liveCourseId,
        dataScope: 'live',
      },
      [`courses/${liveCourseId}/days/${courseDayId}`]: {
        ...seedCourseDay(),
        courseId: liveCourseId,
      },
    });
    const commands = createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
        scope: testCanonicalExecutionScope(sessionId),
      },
      executor
    );
    const envelope = createEnvelope({
      context: accountContext('account_owner', accountId, 'enrollment-test-capacity-01'),
      intent: { courseId: testCourseId, participantIds: [participantId] },
    });
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`courses/${testCourseId}`)?.data.capacity.availableSeats).toBe(7);
    expect(snapshot.docs.get(`courses/${liveCourseId}`)?.data.capacity.availableSeats).toBe(8);
    const enrollments = [...snapshot.docs.entries()].filter(([path]) =>
      path.startsWith('course_enrollments/')
    );
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]?.[1].data).toMatchObject({
      dataScope: 'test',
      testSessionId: sessionId,
    });
  });

  it('accepts a persistent TestActor payer and decrements only the TEST course', async () => {
    const sessionId = TestSessionIdSchema.parse('test_enrollment_payer_a01');
    const testCourseId = CourseIdSchema.parse('course_enrollment_payer_test');
    const liveCourseId = CourseIdSchema.parse('course_enrollment_payer_live');
    const testDayId = CourseDayIdSchema.parse('course_day_enrollment_payer_test');
    const scope = { dataScope: 'test' as const, testSessionId: sessionId };
    const audit = {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    };
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: { ...seedAccount(), dataScope: 'test' as const },
      [`participants/${participantId}`]: { ...seedParticipant(), ...scope },
      [`participant_management/${managementId}`]: seedManagement(),
      [`instructors/${instructorId}`]: { ...seedInstructor(), ...scope },
      [`users/${accountId}/wallet/state`]: { ...seedWallet(100_000), ...scope },
      [`courses/${testCourseId}`]: {
        ...seedCourse(),
        courseId: testCourseId,
        ...scope,
      },
      [`courses/${testCourseId}/days/${testDayId}`]: {
        ...seedCourseDay(),
        courseId: testCourseId,
        courseDayId: testDayId,
        ...scope,
      },
      [`courses/${liveCourseId}`]: {
        ...seedCourse(),
        courseId: liveCourseId,
        dataScope: 'live',
      },
      [`test_actors/${accountId}`]: TestActorSchema.parse({
        accountId,
        participantIds: [participantId],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      }),
      [`test_actor_assignments/${accountId}`]: TestActorAssignmentSchema.parse({
        accountId,
        activeTestSessionId: sessionId,
        revision: 1,
        updatedAt: decidedAt,
        audit,
      }),
    });
    const result = await createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
        scope: testCanonicalExecutionScope(sessionId),
      },
      executor
    ).execute(
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-persistent-payer-01'),
        intent: { courseId: testCourseId, participantIds: [participantId] },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`courses/${testCourseId}`)?.data.capacity.availableSeats).toBe(7);
    expect(snapshot.docs.get(`courses/${liveCourseId}`)?.data.capacity.availableSeats).toBe(8);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      100_000 - COURSE_PRICE_KZT
    );
    expect(snapshot.docs.get(`users/${accountId}`)?.data.testSessionId).toBeUndefined();
    const enrollments = [...snapshot.docs.entries()].filter(([path]) =>
      path.startsWith('course_enrollments/')
    );
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]?.[1].data).toMatchObject({
      dataScope: 'test',
      testSessionId: sessionId,
    });
  });

  it('returns insufficient_funds for a persistent TestActor when the course price exceeds the wallet', async () => {
    const sessionId = TestSessionIdSchema.parse('test_enrollment_payer_funds_01');
    const testCourseId = CourseIdSchema.parse('course_enrollment_payer_funds');
    const liveCourseId = CourseIdSchema.parse('course_enrollment_payer_funds_live');
    const testDayId = CourseDayIdSchema.parse('course_day_enrollment_payer_funds');
    const scope = { dataScope: 'test' as const, testSessionId: sessionId };
    const audit = {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    };
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: { ...seedAccount(), dataScope: 'test' as const },
      [`participants/${participantId}`]: { ...seedParticipant(), ...scope },
      [`participant_management/${managementId}`]: seedManagement(),
      [`instructors/${instructorId}`]: { ...seedInstructor(), ...scope },
      [`users/${accountId}/wallet/state`]: { ...seedWallet(100_000), ...scope },
      [`courses/${testCourseId}`]: {
        ...seedCourse(),
        courseId: testCourseId,
        price: 250_000,
        ...scope,
      },
      [`courses/${testCourseId}/days/${testDayId}`]: {
        ...seedCourseDay(),
        courseId: testCourseId,
        courseDayId: testDayId,
        ...scope,
      },
      [`courses/${liveCourseId}`]: {
        ...seedCourse(),
        courseId: liveCourseId,
        price: 250_000,
        dataScope: 'live',
      },
      [`test_actors/${accountId}`]: TestActorSchema.parse({
        accountId,
        participantIds: [participantId],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      }),
      [`test_actor_assignments/${accountId}`]: TestActorAssignmentSchema.parse({
        accountId,
        activeTestSessionId: sessionId,
        revision: 1,
        updatedAt: decidedAt,
        audit,
      }),
    });
    const result = await createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
        scope: testCanonicalExecutionScope(sessionId),
      },
      executor
    ).execute(
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-persistent-insufficient'),
        intent: { courseId: testCourseId, participantIds: [participantId] },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('insufficient_funds');
    }
    const snapshot = executor.snapshot();
    expect([...snapshot.docs.keys()].some((path) => path.startsWith('course_enrollments/'))).toBe(
      false
    );
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(100_000);
    expect(snapshot.docs.get(`courses/${testCourseId}`)?.data.capacity.availableSeats).toBe(8);
    expect(snapshot.docs.get(`courses/${liveCourseId}`)?.data.capacity.availableSeats).toBe(8);
  });

  it('funds a 100000 TEST wallet by 150000 and enrolls a 250000 TEST course', async () => {
    const sessionId = TestSessionIdSchema.parse('test_enrollment_funding_a01');
    const testCourseId = CourseIdSchema.parse('course_enrollment_funding_test');
    const liveCourseId = CourseIdSchema.parse('course_enrollment_funding_live');
    const testDayId = CourseDayIdSchema.parse('course_day_enrollment_funding_test');
    const liveAccountId = AccountIdSchema.parse('account_enrollment_funding_live');
    const scope = { dataScope: 'test' as const, testSessionId: sessionId };
    const audit = {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    };
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: { ...seedAccount(), dataScope: 'test' as const },
      [`users/${liveAccountId}/wallet/state`]: seedWallet(888_000, liveAccountId),
      [`participants/${participantId}`]: { ...seedParticipant(), ...scope },
      [`participant_management/${managementId}`]: seedManagement(),
      [`instructors/${instructorId}`]: { ...seedInstructor(), ...scope },
      [`users/${accountId}/wallet/state`]: { ...seedWallet(100_000), ...scope },
      [`courses/${testCourseId}`]: {
        ...seedCourse(),
        courseId: testCourseId,
        price: 250_000,
        ...scope,
      },
      [`courses/${testCourseId}/days/${testDayId}`]: {
        ...seedCourseDay(),
        courseId: testCourseId,
        courseDayId: testDayId,
        ...scope,
      },
      [`courses/${liveCourseId}`]: {
        ...seedCourse(),
        courseId: liveCourseId,
        price: 250_000,
        dataScope: 'live',
      },
      [`test_actors/${accountId}`]: TestActorSchema.parse({
        accountId,
        participantIds: [participantId],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      }),
      [`test_actor_assignments/${accountId}`]: TestActorAssignmentSchema.parse({
        accountId,
        activeTestSessionId: sessionId,
        revision: 1,
        updatedAt: decidedAt,
        audit,
      }),
    });
    const commands = createProductionCanonicalCommands(
      {
        clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')),
        scope: testCanonicalExecutionScope(sessionId),
      },
      executor
    );
    const funding = {
      kind: 'record_manual_wallet_funding' as const,
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'administrator' as const,
        idempotencyKey: 'fund-test-course-250',
        correlationId,
        source: 'admin_callable' as const,
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: {
        accountId,
        amount: 150_000,
        reasonExplanation: 'TEST session course funding',
      },
    };
    const funded = await commands.execute(funding);
    expect(funded.status).toBe('success');
    const fundingIdentity = resolveCommandIdempotencyIdentity(funding);
    expect(
      executor
        .snapshot()
        .docs.get(
          `monetary_events/${monetaryEventIdFromCommandEffect(fundingIdentity.commandKey, 0)}`
        )?.data
    ).toMatchObject({
      eventKind: 'wallet_credit',
      dataScope: 'test',
      testSessionId: sessionId,
      walletBalanceDelta: 150_000,
    });
    expect(executor.snapshot().docs.get(`users/${accountId}/wallet/state`)?.data.balance).toBe(
      250_000
    );
    expect(executor.snapshot().docs.get(`users/${liveAccountId}/wallet/state`)?.data.balance).toBe(
      888_000
    );

    const enrolled = await commands.execute(
      createEnvelope({
        context: accountContext('account_owner', accountId, 'enrollment-after-funding'),
        intent: { courseId: testCourseId, participantIds: [participantId] },
      })
    );
    expect(enrolled.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`courses/${testCourseId}`)?.data.capacity.availableSeats).toBe(7);
    expect(snapshot.docs.get(`courses/${liveCourseId}`)?.data.capacity.availableSeats).toBe(8);
    expect(snapshot.docs.get(`users/${accountId}/wallet/state`)?.data).toMatchObject({
      balance: 0,
      dataScope: 'test',
      testSessionId: sessionId,
    });
    expect(snapshot.docs.get(`users/${liveAccountId}/wallet/state`)?.data.balance).toBe(888_000);
    expect(snapshot.docs.get(`users/${accountId}/wallet/starter_credit_grant`)).toBeUndefined();
    const enrollments = [...snapshot.docs.entries()].filter(([path]) =>
      path.startsWith('course_enrollments/')
    );
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]?.[1].data).toMatchObject({
      dataScope: 'test',
      testSessionId: sessionId,
    });
    const payments = [...snapshot.docs.entries()].filter(([path]) => path.startsWith('payments/'));
    expect(payments).toHaveLength(1);
    expect(payments[0]?.[1].data).toMatchObject({
      dataScope: 'test',
      testSessionId: sessionId,
    });
  });
});
