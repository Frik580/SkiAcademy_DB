import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  courseScheduleIsComplete,
  legacyCourseDocumentFailsCanonicalParse,
  courseDocumentExtraKeys,
  parseCommandResultPayload,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  verifyProvisionedCourseSchedule,
  CourseProvisioningManifestSchema,
  buildCourseAggregateFromManifest,
  deriveSchedulePlanFromManifest,
  resolveManifestDayInterval,
  resolveInstructorCourseAssignmentProjection,
  type CommandEnvelope,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  parseCourse,
  parseCourseDays,
  courseDaysCollectionPath,
  courseDayPath,
  toFirestoreWritePayload,
} from './courseStore';
import { parseCourseCatalogContent, courseCatalogContentPath } from './courseCatalogContentStore';

const correlationId = CorrelationIdSchema.parse('correlation_course_provision_cmd_01');
const adminAccountId = AccountIdSchema.parse('account_course_provision_admin_01');
const accountId = AccountIdSchema.parse('account_course_provision_owner_01');
const participantId = ParticipantIdSchema.parse('participant_course_provision_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_provision_01');
const instructorId = InstructorIdSchema.parse('instructor_course_provision_01');
const courseId = CourseIdSchema.parse('course_course_provision_cmd_01');
const courseDayId = CourseDayIdSchema.parse('course_day_provision_cmd_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_provision_cmd_02');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const manifest = CourseProvisioningManifestSchema.parse({
  courseId,
  title: 'Provision Command Course',
  price: KztMinorUnitsSchema.parse(50_000),
  totalSeats: 8,
  capacityPolicy: { kind: 'seed_full' },
  instructorRosterIds: [instructorId],
  timeZone: 'Asia/Almaty',
  days: [
    {
      courseDayId,
      dayOrder: 1,
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
      instructorId,
    },
  ],
  presentation: {
    duration: '1 day',
    description: 'Provisioned course description',
    dates: '1 February 2026, 09:00–11:00',
    bgImageUrl: 'https://example.com/provisioned.webp',
  },
});

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
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

function legacyCourseFixture() {
  return {
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
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
    [`users/${accountId}/wallet/state`]: WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 100_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    }),
    [`participants/${participantId}`]: {
      participantId,
      displayName: 'Provision Participant',
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
      name: 'Provision Instructor',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`courses/${courseId}`]: {
      title: 'Legacy Course',
      duration: '1 day',
      description: 'Legacy description',
      dates: '1 February',
      totalSeats: 8,
      availableSeats: 8,
      price: 50_000,
      bgImageUrl: 'https://example.com/legacy.webp',
      instructorIds: [instructorId],
    },
  };
}

function applyEnvelope(
  idempotencyKey: string
): CommandEnvelope<'apply_canonical_course_provisioning_manifest'> {
  return {
    kind: 'apply_canonical_course_provisioning_manifest',
    context: adminContext(idempotencyKey),
    intent: {
      manifest,
      dryRun: false,
    },
  };
}

function twoDayManifest(): CourseProvisioningManifest {
  return CourseProvisioningManifestSchema.parse({
    ...manifest,
    days: [
      manifest.days[0]!,
      {
        courseDayId: courseDayTwoId,
        dayOrder: 2,
        localDate: '2026-02-02',
        localTime: '09:00',
        durationMinutes: 120,
        instructorId,
      },
    ],
  });
}

function applyEnvelopeWithManifest(
  idempotencyKey: string,
  manifestInput: CourseProvisioningManifest
): CommandEnvelope<'apply_canonical_course_provisioning_manifest'> {
  return {
    kind: 'apply_canonical_course_provisioning_manifest',
    context: adminContext(idempotencyKey),
    intent: {
      manifest: manifestInput,
      dryRun: false,
    },
  };
}

describe('course provisioning commands', () => {
  it('dry-run validates manifest without writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const result = await commands.execute({
      kind: 'apply_canonical_course_provisioning_manifest',
      context: adminContext('idem-provision-dry-run'),
      intent: { manifest, dryRun: true },
    });
    expect(result.status).toBe('success');
    const payload = parseCommandResultPayload(
      'apply_canonical_course_provisioning_manifest',
      result.payload
    );
    expect(payload.success).toBe(true);
    if (payload.success) {
      expect(payload.data.dryRun).toBe(true);
      expect(payload.data.plannedCourseDayCount).toBe(1);
    }
    expect(
      legacyCourseDocumentFailsCanonicalParse(
        executor.snapshot().docs.get(`courses/${courseId}`)?.data
      )
    ).toBe(true);
  });

  it('provisions canonical course and days from legacy fixture', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const envelope = applyEnvelope('idem-provision-apply-a');
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const course = parseCourse(snapshot.docs.get(`courses/${courseId}`)?.data);
    expect(course).toBeDefined();
    expect(course?.revision).toBeGreaterThanOrEqual(1);
    expect(course?.audit.createdByCommandId).toBeDefined();

    const content = parseCourseCatalogContent(
      snapshot.docs.get(courseCatalogContentPath(courseId))?.data
    );
    expect(content?.description).toBe('Provisioned course description');

    const courseDays = parseCourseDays(
      [...snapshot.docs.entries()]
        .filter(([path]) => path.startsWith(`${courseDaysCollectionPath(courseId)}/`))
        .map(([, doc]) => ({ data: doc.data ?? {} }))
    );
    expect(courseScheduleIsComplete(course!, courseDays)).toBe(true);
    expect(verifyProvisionedCourseSchedule(course!, courseDays)).toBe(true);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    expect(
      snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
  });

  it('is idempotent on replay', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const envelope = applyEnvelope('idem-provision-apply-b');
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
  });

  it('maps provision_canonical_course failure to apply manifest kind', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(applyEnvelope('idem-provision-conflict-a'))).status).toBe(
      'success'
    );

    const conflictingManifest = CourseProvisioningManifestSchema.parse({
      ...manifest,
      title: 'Conflicting Provision Title',
    });
    const result = await commands.execute(
      applyEnvelopeWithManifest('idem-provision-conflict-b', conflictingManifest)
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.kind).toBe('apply_canonical_course_provisioning_manifest');
      expect(result.correlationId).toBe(correlationId);
      expect(result.error.code).toBe('validation');
      expect(result.error.details).toEqual({ field: 'manifest', reason: 'conflict' });
    }
  });

  it('rejects a CourseDay conflict without committing a partial Course', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...legacyCourseFixture(),
      [courseDayPath(courseId, courseDayTwoId)]: {
        courseId,
        courseDayId: courseDayTwoId,
        placeholder: true,
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const partialManifest = twoDayManifest();
    const envelope = applyEnvelopeWithManifest('idem-provision-day-failure', partialManifest);
    const result = await commands.execute(envelope);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.kind).toBe('apply_canonical_course_provisioning_manifest');
      expect(result.correlationId).toBe(correlationId);
      expect(result.error.code).toBe('validation');
      expect(result.error.details).toEqual({ field: 'courseDayId', reason: 'conflict' });
    }

    const snapshot = executor.snapshot();
    const courseDays = parseCourseDays(
      [...snapshot.docs.entries()]
        .filter(([path]) => path.startsWith(`${courseDaysCollectionPath(courseId)}/`))
        .map(([, doc]) => ({ data: doc.data ?? {} }))
    );
    expect(courseDays).toHaveLength(0);
    expect(
      legacyCourseDocumentFailsCanonicalParse(snapshot.docs.get(`courses/${courseId}`)?.data)
    ).toBe(true);
  });

  it('resumes partial provisioning after create_course_day blocker removal', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...legacyCourseFixture(),
      [courseDayPath(courseId, courseDayTwoId)]: {
        courseId,
        courseDayId: courseDayTwoId,
        placeholder: true,
      },
    });
    const partialManifest = twoDayManifest();
    const envelope = applyEnvelopeWithManifest('idem-provision-resume', partialManifest);
    const commands = createProductionCanonicalCommands(environment(), executor);

    const blocked = await commands.execute(envelope);
    expect(blocked.status).toBe('error');
    if (blocked.status === 'error') {
      expect(blocked.kind).toBe('apply_canonical_course_provisioning_manifest');
    }

    const afterBlocked = executor.snapshot();
    const docsWithoutStub = Object.fromEntries(
      [...afterBlocked.docs.entries()]
        .filter(([path]) => path !== courseDayPath(courseId, courseDayTwoId))
        .map(([path, doc]) => [path, doc.data ?? {}])
    );
    const resumeExecutor = createInMemoryCanonicalTransactionExecutor(docsWithoutStub);
    const resumeCommands = createProductionCanonicalCommands(environment(), resumeExecutor);
    const resume = await resumeCommands.execute(envelope);
    expect(resume.status).toBe('success');

    const course = parseCourse(resumeExecutor.snapshot().docs.get(`courses/${courseId}`)?.data);
    const courseDays = parseCourseDays(
      [...resumeExecutor.snapshot().docs.entries()]
        .filter(([path]) => path.startsWith(`${courseDaysCollectionPath(courseId)}/`))
        .map(([, doc]) => ({ data: doc.data ?? {} }))
    );
    expect(courseDays).toHaveLength(2);
    expect(courseScheduleIsComplete(course!, courseDays)).toBe(true);
  });

  it('completes a legacy sequential partial manifest without rewriting matching CourseDays', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const partialManifest = twoDayManifest();

    expect(
      (
        await commands.execute({
          kind: 'provision_canonical_course',
          context: adminContext('idem-provision-legacy-partial-course'),
          intent: { manifest: partialManifest },
        })
      ).status
    ).toBe('success');
    expect(
      (
        await commands.execute({
          kind: 'create_course_day',
          context: {
            ...adminContext('idem-provision-legacy-partial-day-one'),
            expectedRevision: AggregateRevisionSchema.parse(1),
            calendarInput: {
              localDate: partialManifest.days[0]!.localDate,
              localTime: partialManifest.days[0]!.localTime,
              durationMinutes: partialManifest.days[0]!.durationMinutes,
            },
            timezone: partialManifest.timeZone,
          },
          intent: {
            courseId,
            courseDayId,
            instructorId,
          },
        })
      ).status
    ).toBe('success');

    const resumed = await commands.execute(
      applyEnvelopeWithManifest('idem-provision-legacy-partial-resume', partialManifest)
    );
    expect(resumed.status).toBe('success');

    const course = parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data);
    const courseDays = parseCourseDays(
      [...executor.snapshot().docs.entries()]
        .filter(([path]) => path.startsWith(`${courseDaysCollectionPath(courseId)}/`))
        .map(([, doc]) => ({ data: doc.data ?? {} }))
    );
    expect(courseDays.map((day) => day.courseDayId).sort()).toEqual(
      [courseDayId, courseDayTwoId].sort()
    );
    expect(courseScheduleIsComplete(course!, courseDays)).toBe(true);

    expect(
      (
        await commands.execute({
          kind: 'archive_course',
          context: {
            ...adminContext('idem-provision-legacy-partial-archive'),
            expectedRevision: course!.revision,
          },
          intent: { courseId, reasonExplanation: 'Verify archived recovery is rejected' },
        })
      ).status
    ).toBe('success');
    const archivedDocsWithMissingDay = Object.fromEntries(
      [...executor.snapshot().docs.entries()]
        .filter(([path]) => path !== courseDayPath(courseId, courseDayTwoId))
        .map(([path, doc]) => [path, doc.data])
    );
    const archivedExecutor = createInMemoryCanonicalTransactionExecutor(archivedDocsWithMissingDay);
    const archivedCommands = createProductionCanonicalCommands(environment(), archivedExecutor);
    const archivedRecovery = await archivedCommands.execute(
      applyEnvelopeWithManifest('idem-provision-legacy-partial-archived-recovery', partialManifest)
    );
    expect(archivedRecovery.status).toBe('error');
    if (archivedRecovery.status === 'error') {
      expect(archivedRecovery.error.details).toEqual({ field: 'courseId', reason: 'unsupported' });
    }
    expect(
      [...archivedExecutor.snapshot().docs.keys()].filter((path) =>
        path.startsWith(`${courseDaysCollectionPath(courseId)}/`)
      )
    ).toHaveLength(1);
  });

  it('completes provision to enrollment e2e on staging fixture', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(legacyCourseFixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const applyResult = await commands.execute(applyEnvelope('idem-provision-enroll-a'));
    expect(applyResult.status).toBe('success');

    const course = parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data);
    expect(course).toBeDefined();

    const enrollmentEnvelope: CommandEnvelope<'create_course_enrollments'> = {
      kind: 'create_course_enrollments',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'idem-provision-enroll-b',
        correlationId: CorrelationIdSchema.parse('correlation_provision_enroll'),
        source: 'client_callable',
        expectedRevision: course!.revision,
      },
      intent: {
        courseId,
        participantIds: [participantId],
      },
    };
    const enrollmentResult = await commands.execute(enrollmentEnvelope);
    expect(enrollmentResult.status).toBe('success');
    const identity = resolveCommandIdempotencyIdentity(enrollmentEnvelope);
    const enrollmentId = courseEnrollmentIdFromCommandParticipant({
      commandId: identity.commandKey,
      participantId,
    });
    expect(
      executor.snapshot().docs.get(`course_enrollments/${enrollmentId}`)?.data?.lifecycle
    ).toEqual({ status: 'confirmed' });
  });

  it('replaces hybrid canonical course document without legacy keys and preserves revision', async () => {
    const hybridRevision = 7;
    const hybridCourse = {
      ...buildCourseAggregateFromManifest({
        manifest,
        revision: hybridRevision,
        decidedAt,
        audit: {
          createdByCommandId: 'command_hybrid_seed',
          lastChangedByCommandId: 'command_hybrid_seed',
          correlationId,
        },
      }),
      capacity: { totalSeats: 8, availableSeats: 7 },
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: deriveSchedulePlanFromManifest(manifest).finalCourseDayEndsAt,
        courseScheduleRevision: 6,
      },
    };
    const hybridFixture = {
      ...legacyCourseFixture(),
      [`courses/${courseId}`]: {
        ...toFirestoreWritePayload(hybridCourse as unknown as Record<string, unknown>),
        instructorIds: [instructorId],
        totalSeats: 8,
        availableSeats: 8,
        priceKZT: 50_000,
        duration: '1 day',
        description: 'Hybrid description on course doc',
        dates: '1 February',
        bgImageUrl: 'https://example.com/hybrid.webp',
        program: [{ day: 'Day 1', title: 'Hybrid', desc: 'Hybrid' }],
      },
      [courseDayPath(courseId, courseDayId)]: {
        courseId,
        courseDayId,
        dayOrder: 1,
        interval: resolveManifestDayInterval(manifest.days[0]!, manifest.timeZone).interval,
        timeZone: manifest.timeZone,
        actualInstructorIds: [instructorId],
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_day_seed',
          lastChangedByCommandId: 'command_day_seed',
          correlationId,
        },
      },
    };

    const executor = createInMemoryCanonicalTransactionExecutor(hybridFixture);
    const commands = createProductionCanonicalCommands(environment(), executor);
    const before = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(legacyCourseDocumentFailsCanonicalParse(before)).toBe(true);
    expect(courseDocumentExtraKeys(before)).toContain('instructorIds');

    const result = await commands.execute({
      kind: 'provision_canonical_course',
      context: adminContext('idem-hybrid-shape-repair'),
      intent: { manifest },
    });
    expect(result.status).toBe('success');

    const after = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(legacyCourseDocumentFailsCanonicalParse(after)).toBe(false);
    expect(courseDocumentExtraKeys(after)).toEqual([]);
    expect(after).not.toHaveProperty('instructorIds');
    expect(after).not.toHaveProperty('duration');
    const course = parseCourse(after);
    expect(course?.revision).toBe(hybridRevision);
    expect(course?.capacity.totalSeats).toBe(8);
    expect(course?.capacity.availableSeats).toBe(7);
    expect(course?.scheduleProjection.courseScheduleRevision).toBe(6);
    expect(course?.audit.createdByCommandId).toBe('command_hybrid_seed');
    expect(executor.snapshot().docs.has(courseDayPath(courseId, courseDayId))).toBe(true);
    const courseDays = parseCourseDays(
      [...executor.snapshot().docs.entries()]
        .filter(([path]) => path.startsWith(`${courseDaysCollectionPath(courseId)}/`))
        .map(([, doc]) => ({ data: doc.data ?? {} }))
    );
    expect(
      resolveInstructorCourseAssignmentProjection({
        instructorId,
        course: course!,
        courseDays,
      }).allowed
    ).toBe(true);
  });

  it('preserves occupied capacity during hybrid shape repair with seed_full manifest', async () => {
    const hybridRevision = 7;
    const hybridCourse = {
      ...buildCourseAggregateFromManifest({
        manifest,
        revision: hybridRevision,
        decidedAt,
        audit: {
          createdByCommandId: 'command_hybrid_capacity_seed',
          lastChangedByCommandId: 'command_hybrid_capacity_seed',
          correlationId,
        },
      }),
      capacity: { totalSeats: 8, availableSeats: 7 },
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: deriveSchedulePlanFromManifest(manifest).finalCourseDayEndsAt,
        courseScheduleRevision: 6,
      },
    };
    const enrollmentId = courseEnrollmentIdFromCommandParticipant({
      commandId: 'command_existing_enrollment',
      participantId,
    });
    const hybridFixture = {
      ...legacyCourseFixture(),
      [`courses/${courseId}`]: {
        ...toFirestoreWritePayload(hybridCourse as unknown as Record<string, unknown>),
        instructorIds: [instructorId],
        totalSeats: 8,
        availableSeats: 7,
        priceKZT: 50_000,
        duration: '1 day',
        description: 'Hybrid description on course doc',
      },
      [`course_enrollments/${enrollmentId}`]: {
        courseId,
        participantId,
        lifecycle: { status: 'confirmed' },
      },
      [courseDayPath(courseId, courseDayId)]: {
        courseId,
        courseDayId,
        dayOrder: 1,
        interval: resolveManifestDayInterval(manifest.days[0]!, manifest.timeZone).interval,
        timeZone: manifest.timeZone,
        actualInstructorIds: [instructorId],
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_day_seed',
          lastChangedByCommandId: 'command_day_seed',
          correlationId,
        },
      },
    };

    const executor = createInMemoryCanonicalTransactionExecutor(hybridFixture);
    const commands = createProductionCanonicalCommands(environment(), executor);
    const before = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(before?.capacity).toEqual({ totalSeats: 8, availableSeats: 7 });

    const result = await commands.execute({
      kind: 'provision_canonical_course',
      context: adminContext('idem-hybrid-shape-repair-capacity'),
      intent: { manifest },
    });
    expect(result.status).toBe('success');

    const after = parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data);
    expect(after?.capacity).toEqual({ totalSeats: 8, availableSeats: 7 });
    expect(executor.snapshot().docs.has(`course_enrollments/${enrollmentId}`)).toBe(true);
    expect(executor.snapshot().docs.has(courseDayPath(courseId, courseDayId))).toBe(true);
  });

  it('preserves schedule projection revision during hybrid shape repair', async () => {
    const hybridRevision = 6;
    const hybridCourse = {
      ...buildCourseAggregateFromManifest({
        manifest,
        revision: hybridRevision,
        decidedAt,
        audit: {
          createdByCommandId: 'command_hybrid_schedule_seed',
          lastChangedByCommandId: 'command_hybrid_schedule_seed',
          correlationId,
        },
      }),
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: deriveSchedulePlanFromManifest(manifest).finalCourseDayEndsAt,
        courseScheduleRevision: 6,
      },
    };
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...legacyCourseFixture(),
      [`courses/${courseId}`]: {
        ...toFirestoreWritePayload(hybridCourse as unknown as Record<string, unknown>),
        instructorIds: [instructorId],
        totalSeats: 8,
        availableSeats: 8,
        description: 'Hybrid schedule contamination',
      },
      [courseDayPath(courseId, courseDayId)]: {
        courseId,
        courseDayId,
        dayOrder: 1,
        interval: resolveManifestDayInterval(manifest.days[0]!, manifest.timeZone).interval,
        timeZone: manifest.timeZone,
        actualInstructorIds: [instructorId],
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_day_seed',
          lastChangedByCommandId: 'command_day_seed',
          correlationId,
        },
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);

    const result = await commands.execute({
      kind: 'provision_canonical_course',
      context: adminContext('idem-hybrid-shape-repair-schedule'),
      intent: { manifest },
    });
    expect(result.status).toBe('success');

    const after = parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data);
    expect(after?.scheduleProjection.courseScheduleRevision).toBe(6);
    expect(after?.scheduleProjection.courseDayCount).toBe(1);
  });

  it('reprovisions strict canonical course via update without shape replacement', async () => {
    const strictRevision = 3;
    const strictCreatedAt = decidedAt;
    const strictCourse = buildCourseAggregateFromManifest({
      manifest,
      revision: strictRevision,
      decidedAt: strictCreatedAt,
      audit: {
        createdByCommandId: 'command_strict_seed',
        lastChangedByCommandId: 'command_strict_seed',
        correlationId,
      },
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...legacyCourseFixture(),
      [`courses/${courseId}`]: toFirestoreWritePayload(
        strictCourse as unknown as Record<string, unknown>
      ),
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const before = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(courseDocumentExtraKeys(before)).toEqual([]);
    expect(legacyCourseDocumentFailsCanonicalParse(before)).toBe(false);

    const result = await commands.execute({
      kind: 'provision_canonical_course',
      context: adminContext('idem-strict-canonical-reprovision'),
      intent: { manifest },
    });
    expect(result.status).toBe('success');

    const after = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(legacyCourseDocumentFailsCanonicalParse(after)).toBe(false);
    expect(courseDocumentExtraKeys(after)).toEqual([]);
    expect(after?.createdAt).toEqual(strictCreatedAt);
    expect(after?.audit?.createdByCommandId).toBe('command_strict_seed');
    expect(parseCourse(after)?.revision).toBe(strictRevision);
  });
});
