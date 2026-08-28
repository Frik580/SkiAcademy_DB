import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  GuestSubjectIdSchema,
  ParticipantIdSchema,
  courseEnrollmentIdFromCommandParticipant,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  participantManagementIdFromGuestLink,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_guest_course_link_cmd_01');
const accountId = AccountIdSchema.parse('account_guest_course_link_cmd_01');
const guestParticipantId = ParticipantIdSchema.parse('participant_guest_course_link_cmd_guest');
const participantIdCreate = ParticipantIdSchema.parse('participant_guest_course_link_cmd_create');
const instructorId = InstructorIdSchema.parse('instructor_guest_course_link_cmd_01');
const courseId = CourseIdSchema.parse('course_guest_course_link_cmd_01');
const courseDayId = CourseDayIdSchema.parse('course_day_guest_course_link_cmd_01');
const tokenSecret = 'guest-course-link-cmd-test-secret';
const guestEnrollmentFixtureSeedSubjectId = GuestSubjectIdSchema.parse(
  'guest_subject_guest_course_link_cmd_actor'
);
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

function baseFixture(extra: Record<string, unknown> = {}) {
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
    [`participants/${guestParticipantId}`]: {
      participantId: guestParticipantId,
      displayName: 'Guest Link Unit Participant',
      age: { kind: 'age_years', years: 18 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
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
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Guest Link Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`courses/${courseId}`]: {
      courseId,
      title: 'Guest Link Unit Course',
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
    ...extra,
  };
}

function guestCreateEnvelope(
  idempotencyKey: string,
  targetParticipantId: typeof guestParticipantId = guestParticipantId
): CommandEnvelope<'create_course_enrollments'> {
  const sharedContext = {
    exercisedCapability: 'guest' as const,
    idempotencyKey,
    correlationId,
    source: 'guest_callable' as const,
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
  const draft: CommandEnvelope<'create_course_enrollments'> = {
    kind: 'create_course_enrollments',
    context: {
      ...sharedContext,
      actor: guestCommandActor(guestEnrollmentFixtureSeedSubjectId),
    },
    intent: {
      courseId,
      participantIds: [targetParticipantId],
    },
  };
  const identity = resolveCommandIdempotencyIdentity(draft);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId: targetParticipantId,
  });

  return {
    kind: 'create_course_enrollments',
    context: {
      ...sharedContext,
      actor: guestCommandActor(guestSubjectIdFromCourseEnrollmentId(enrollmentId)),
    },
    intent: {
      courseId,
      participantIds: [targetParticipantId],
      enrollmentIds: [enrollmentId],
    },
  };
}

function linkEnvelope(input: {
  enrollmentId: ReturnType<typeof courseEnrollmentIdFromCommandParticipant>;
  credential: { nonce: string; signature: string };
  idempotencyKey: string;
  expectedRevision: number;
  participantTarget: CommandEnvelope<'link_guest_course_enrollment_to_account'>['intent']['participantTarget'];
}): CommandEnvelope<'link_guest_course_enrollment_to_account'> {
  return {
    kind: 'link_guest_course_enrollment_to_account',
    context: {
      ...accountContext(input.idempotencyKey),
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: {
      enrollmentId: input.enrollmentId,
      guestLinkCredential: input.credential,
      participantTarget: input.participantTarget,
    },
  };
}

function runCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T00:00:00.000Z'
) {
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret: tokenSecret,
  });
}

describe('link_guest_course_enrollment_to_account command', () => {
  it('does not duplicate create_managed writes when the transaction callback retries', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(), {
      simulateRetry: true,
    });
    const commands = runCommands(executor);
    const createEnvelope = guestCreateEnvelope('guest-link-unit-create');
    const createResult = await commands.execute(createEnvelope);
    expect(createResult.status).toBe('success');
    if (createResult.status !== 'success') {
      return;
    }

    const enrollmentId = createEnvelope.intent.enrollmentIds![0]!;
    const credential = createResult.payload?.guestLinkCredentials?.find(
      (entry) => entry.enrollmentId === enrollmentId
    );
    expect(credential).toBeDefined();

    const linkResult = await commands.execute(
      linkEnvelope({
        enrollmentId,
        credential: {
          nonce: credential!.nonce,
          signature: credential!.signature,
        },
        idempotencyKey: 'guest-link-unit-create-managed-retry',
        expectedRevision: 1,
        participantTarget: {
          kind: 'create_managed',
          participantId: participantIdCreate,
          displayName: 'Created Managed Participant',
          age: { kind: 'age_years', years: 16 },
          skillLevel: 'beginner',
          discipline: 'ski',
        },
      })
    );
    expect(linkResult.status).toBe('success');

    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(`participants/${participantIdCreate}`)).toBe(true);
    expect(
      snapshot.docs.has(
        `participant_management/${participantManagementIdFromGuestLink({
          participantId: participantIdCreate,
          accountId,
        })}`
      )
    ).toBe(true);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participants/')).length
    ).toBe(2);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participant_management/')).length
    ).toBe(1);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect(
      snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data?.guestAccountLink
    ).toMatchObject({
      linkedAccountId: accountId,
      linkedParticipantId: participantIdCreate,
      credentialNonce: credential!.nonce,
    });
    expect(
      snapshot.docs.get(`payments/${paymentIdFromCourseEnrollmentId(enrollmentId)}`)?.data
        ?.payerAccountId
    ).toBe(accountId);
    expect(
      snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data?.attribution?.bookedBy
    ).toEqual({
      kind: 'guest',
      guestSubjectId: guestSubjectIdFromCourseEnrollmentId(enrollmentId),
    });
  });
});
