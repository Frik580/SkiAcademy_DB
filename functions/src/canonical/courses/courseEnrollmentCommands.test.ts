import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  monetaryEventIdFromCommandEffect,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
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
    source: capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
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
    expect(snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)).toBe(
      true
    );
    expect(
      snapshot.docs.has(
        `monetary_events/${monetaryEventIdFromCommandEffect(identity.commandKey, 0)}`
      )
    ).toBe(true);
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
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length).toBe(
      0
    );
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
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
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
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
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
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(1);
  });
});
