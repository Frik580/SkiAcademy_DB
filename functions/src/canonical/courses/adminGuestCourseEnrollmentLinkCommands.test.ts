import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  participantManagementIdFromGuestLink,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_admin_guest_enroll_link_01');
const adminAccountId = AccountIdSchema.parse('account_admin_guest_enroll_link_admin');
const targetAccountId = AccountIdSchema.parse('account_admin_guest_enroll_link_target');
const guestParticipantId = ParticipantIdSchema.parse('participant_admin_guest_enroll_link_guest');
const managedParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_enroll_link_managed'
);
const dependentParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_enroll_link_dependent'
);
const instructorId = InstructorIdSchema.parse('instructor_admin_guest_enroll_link_01');
const courseId = CourseIdSchema.parse('course_admin_guest_enroll_link_01');
const courseDayId = CourseDayIdSchema.parse('course_day_admin_guest_enroll_link_01');
const managementId = participantManagementIdFromGuestLink({
  participantId: managedParticipantId,
  accountId: targetAccountId,
});
const dependentManagementId = participantManagementIdFromGuestLink({
  participantId: dependentParticipantId,
  accountId: targetAccountId,
});
const tokenSecret = 'admin-guest-enroll-link-unit-secret';
const guestSeedSubjectId = GuestSubjectIdSchema.parse('guest_subject_admin_guest_enroll_link_actor');
const COURSE_PRICE_KZT = 50_000;
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function seedAccount(accountId: typeof adminAccountId) {
  return AccountSchema.parse({
    accountId,
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

function seedManaged(
  participantId: typeof managedParticipantId,
  managementParticipantId: typeof managementId,
  authority: 'self' | 'parent_guardian'
) {
  return {
    participant: {
      participantId,
      displayName: authority === 'self' ? 'Managed Self' : 'Managed Dependent',
      age: { kind: 'age_years', years: authority === 'self' ? 18 : 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementParticipantId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_managed',
        lastChangedByCommandId: 'command_seed_managed',
        correlationId,
      },
    },
    management: {
      participantManagementId: managementParticipantId,
      participantId,
      accountId: targetAccountId,
      role: 'owner',
      authority,
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_management',
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    },
  };
}

function baseFixture(extra: Record<string, unknown> = {}) {
  const self = seedManaged(managedParticipantId, managementId, 'self');
  const dependent = seedManaged(dependentParticipantId, dependentManagementId, 'parent_guardian');
  return {
    [`users/${adminAccountId}`]: seedAccount(adminAccountId),
    [`users/${targetAccountId}`]: seedAccount(targetAccountId),
    [`participants/${guestParticipantId}`]: {
      participantId: guestParticipantId,
      displayName: 'Guest Enrollment Source',
      age: { kind: 'age_years', years: 18 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_guest',
        lastChangedByCommandId: 'command_seed_guest',
        correlationId,
      },
    },
    [`participants/${managedParticipantId}`]: self.participant,
    [`participants/${dependentParticipantId}`]: dependent.participant,
    [`participant_management/${managementId}`]: self.management,
    [`participant_management/${dependentManagementId}`]: dependent.management,
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Admin Enrollment Link Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`courses/${courseId}`]: {
      courseId,
      title: 'Admin Enrollment Link Course',
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
        createdByCommandId: 'command_seed_day',
        lastChangedByCommandId: 'command_seed_day',
        correlationId,
      },
    },
    ...extra,
  };
}

function cloneDocs(
  snapshot: ReturnType<ReturnType<typeof createInMemoryCanonicalTransactionExecutor>['snapshot']>
): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {};
  for (const [path, document] of snapshot.docs) {
    docs[path] = { ...(document.data as Record<string, unknown>) };
  }
  return docs;
}

function guestCreateEnvelope(
  idempotencyKey: string
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
      actor: guestCommandActor(guestSeedSubjectId),
    },
    intent: {
      courseId,
      participantIds: [guestParticipantId],
    },
  };
  const identity = resolveCommandIdempotencyIdentity(draft);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId: guestParticipantId,
  });
  return {
    kind: 'create_course_enrollments',
    context: {
      ...sharedContext,
      actor: guestCommandActor(guestSubjectIdFromCourseEnrollmentId(enrollmentId)),
    },
    intent: {
      courseId,
      participantIds: [guestParticipantId],
      enrollmentIds: [enrollmentId],
    },
  };
}

function adminLinkEnvelope(
  enrollmentId: ReturnType<typeof courseEnrollmentIdFromCommandParticipant>,
  overrides: Partial<
    CommandEnvelope<'link_guest_course_enrollment_to_account_as_administrator'>
  > = {}
): CommandEnvelope<'link_guest_course_enrollment_to_account_as_administrator'> {
  return {
    kind: 'link_guest_course_enrollment_to_account_as_administrator',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: 'admin-guest-enroll-link-01',
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
      ...overrides.context,
    },
    intent: {
      enrollmentId,
      targetAccountId,
      targetParticipantId: managedParticipantId,
      reasonExplanation: 'Guest is the existing managed Participant',
      ...overrides.intent,
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

async function createGuestEnrollment(extra: Record<string, unknown> = {}) {
  const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(extra));
  const envelope = guestCreateEnvelope('admin-guest-enroll-create-01');
  const created = await runCommands(executor).execute(envelope);
  expect(created.status).toBe('success');
  return {
    executor,
    enrollmentId: envelope.intent.enrollmentIds![0]!,
    credential: created.status === 'success' ? created.payload?.guestLinkCredentials?.[0] : undefined,
  };
}

describe('link_guest_course_enrollment_to_account_as_administrator', () => {
  it('associates an existing managed Participant without recreating enrollment, Payment, or capacity', async () => {
    const { executor, enrollmentId } = await createGuestEnrollment();
    const before = cloneDocs(executor.snapshot());
    const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
    const paymentBefore = before[`payments/${paymentId}`];
    const courseBefore = before[`courses/${courseId}`];
    const enrollmentBefore = before[`course_enrollments/${enrollmentId}`];

    const result = await runCommands(executor).execute(adminLinkEnvelope(enrollmentId));
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const enrollment = snapshot.docs.get(`course_enrollments/${enrollmentId}`)?.data;
    expect(enrollment?.participantId).toBe(managedParticipantId);
    expect(enrollment?.guestAccountLink).toMatchObject({
      linkedAccountId: targetAccountId,
      linkedParticipantId: managedParticipantId,
    });
    expect(enrollment?.guestAccountLink?.credentialNonce).toBeUndefined();
    expect(enrollment?.attribution).toEqual(enrollmentBefore.attribution);
    expect(enrollment?.lifecycle).toEqual(enrollmentBefore.lifecycle);
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data).toMatchObject({
      price: paymentBefore.price,
      paidAmount: paymentBefore.paidAmount,
      paymentStatus: paymentBefore.paymentStatus,
      payerAccountId: targetAccountId,
    });
    expect(snapshot.docs.get(`courses/${courseId}`)?.data.capacity.availableSeats).toBe(
      courseBefore.capacity.availableSeats
    );
    expect(snapshot.docs.get(`participants/${guestParticipantId}`)?.data.management).toEqual({
      kind: 'unmanaged_guest',
    });
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('course_enrollments/')).length
    ).toBe(1);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participant_management/')).length
    ).toBe(2);
  });

  it('replays the same delivery exactly once and rejects a new relink attempt', async () => {
    const { executor, enrollmentId } = await createGuestEnrollment();
    const envelope = adminLinkEnvelope(enrollmentId);
    const commands = runCommands(executor);
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect(executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.revision).toBe(
      2
    );
    const relink = await commands.execute(
      adminLinkEnvelope(enrollmentId, {
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-guest-enroll-link-02',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(2),
        },
      })
    );
    expect(relink.status).toBe('error');
    if (relink.status === 'error') {
      expect(relink.error.code).toBe('validation');
    }
  });

  it('refuses stale revision and non-administrator actors', async () => {
    const { executor, enrollmentId } = await createGuestEnrollment();
    const stale = await runCommands(executor).execute(
      adminLinkEnvelope(enrollmentId, {
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-guest-enroll-link-stale',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(9),
        },
      })
    );
    expect(stale.status).toBe('error');
    if (stale.status === 'error') {
      expect(stale.error.code).toBe('stale_version');
    }

    const owner = await runCommands(executor).execute(
      adminLinkEnvelope(enrollmentId, {
        context: {
          actor: accountCommandActor(targetAccountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'admin-guest-enroll-link-owner',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(owner.status).toBe('error');
    if (owner.status === 'error') {
      expect(owner.error.code).toBe('forbidden');
    }
  });

  it('rejects disabled Account, archived/unmanaged Participant, and ended management', async () => {
    const disabled = await createGuestEnrollment({
      [`users/${targetAccountId}`]: AccountSchema.parse({
        ...seedAccount(targetAccountId),
        lifecycle: { status: 'disabled', disabledAt: decidedAt },
      }),
    });
    expect(
      (await runCommands(disabled.executor).execute(adminLinkEnvelope(disabled.enrollmentId))).status
    ).toBe('error');

    const archived = await createGuestEnrollment({
      [`participants/${managedParticipantId}`]: {
        ...seedManaged(managedParticipantId, managementId, 'self').participant,
        lifecycle: { status: 'archived', archivedAt: decidedAt },
      },
    });
    expect(
      (await runCommands(archived.executor).execute(adminLinkEnvelope(archived.enrollmentId))).status
    ).toBe('error');

    const unmanaged = await createGuestEnrollment({
      [`participants/${managedParticipantId}`]: {
        ...seedManaged(managedParticipantId, managementId, 'self').participant,
        management: { kind: 'unmanaged_guest' },
      },
    });
    const unmanagedResult = await runCommands(unmanaged.executor).execute(
      adminLinkEnvelope(unmanaged.enrollmentId)
    );
    expect(unmanagedResult.status).toBe('error');
    if (unmanagedResult.status === 'error') {
      expect(unmanagedResult.error.code).toBe('forbidden');
    }

    const ended = await createGuestEnrollment({
      [`participant_management/${managementId}`]: {
        ...seedManaged(managedParticipantId, managementId, 'self').management,
        status: 'ended',
        endedAt: decidedAt,
      },
    });
    const endedResult = await runCommands(ended.executor).execute(
      adminLinkEnvelope(ended.enrollmentId)
    );
    expect(endedResult.status).toBe('error');
    if (endedResult.status === 'error') {
      expect(endedResult.error.code).toBe('forbidden');
    }
  });

  it('fails closed when Attendance exists or the course has started', async () => {
    const created = await createGuestEnrollment();
    const withAttendance = createInMemoryCanonicalTransactionExecutor({
      ...cloneDocs(created.executor.snapshot()),
      [`course_enrollments/${created.enrollmentId}`]: {
        ...created.executor.snapshot().docs.get(`course_enrollments/${created.enrollmentId}`)!.data,
        attendanceSummary: {
          recordedDayCount: 1,
          presentDayCount: 1,
          absentDayCount: 0,
          projectionRevision: 1,
        },
      },
    });
    const attendanceResult = await runCommands(withAttendance).execute(
      adminLinkEnvelope(created.enrollmentId)
    );
    expect(attendanceResult.status).toBe('error');
    if (attendanceResult.status === 'error') {
      expect(attendanceResult.error.code).toBe('invalid_transition');
    }

    const started = await runCommands(created.executor, '2026-02-01T03:00:00.000Z').execute(
      adminLinkEnvelope(created.enrollmentId)
    );
    expect(started.status).toBe('error');
    if (started.status === 'error') {
      expect(started.error.code).toBe('invalid_transition');
    }
  });

  it('forbids self-service credential linking after an Admin identity link', async () => {
    const { executor, enrollmentId, credential } = await createGuestEnrollment();
    expect(credential).toBeDefined();
    expect((await runCommands(executor).execute(adminLinkEnvelope(enrollmentId))).status).toBe(
      'success'
    );
    const selfService = await runCommands(executor).execute({
      kind: 'link_guest_course_enrollment_to_account',
      context: {
        actor: accountCommandActor(targetAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'self-service-after-admin-enroll',
        correlationId,
        source: 'client_callable',
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
      intent: {
        enrollmentId,
        guestLinkCredential: {
          nonce: credential!.nonce,
          signature: credential!.signature,
        },
        participantTarget: { kind: 'existing_managed', participantId: managedParticipantId },
      },
    });
    expect(selfService.status).toBe('error');
    if (selfService.status === 'error') {
      expect(selfService.error.code).toBe('validation');
    }
  });

  it('links a parent_guardian managed Participant', async () => {
    const { executor, enrollmentId } = await createGuestEnrollment();
    const result = await runCommands(executor).execute(
      adminLinkEnvelope(enrollmentId, {
        intent: {
          enrollmentId,
          targetAccountId,
          targetParticipantId: dependentParticipantId,
          reasonExplanation: 'Guest is the existing dependent',
        },
      })
    );
    expect(result.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data.participantId
    ).toBe(dependentParticipantId);
  });
});
