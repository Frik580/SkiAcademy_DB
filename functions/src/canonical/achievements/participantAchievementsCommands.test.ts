import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_achievements_cmd_01');
const studentAccountId = AccountIdSchema.parse('account_achievements_student_01');
const otherAccountId = AccountIdSchema.parse('account_achievements_other_01');
const instructorAccountId = AccountIdSchema.parse('account_achievements_instructor_01');
const participantId = ParticipantIdSchema.parse('participant_achievements_cmd_01');
const childParticipantId = ParticipantIdSchema.parse('participant_achievements_cmd_child');
const managementId = ParticipantManagementIdSchema.parse('management_achievements_cmd_01');
const childManagementId = ParticipantManagementIdSchema.parse('management_achievements_cmd_child');
const instructorId = InstructorIdSchema.parse('instructor_achievements_cmd_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const earnedAt = timestampFromDate(new Date('2026-01-10T12:00:00.000Z'));

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) };
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

function seedParticipant(id: ParticipantId, management: typeof managementId) {
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

function seedWorld() {
  return {
    [`users/${studentAccountId}`]: seedAccount(studentAccountId),
    [`users/${instructorAccountId}`]: {
      ...seedAccount(instructorAccountId),
      instructorId,
    },
    [`users/${otherAccountId}`]: seedAccount(otherAccountId),
    [`participants/${participantId}`]: seedParticipant(participantId, managementId),
    [`participants/${childParticipantId}`]: seedParticipant(childParticipantId, childManagementId),
    [`participant_management/${managementId}`]: seedManagement(managementId, participantId, 'self'),
    [`participant_management/${childManagementId}`]: seedManagement(
      childManagementId,
      childParticipantId,
      'parent_guardian'
    ),
  };
}

function envelope(
  input: {
    readonly actorAccountId?: typeof studentAccountId;
    readonly participantId?: typeof participantId;
    readonly expectedRevision?: number;
    readonly idempotencyKey?: string;
    readonly achievementId?: string;
    readonly capability?: 'account_owner' | 'parent_guardian' | 'instructor';
  } = {}
): CommandEnvelope<'record_participant_achievements'> {
  return {
    kind: 'record_participant_achievements',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? studentAccountId),
      exercisedCapability: input.capability ?? 'account_owner',
      idempotencyKey: input.idempotencyKey ?? 'record-achievements-01',
      correlationId,
      source: 'client_callable',
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    },
    intent: {
      participantId: input.participantId ?? participantId,
      earned: [
        {
          achievementId: input.achievementId ?? 'first_lesson',
          earnedAt,
          source: 'participant_attendance',
        },
      ],
    },
  };
}

describe('participantAchievementsCommands', () => {
  it('28. records a participant achievement once and ignores a duplicate earn', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const created = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(created.status).toBe('success');
    if (created.status === 'success') {
      expect(created.payload).toMatchObject({
        participantId,
        revision: 1,
        newlyEarnedAchievementIds: ['first_lesson'],
      });
    }
    const duplicate = await commands.execute(
      envelope({ expectedRevision: 1, idempotencyKey: 'record-achievements-02' })
    );
    expect(duplicate.status).toBe('success');
    if (duplicate.status === 'success') {
      expect(duplicate.payload).toMatchObject({
        revision: 1,
        newlyEarnedAchievementIds: [],
      });
    }
    expect(
      executor.snapshot().docs.get(`participant_achievements/${participantId}`)?.data
    ).toMatchObject({
      participantId,
      revision: 1,
      earned: { first_lesson: { source: 'participant_attendance' } },
    });
  });

  it('29. reload of the aggregate preserves earned achievement', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const stored = executor.snapshot().docs.get(`participant_achievements/${participantId}`)?.data;
    expect(stored?.earned.first_lesson).toMatchObject({ source: 'participant_attendance' });
  });

  it('30–31. self and child persistence are independent', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    expect(
      (
        await commands.execute(
          envelope({
            participantId: childParticipantId,
            expectedRevision: 0,
            idempotencyKey: 'record-child-01',
            capability: 'parent_guardian',
            achievementId: 'ten_lessons',
          })
        )
      ).status
    ).toBe('success');
    expect(
      executor.snapshot().docs.get(`participant_achievements/${participantId}`)?.data.earned
    ).toMatchObject({ first_lesson: { source: 'participant_attendance' } });
    expect(
      executor.snapshot().docs.get(`participant_achievements/${childParticipantId}`)?.data.earned
    ).toMatchObject({ ten_lessons: { source: 'participant_attendance' } });
    expect(
      executor.snapshot().docs.get(`participant_achievements/${participantId}`)?.data.earned
        .ten_lessons
    ).toBeUndefined();
  });

  it('32–33. config refresh / same ids do not duplicate; replay is idempotent', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const replay = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(replay.status).toBe('success');
    expect(
      executor.snapshot().docs.get(`participant_achievements/${participantId}`)?.data.revision
    ).toBe(1);
  });

  it('34. stale expectedRevision is rejected and a later matching revision succeeds', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const stale = await commands.execute(
      envelope({ expectedRevision: 0, idempotencyKey: 'record-achievements-stale' })
    );
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
    const next = await commands.execute(
      envelope({
        expectedRevision: 1,
        idempotencyKey: 'record-achievements-ten',
        achievementId: 'ten_lessons',
      })
    );
    expect(next.status).toBe('success');
    if (next.status === 'success') {
      expect(next.payload).toMatchObject({
        revision: 2,
        newlyEarnedAchievementIds: ['ten_lessons'],
      });
    }
  });

  it('rejects instructor capability and unrelated accounts', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const instructor = await commands.execute(
      envelope({
        expectedRevision: 0,
        actorAccountId: instructorAccountId,
        capability: 'instructor',
      })
    );
    expect(instructor.status).toBe('error');
    if (instructor.status === 'error') expect(instructor.error.code).toBe('forbidden');
    const other = await commands.execute(
      envelope({
        expectedRevision: 0,
        actorAccountId: otherAccountId,
        idempotencyKey: 'record-other-01',
      })
    );
    expect(other.status).toBe('error');
    if (other.status === 'error') expect(other.error.code).toBe('forbidden');
  });

  it('rejects feedback_given as a persisted participant achievement', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0, achievementId: 'feedback_given' })
    );
    expect(result.status).toBe('error');
  });
});
