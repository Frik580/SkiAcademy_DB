import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AttendanceSchema,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  TestSessionIdSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  paymentIdFromBookingId,
  testCanonicalExecutionScope,
  timestampFromDate,
  type CommandEnvelope,
  type ParticipantId,
  type LevelOperation,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_progress_cmd_01');
const studentAccountId = AccountIdSchema.parse('account_progress_student_01');
const instructorAccountId = AccountIdSchema.parse('account_progress_instructor_01');
const otherInstructorAccountId = AccountIdSchema.parse('account_progress_instructor_02');
const participantId = ParticipantIdSchema.parse('participant_progress_cmd_01');
const childParticipantId = ParticipantIdSchema.parse('participant_progress_cmd_child');
const managementId = ParticipantManagementIdSchema.parse('management_progress_cmd_01');
const childManagementId = ParticipantManagementIdSchema.parse('management_progress_cmd_child');
const instructorId = InstructorIdSchema.parse('instructor_progress_cmd_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_progress_cmd_02');
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
const childRelationshipId = instructorRelationshipIdFromPair({
  participantId: childParticipantId,
  instructorId,
});
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(now = new Date('2026-01-01T00:00:00.000Z')) {
  return { clock: createAuthoritativeCommandClock(now) };
}

function seedAccount(accountId: typeof studentAccountId) {
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

function seedParticipant(id: typeof participantId, management: typeof managementId) {
  return {
    participantId: id,
    displayName: id === childParticipantId ? 'Child' : 'Self',
    age: { kind: 'age_years', years: id === childParticipantId ? 8 : 30 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: management },
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

function seedManagement(
  id: typeof managementId,
  participant: typeof participantId,
  authority: 'self' | 'parent_guardian'
) {
  return {
    participantManagementId: id,
    participantId: participant,
    accountId: studentAccountId,
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
  };
}

function seedRelationship(
  id: typeof relationshipId,
  participant: typeof participantId,
  instructor: typeof instructorId,
  management: typeof managementId
) {
  return {
    instructorRelationshipId: id,
    participantId: participant,
    instructorId: instructor,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: management,
      grantedByAccountId: studentAccountId,
    },
    validFrom: decidedAt,
    expiresAt: instructorRelationshipExpiresAt(decidedAt),
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_relationship',
      lastChangedByCommandId: 'command_seed_relationship',
      correlationId,
    },
  };
}

function seedWorld() {
  return {
    'settings/skill_config': {
      passPercentage: 80,
      items: [
        { id: 'carving', title: 'Carving', levelTarget: 1, maxPoints: 25 },
        { id: 'skating', title: 'Skating', levelTarget: 2, maxPoints: 25 },
      ],
    },
    [`users/${studentAccountId}`]: seedAccount(studentAccountId),
    [`users/${instructorAccountId}`]: {
      ...seedAccount(instructorAccountId),
      instructorId,
    },
    [`users/${otherInstructorAccountId}`]: {
      ...seedAccount(otherInstructorAccountId),
      instructorId: otherInstructorId,
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach Progress',
      pricePerHourKZT: 12_000,
      linkedAccountId: instructorAccountId,
    },
    [`instructors/${otherInstructorId}`]: {
      id: otherInstructorId,
      name: 'Other Coach',
      pricePerHourKZT: 11_000,
      linkedAccountId: otherInstructorAccountId,
    },
    [`participants/${participantId}`]: seedParticipant(participantId, managementId),
    [`participants/${childParticipantId}`]: seedParticipant(childParticipantId, childManagementId),
    [`participant_management/${managementId}`]: seedManagement(managementId, participantId, 'self'),
    [`participant_management/${childManagementId}`]: seedManagement(
      childManagementId,
      childParticipantId,
      'parent_guardian'
    ),
    [`instructor_relationships/${relationshipId}`]: seedRelationship(
      relationshipId,
      participantId,
      instructorId,
      managementId
    ),
    [`instructor_relationships/${childRelationshipId}`]: seedRelationship(
      childRelationshipId,
      childParticipantId,
      instructorId,
      childManagementId
    ),
  };
}

function envelope(
  input: {
    readonly actorAccountId?: typeof instructorAccountId;
    readonly participantId?: typeof participantId;
    readonly expectedRevision?: number;
    readonly idempotencyKey?: string;
    readonly level?: number;
    readonly skillScores?: Record<string, number>;
    readonly skillComments?: Record<string, string>;
    readonly capability?: 'instructor' | 'account_owner' | 'parent_guardian';
  } = {}
): CommandEnvelope<'update_participant_progress'> {
  return {
    kind: 'update_participant_progress',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? instructorAccountId),
      exercisedCapability: input.capability ?? 'instructor',
      idempotencyKey: input.idempotencyKey ?? 'update-progress-01',
      correlationId,
      source: 'client_callable',
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    },
    intent: {
      participantId: input.participantId ?? participantId,
      level: input.level ?? 2,
      correctionReason: 'Corrected instructor assessment',
      skillScores: input.skillScores ?? { carving: 10 },
      skillComments: input.skillComments ?? { carving: 'Good edge' },
    },
  };
}

describe('participantProgressCommands', () => {
  it('atomically keeps participant daily baselines across updates, replay and the school-day rollover', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const at = new Date('2026-01-01T18:50:00Z');
    const commands = createProductionCanonicalCommands(environment(at), executor);
    const first = envelope({
      participantId: childParticipantId,
      expectedRevision: 0,
      skillScores: { carving: 5 },
    });
    expect((await commands.execute(first)).status).toBe('success');
    const path = `participant_progress/${childParticipantId}`;
    const firstDaily = executor.snapshot().docs.get(path)?.data.dailyProgress;
    expect(firstDaily).toMatchObject({
      date: '2026-01-01',
      timeZone: 'Asia/Almaty',
      baselineSkillScores: {},
      baselineLevel: 1,
      complete: true,
    });
    const second = envelope({
      participantId: childParticipantId,
      expectedRevision: 1,
      idempotencyKey: 'daily-second',
      level: 3,
      skillScores: { carving: 15 },
    });
    expect((await commands.execute(second)).status).toBe('success');
    expect((await commands.execute(second)).status).toBe('success');
    expect(executor.snapshot().docs.get(path)?.data).toMatchObject({
      revision: 2,
      dailyProgress: firstDaily,
    });
    const nextDay = createProductionCanonicalCommands(
      environment(new Date('2026-01-01T19:00:00Z')),
      executor
    );
    expect(
      (
        await nextDay.execute(
          envelope({
            participantId: childParticipantId,
            expectedRevision: 2,
            idempotencyKey: 'daily-next-day',
            level: 3,
            skillScores: { carving: 20 },
          })
        )
      ).status
    ).toBe('success');
    expect(executor.snapshot().docs.get(path)?.data.dailyProgress).toMatchObject({
      date: '2026-01-02',
      baselineSkillScores: { carving: 15 },
      baselineLevel: 1,
      complete: true,
    });
    expect(executor.snapshot().docs.has(`participant_progress/${participantId}`)).toBe(false);
  });
  it('lets an instructor with relationship authority create and then OCC-update progress', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      'settings/skill_config': {
        items: [{ id: 'carving', title: 'Configured carving', levelTarget: 1, maxPoints: 25 }],
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const created = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(created.status).toBe('success');
    if (created.status === 'success') {
      expect(created.payload).toMatchObject({ participantId, revision: 1 });
    }
    const updated = await commands.execute(
      envelope({
        expectedRevision: 1,
        idempotencyKey: 'update-progress-02',
        level: 3,
        skillScores: { carving: 20 },
      })
    );
    expect(updated.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data
    ).toMatchObject({
      participantId,
      level: 1,
      skillScores: { carving: 20 },
      revision: 2,
    });
    const levelLog = [...executor.snapshot().docs.values()].find(
      (doc) => doc.data.type === 'skill_scores_updated'
    );
    expect(levelLog?.data).toMatchObject({
      userId: studentAccountId,
      actorId: instructorAccountId,
      type: 'skill_scores_updated',
      dataScope: 'live',
      metadata: {
        skillDeltas: [
          {
            itemId: 'carving',
            title: 'Configured carving',
            maxPoints: 25,
          },
        ],
      },
    });
    expect(levelLog?.data.testSessionId).toBeUndefined();
  });

  it('writes the student activity log in the resolved TEST scope and replays once', async () => {
    const testSessionId = TestSessionIdSchema.parse('test_progress_activity_01');
    const scope = testCanonicalExecutionScope(testSessionId);
    const world = seedWorld();
    world[`users/${studentAccountId}`] = {
      ...seedAccount(studentAccountId),
      dataScope: 'test',
    };
    world[`users/${instructorAccountId}`] = {
      ...seedAccount(instructorAccountId),
      instructorId,
      dataScope: 'test',
    };
    world[`instructors/${instructorId}`] = {
      id: instructorId,
      name: 'TEST Coach',
      pricePerHourKZT: 12_000,
      linkedAccountId: instructorAccountId,
      dataScope: 'test',
      testSessionId,
    };
    world[`participants/${participantId}`] = {
      ...seedParticipant(participantId, managementId),
      dataScope: 'test',
      testSessionId,
    };
    const executor = createInMemoryCanonicalTransactionExecutor(world);
    const commands = createProductionCanonicalCommands({ ...environment(), scope }, executor);
    const request = envelope({ expectedRevision: 0, idempotencyKey: 'test-progress-activity-01' });

    expect((await commands.execute(request)).status).toBe('success');
    expect((await commands.execute(request)).status).toBe('success');

    const logPath = [...executor.snapshot().docs.entries()].find(
      ([, doc]) => doc.data.type === 'skill_scores_updated'
    )![0];
    const log = executor.snapshot().docs.get(logPath);
    expect(log?.data).toMatchObject({
      userId: studentAccountId,
      type: 'skill_scores_updated',
      dataScope: 'test',
      testSessionId,
    });
    expect([...executor.snapshot().docs.keys()].filter((path) => path === logPath)).toHaveLength(1);
  });

  it('creates revision 1 from a missing document and does not copy leftover /users progress', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`users/${studentAccountId}`]: {
        ...seedAccount(studentAccountId),
        level: 3,
        skillScores: { carving: 99 },
        skillComments: { carving: 'Legacy leftover' },
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const created = await commands.execute(envelope({ expectedRevision: 0, level: 2 }));
    expect(created.status).toBe('success');
    if (created.status === 'success') {
      expect(created.payload).toMatchObject({ participantId, revision: 1 });
    }
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data
    ).toMatchObject({
      participantId,
      level: 1,
      skillScores: { carving: 10 },
      skillComments: { carving: 'Good edge' },
      revision: 1,
    });
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data.skillScores
    ).not.toEqual({ carving: 99 });
    expect(executor.snapshot().docs.get(`users/${studentAccountId}`)?.data).toMatchObject({
      level: 3,
      skillScores: { carving: 99 },
    });
  });

  it('rejects a stale expectedRevision and retries the same idempotency key', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const stale = await commands.execute(
      envelope({ expectedRevision: 0, idempotencyKey: 'update-progress-stale' })
    );
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
    const replay = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(replay.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data
    ).toMatchObject({ revision: 1, level: 1 });
  });

  it('requires expectedRevision and instructor capability', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const missingRevision = await commands.execute(envelope());
    expect(missingRevision.status).toBe('error');
    if (missingRevision.status === 'error') expect(missingRevision.error.code).toBe('validation');
    const guardian = await commands.execute(
      envelope({
        expectedRevision: 0,
        capability: 'parent_guardian',
        actorAccountId: studentAccountId,
      })
    );
    expect(guardian.status).toBe('error');
    if (guardian.status === 'error') expect(guardian.error.code).toBe('forbidden');
  });

  it('denies an unrelated instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({
        expectedRevision: 0,
        actorAccountId: otherInstructorAccountId,
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('keeps self and child progress isolated', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0, level: 3 }))).status).toBe(
      'success'
    );
    expect(
      (
        await commands.execute(
          envelope({
            participantId: childParticipantId,
            expectedRevision: 0,
            idempotencyKey: 'update-child-01',
            level: 2,
            skillScores: { skating: 8 },
            skillComments: { skating: 'Child note' },
          })
        )
      ).status
    ).toBe('success');
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data
    ).toMatchObject({ level: 1, skillScores: { carving: 10 } });
    expect(
      executor.snapshot().docs.get(`participant_progress/${childParticipantId}`)?.data
    ).toMatchObject({
      level: 1,
      skillScores: { skating: 8 },
      skillComments: { skating: 'Child note' },
    });
  });
});

const bookingId = BookingIdSchema.parse('booking_progress_cmd_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_progress_cmd_01');
const lessonStartsAt = timestampFromDate(new Date('2025-12-31T09:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2025-12-31T10:00:00.000Z'));
const futureStartsAt = timestampFromDate(new Date('2026-06-01T09:00:00.000Z'));
const futureEndsAt = timestampFromDate(new Date('2026-06-01T10:00:00.000Z'));

const levelReason = {
  category: 'expert_assessment' as const,
  text: 'Observed qualification on snow',
};
function levelEnvelope(
  operation: LevelOperation,
  revision: number,
  admin = false,
  key = `${operation.action}-${revision}`
): CommandEnvelope<'manage_participant_level'> {
  return {
    kind: 'manage_participant_level',
    intent: { participantId, operation },
    context: {
      actor: accountCommandActor(admin ? studentAccountId : instructorAccountId),
      source: admin ? 'admin_callable' : 'client_callable',
      exercisedCapability: admin ? 'administrator' : 'instructor',
      expectedRevision: revision,
      correlationId,
      idempotencyKey: key,
    },
  };
}

describe('unified participant levels', () => {
  it('keeps TEST command identity and events scoped without notifying an unstamped LIVE account', async () => {
    const testSessionId = TestSessionIdSchema.parse('test_level_identity_01');
    const scope = testCanonicalExecutionScope(testSessionId);
    const world = seedWorld() as Record<string, Record<string, unknown>>;
    for (const path of [`instructors/${instructorId}`, `participants/${participantId}`]) {
      world[path] = { ...world[path], dataScope: 'test', testSessionId };
    }
    const executor = createInMemoryCanonicalTransactionExecutor(world);
    const commands = createProductionCanonicalCommands({ ...environment(), scope }, executor);
    expect(
      (await commands.execute(envelope({ expectedRevision: 0, skillScores: { carving: 20 } })))
        .status
    ).toBe('success');
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 1))).status).toBe(
      'success'
    );
    const docs = executor.snapshot().docs;
    const progress = docs.get(`participant_progress/${participantId}`)!.data;
    const audit = progress.audit as { lastChangedByCommandId: string };
    expect(docs.get(`participant_progress_events/${participantId}_2`)?.data).toMatchObject({
      commandId: audit.lastChangedByCommandId,
      dataScope: 'test',
      testSessionId,
    });
    expect([...docs.values()].some((doc) => doc.data.type === 'level_up')).toBe(false);
    expect(
      [...docs.values()].filter((doc) => doc.data.commandKind === 'manage_participant_level')
    ).toHaveLength(1);
  });
  const read = (executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>) =>
    executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data;
  it('does not invent administrative provenance for a historical official level', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`participant_progress/${participantId}`]: {
        participantId,
        level: 3,
        skillScores: { carving: 10 },
        skillComments: {},
        revision: 4,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_historical_level',
          lastChangedByCommandId: 'command_historical_level',
          correlationId,
        },
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (
        await commands.execute(
          levelEnvelope({ action: 'request', level: 2, reason: levelReason }, 4)
        )
      ).status
    ).toBe('success');
    const progress = executor.snapshot().docs.get(`participant_progress/${participantId}`)!.data;
    expect(progress).toMatchObject({
      level: 3,
      skillScores: { carving: 10 },
      levelState: { method: 'historical', qualifications: [] },
    });
    expect((progress.levelState as Record<string, unknown>).assignedThroughLevel).toBeUndefined();
  });
  it('keeps low/ready XP separate from level and confirms once with OCC and replay', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (await commands.execute(envelope({ expectedRevision: 0, skillScores: { carving: 19 } })))
        .status
    ).toBe('success');
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 1))).status).toBe('error');
    expect(read(executor)?.level).toBe(1);
    expect(
      (
        await commands.execute(
          envelope({ expectedRevision: 1, idempotencyKey: 'ready', skillScores: { carving: 20 } })
        )
      ).status
    ).toBe('success');
    expect(read(executor)?.level).toBe(1);
    const confirmation = levelEnvelope({ action: 'confirm' }, 2);
    expect((await commands.execute(confirmation)).status).toBe('success');
    expect((await commands.execute(confirmation)).status).toBe('success');
    expect(read(executor)).toMatchObject({ level: 2, revision: 3, skillScores: { carving: 20 } });
    expect(
      (await commands.execute(levelEnvelope({ action: 'confirm' }, 2, false, 'second-click')))
        .status
    ).toBe('error');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) =>
        path.startsWith('participant_progress_events/')
      )
    ).toHaveLength(3);
  });
  it('rechecks corrected scores before confirmation and reviews a confirmed qualification without demoting', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    await commands.execute(envelope({ expectedRevision: 0, skillScores: { carving: 20 } }));
    await commands.execute(
      envelope({
        expectedRevision: 1,
        idempotencyKey: 'correct-before',
        skillScores: { carving: 10 },
      })
    );
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 2))).status).toBe('error');
    await commands.execute(
      envelope({ expectedRevision: 2, idempotencyKey: 'restore', skillScores: { carving: 20 } })
    );
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 3))).status).toBe(
      'success'
    );
    await commands.execute(
      envelope({
        expectedRevision: 4,
        idempotencyKey: 'correct-after',
        skillScores: { carving: 5 },
      })
    );
    expect(read(executor)).toMatchObject({
      level: 2,
      levelState: { qualifications: [{ stage: 1, status: 'review' }] },
    });
    expect(
      (await commands.execute(levelEnvelope({ action: 'retain', reason: levelReason }, 5))).status
    ).toBe('success');
    expect(read(executor)).toMatchObject({
      level: 2,
      levelState: { qualifications: [{ status: 'retained' }] },
    });
    await commands.execute(
      envelope({
        expectedRevision: 6,
        idempotencyKey: 'correct-again',
        skillScores: { carving: 1 },
      })
    );
    expect(read(executor)).toMatchObject({
      level: 2,
      levelState: { qualifications: [{ status: 'review' }] },
    });
  });
  it('assigns Performance with no artificial scores/XP and preserves existing scores on demotion', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      await commands.execute(
        levelEnvelope({ action: 'assign', level: 3, reason: levelReason }, 0, true)
      )
    ).toMatchObject({ status: 'success' });
    expect(read(executor)).toMatchObject({ level: 3, skillScores: {}, skillComments: {} });
    await commands.execute(
      envelope({
        expectedRevision: 1,
        skillScores: { carving: 10 },
        idempotencyKey: 'score-manual',
      })
    );
    expect(
      (
        await commands.execute(
          levelEnvelope({ action: 'assign', level: 1, reason: levelReason }, 2, true)
        )
      ).status
    ).toBe('success');
    expect(read(executor)).toMatchObject({ level: 1, skillScores: { carving: 10 } });
  });
  it('creates one active request, approves atomically and never processes it twice', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (
        await commands.execute(
          levelEnvelope({ action: 'request', level: 3, reason: levelReason }, 0)
        )
      ).status
    ).toBe('success');
    const request = read(executor)?.levelState as {
      request: { requestId: LevelOperation & string };
    };
    expect(
      (
        await commands.execute(
          levelEnvelope({ action: 'request', level: 2, reason: levelReason }, 1)
        )
      ).status
    ).toBe('error');
    const approval = levelEnvelope(
      { action: 'approve', requestId: request.request.requestId },
      1,
      true
    );
    expect((await commands.execute(approval)).status).toBe('success');
    expect((await commands.execute(approval)).status).toBe('success');
    expect(read(executor)).toMatchObject({
      level: 3,
      revision: 2,
      skillScores: {},
      levelState: { request: { status: 'approved' } },
    });
    expect(
      (
        await commands.execute(
          levelEnvelope({ action: 'approve', requestId: request.request.requestId }, 2, true)
        )
      ).status
    ).toBe('error');
  });
  it.each(['reject', 'cancel'] as const)(
    '%s closes a request without changing scores or level',
    async (action) => {
      const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
      const commands = createProductionCanonicalCommands(environment(), executor);
      await commands.execute(
        levelEnvelope({ action: 'request', level: 3, reason: levelReason }, 0)
      );
      const requestId = (read(executor)?.levelState as { request: { requestId: never } }).request
        .requestId;
      const operation =
        action === 'reject' ? { action, requestId, reason: levelReason } : { action, requestId };
      expect(
        (await commands.execute(levelEnvelope(operation, 1, action === 'reject'))).status
      ).toBe('success');
      expect(read(executor)).toMatchObject({
        level: 1,
        skillScores: {},
        levelState: { request: { status: action === 'reject' ? 'rejected' : 'cancelled' } },
      });
    }
  );
  it('marks pending request stale after manual assignment and rejects its approval', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    await commands.execute(levelEnvelope({ action: 'request', level: 3, reason: levelReason }, 0));
    const requestId = (read(executor)?.levelState as { request: { requestId: never } }).request
      .requestId;
    await commands.execute(
      levelEnvelope({ action: 'assign', level: 2, reason: levelReason }, 1, true)
    );
    expect(read(executor)).toMatchObject({
      level: 2,
      levelState: { request: { status: 'stale' } },
    });
    expect(
      (await commands.execute(levelEnvelope({ action: 'approve', requestId }, 2, true))).status
    ).toBe('error');
  });
  it('denies unrelated instructors and account owners; requires correction and rejection reasons', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const alien = levelEnvelope({ action: 'request', level: 3, reason: levelReason }, 0);
    alien.context.actor = accountCommandActor(otherInstructorAccountId);
    expect((await commands.execute(alien)).status).toBe('error');
    const owner = levelEnvelope({ action: 'assign', level: 3, reason: levelReason }, 0);
    owner.context.exercisedCapability = 'account_owner';
    expect((await commands.execute(owner)).status).toBe('error');
    await commands.execute(envelope({ expectedRevision: 0, skillScores: { carving: 10 } }));
    const correction = envelope({ expectedRevision: 1, skillScores: {} });
    delete correction.intent.correctionReason;
    expect((await commands.execute(correction)).status).toBe('error');
  });
  it('uses current server configuration at confirmation and refuses a maximum-level promotion', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      'settings/skill_config': {
        passPercentage: 90,
        items: [{ id: 'carving', levelTarget: 1, maxPoints: 25 }],
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    await commands.execute(envelope({ expectedRevision: 0, skillScores: { carving: 20 } }));
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 1))).status).toBe('error');
    await commands.execute(
      levelEnvelope({ action: 'assign', level: 4, reason: levelReason }, 1, true)
    );
    expect((await commands.execute(levelEnvelope({ action: 'confirm' }, 2))).status).toBe('error');
  });
});

function seedWorldWithoutRelationships() {
  const world = seedWorld() as Record<string, unknown>;
  delete world[`instructor_relationships/${relationshipId}`];
  delete world[`instructor_relationships/${childRelationshipId}`];
  return world as ReturnType<typeof seedWorld>;
}

function seedBooking(input: {
  readonly status: 'confirmed' | 'completed' | 'no_show';
  readonly participantIds?: readonly ParticipantId[];
  readonly startsAt?: typeof lessonStartsAt;
  readonly endsAt?: typeof lessonEndsAt;
}) {
  const participantIds = input.participantIds ?? [participantId];
  const startsAt = input.startsAt ?? lessonStartsAt;
  const endsAt = input.endsAt ?? lessonEndsAt;
  const createdAt = timestampFromDate(new Date('2025-12-01T00:00:00.000Z'));
  const updatedAt = input.status === 'confirmed' ? createdAt : endsAt;
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: studentAccountId },
    },
    party: {
      kind: participantIds.length === 1 ? 'individual' : 'family_group',
      participantIds,
    },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: {
        startsAt,
        endsAt,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds, frozenAt: startsAt },
    },
    lifecycle:
      input.status === 'completed'
        ? { status: 'completed', completedAt: endsAt }
        : input.status === 'no_show'
          ? { status: 'no_show', noShowAt: endsAt }
          : { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 1,
    createdAt,
    updatedAt,
    audit: {
      createdByCommandId: 'command_seed_booking',
      lastChangedByCommandId: 'command_seed_booking',
      correlationId,
    },
  });
}

function seedAttendance(
  targetParticipantId: ParticipantId,
  attendanceStatus: 'present' | 'absent'
) {
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: targetParticipantId,
  });
  return {
    path: `attendance/${attendanceId}`,
    data: AttendanceSchema.parse({
      attendanceId,
      subject: {
        subjectKind: 'booking',
        bookingId,
        occurrenceId,
        participantId: targetParticipantId,
      },
      attendanceStatus,
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: lessonEndsAt,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: lessonEndsAt,
      revision: 1,
      correlationId,
    }),
  };
}

describe('participantProgressCommands booking-scoped evidence', () => {
  it('keeps active InstructorRelationship authority even when the only Booking is no_show', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'no_show' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });
  it('allows confirmed booking-based progress without Attendance after startsAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('allows confirmed booking-based progress after startsAt with present attendance', async () => {
    const present = seedAttendance(participantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('allows a valid started lesson even when Attendance is absent', async () => {
    const absent = seedAttendance(participantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('keeps active InstructorRelationship authority without attendance facts', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('keeps active InstructorRelationship authority when attendance is absent', async () => {
    const absent = seedAttendance(participantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('denies confirmed booking-based evaluation before startsAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'confirmed',
        startsAt: futureStartsAt,
        endsAt: futureEndsAt,
      }) as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('does not treat no_show as booking-based progress authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'no_show' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('allows each service Participant of a started group lesson', async () => {
    const present = seedAttendance(participantId, 'present');
    const absent = seedAttendance(childParticipantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'completed',
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const presentResult = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(presentResult.status).toBe('success');
    const absentResult = await commands.execute(
      envelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'update-absent-child',
      })
    );
    expect(absentResult.status).toBe('success');
  });

  it('allows a sibling with missing Attendance on the same started lesson', async () => {
    const present = seedAttendance(participantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'completed',
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const missingSibling = await commands.execute(
      envelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'update-missing-child',
      })
    );
    expect(missingSibling.status).toBe('success');
  });

  it('allows the exact lesson start according to the authoritative command clock', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(
      environment(new Date('2025-12-31T09:00:00.000Z')),
      executor
    ).execute(envelope({ expectedRevision: 0 }));
    expect(result.status).toBe('success');
  });

  it('denies a different instructor and an unrelated Participant', async () => {
    const world = {
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    };
    const otherInstructor = await createProductionCanonicalCommands(
      environment(),
      createInMemoryCanonicalTransactionExecutor(world)
    ).execute(envelope({ actorAccountId: otherInstructorAccountId, expectedRevision: 0 }));
    expect(otherInstructor.status).toBe('error');
    if (otherInstructor.status === 'error') expect(otherInstructor.error.code).toBe('forbidden');

    const unrelated = await createProductionCanonicalCommands(
      environment(),
      createInMemoryCanonicalTransactionExecutor(world)
    ).execute(envelope({ participantId: childParticipantId, expectedRevision: 0 }));
    expect(unrelated.status).toBe('error');
    if (unrelated.status === 'error') expect(unrelated.error.code).toBe('forbidden');
  });
});
