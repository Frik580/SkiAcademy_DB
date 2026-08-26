import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  courseEnrollmentIdFromCommandParticipant,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_course_lifecycle_cmd_01');
const accountId = AccountIdSchema.parse('account_course_lifecycle_cmd_01');
const participantId = ParticipantIdSchema.parse('participant_course_lifecycle_cmd_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_lifecycle_cmd_01');
const instructorId = InstructorIdSchema.parse('instructor_course_lifecycle_cmd_01');
const courseId = CourseIdSchema.parse('course_course_lifecycle_cmd_01');
const courseDayId = CourseDayIdSchema.parse('course_day_lifecycle_cmd_01');
const COURSE_PRICE_KZT = 50_000;
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(accountId),
    exercisedCapability: 'account_owner' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function baseFixture() {
  return {
    [`users/${accountId}`]: AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Lifecycle Cmd Participant',
      age: { kind: 'age_years', years: 20 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
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
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Lifecycle Instructor',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`users/${accountId}/wallet/state`]: WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 100_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    }),
    [`courses/${courseId}`]: {
      courseId,
      title: 'Lifecycle Command Course',
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
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    },
    [`courses/${courseId}/days/${courseDayId}`]: {
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
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    },
  };
}

describe('course enrollment lifecycle commands', () => {
  it('does not duplicate cancellation writes when the transaction callback retries', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(), {
      simulateRetry: true,
    });
    const createCommands = createProductionCanonicalCommands(environment(), executor);
    const createEnvelope: CommandEnvelope<'create_course_enrollments'> = {
      kind: 'create_course_enrollments',
      context: accountContext('lifecycle-retry-create'),
      intent: { courseId, participantIds: [participantId] },
    };
    const createResult = await createCommands.execute(createEnvelope);
    expect(createResult.status).toBe('success');

    const identity = resolveCommandIdempotencyIdentity(createEnvelope);
    const enrollmentId = courseEnrollmentIdFromCommandParticipant({
      commandId: identity.commandKey,
      participantId,
    }) as CourseEnrollmentId;
    const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);

    const cancelCommands = createProductionCanonicalCommands(
      environment('2026-01-15T00:00:00.000Z'),
      executor
    );
    const cancelResult = await cancelCommands.execute({
      kind: 'request_course_enrollment_cancellation',
      context: {
        ...accountContext('lifecycle-retry-cancel'),
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { courseEnrollmentId: enrollmentId },
    });
    expect(cancelResult.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect([...snapshot.docs.keys()].filter((path) => path.startsWith('payments/')).length).toBe(1);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('monetary_events/')).length
    ).toBe(2);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data.refundedAmount).toBe(COURSE_PRICE_KZT);
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(8);
  });
});
