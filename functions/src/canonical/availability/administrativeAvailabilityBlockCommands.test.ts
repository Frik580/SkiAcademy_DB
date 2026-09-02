import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AdministrativeAvailabilityBlockIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const adminAccountId = AccountIdSchema.parse('account_admin_planner_block');
const instructorId = InstructorIdSchema.parse('instructor_admin_planner_block');
const correlationId = CorrelationIdSchema.parse('correlation_admin_planner_block');
const decidedAt = timestampFromDate(new Date('2026-09-01T00:00:00.000Z'));

function fixture() {
  return {
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_admin_planner_block',
        lastChangedByCommandId: 'command_seed_admin_planner_block',
        correlationId,
      },
    }),
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Planner Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
  };
}

function createEnvelope(input: {
  readonly blockId: string;
  readonly kind: 'break' | 'day_off';
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly idempotencyKey: string;
}): CommandEnvelope<'create_administrative_availability_block'> {
  return {
    kind: 'create_administrative_availability_block',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'admin_callable',
      calendarInput: {
        localDate: '2026-09-02',
        localTime: input.localTime,
        durationMinutes: input.durationMinutes,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      blockId: AdministrativeAvailabilityBlockIdSchema.parse(input.blockId),
      instructorId,
      kind: input.kind,
      notes: input.kind === 'break' ? 'Lunch' : 'Rest day',
      reasonExplanation: 'Admin Planner availability action',
    },
  };
}

function commands(executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date('2026-09-01T00:00:00.000Z')) },
    executor
  );
}

describe('administrative availability block commands', () => {
  it.each([
    { kind: 'break' as const, localTime: '12:00', durationMinutes: 60 },
    { kind: 'day_off' as const, localTime: '08:00', durationMinutes: 660 },
  ])('creates a Planner $kind with one replay-safe instructor claim', async (input) => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const runtime = commands(executor);
    const blockId = `block_admin_planner_${input.kind}`;
    const envelope = createEnvelope({
      blockId,
      ...input,
      idempotencyKey: `admin-planner-${input.kind}`,
    });

    await expect(runtime.execute(envelope)).resolves.toMatchObject({ status: 'success' });
    await expect(runtime.execute(envelope)).resolves.toMatchObject({ status: 'success' });

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`administrative_availability_blocks/${blockId}`)?.data).toMatchObject({
      blockId,
      instructorId,
      kind: input.kind,
      lifecycle: 'active',
      revision: 1,
      scheduleRevision: 1,
    });
    const claims = [...snapshot.docs.entries()].filter(([path]) =>
      path.startsWith('resource_claims/')
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.[1].data).toMatchObject({
      claimKind: 'administrative_availability_block',
      resourceKind: 'instructor',
      resourceId: instructorId,
      ownerKind: 'administrative_block',
      ownerId: blockId,
      lifecycle: { status: 'active' },
    });
  });

  it('rejects a break that overlaps an active day-off claim', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const runtime = commands(executor);
    await expect(
      runtime.execute(
        createEnvelope({
          blockId: 'block_admin_planner_day_off_overlap',
          kind: 'day_off',
          localTime: '08:00',
          durationMinutes: 660,
          idempotencyKey: 'admin-planner-day-off-overlap',
        })
      )
    ).resolves.toMatchObject({ status: 'success' });

    const result = await runtime.execute(
      createEnvelope({
        blockId: 'block_admin_planner_break_overlap',
        kind: 'break',
        localTime: '12:00',
        durationMinutes: 60,
        idempotencyKey: 'admin-planner-break-overlap',
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('instructor_conflict');
  });

  it('reschedules and releases a block with revision guards', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const runtime = commands(executor);
    const blockId = AdministrativeAvailabilityBlockIdSchema.parse('block_admin_planner_lifecycle');
    await runtime.execute(
      createEnvelope({
        blockId,
        kind: 'break',
        localTime: '12:00',
        durationMinutes: 60,
        idempotencyKey: 'admin-planner-block-create-lifecycle',
      })
    );

    const reschedule: CommandEnvelope<'reschedule_administrative_availability_block'> = {
      kind: 'reschedule_administrative_availability_block',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'admin-planner-block-reschedule',
        correlationId,
        expectedRevision: 1,
        source: 'admin_callable',
        calendarInput: {
          localDate: '2026-09-02',
          localTime: '13:00',
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
      },
      intent: { blockId, reasonExplanation: 'Move Planner break' },
    };
    await expect(runtime.execute(reschedule)).resolves.toMatchObject({ status: 'success' });

    const release: CommandEnvelope<'release_administrative_availability_block'> = {
      kind: 'release_administrative_availability_block',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'admin-planner-block-release',
        correlationId,
        expectedRevision: 2,
        source: 'admin_callable',
      },
      intent: { blockId, reasonExplanation: 'Release Planner break' },
    };
    await expect(runtime.execute(release)).resolves.toMatchObject({ status: 'success' });

    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`administrative_availability_blocks/${blockId}`)?.data).toMatchObject({
      lifecycle: 'released',
      revision: 3,
      scheduleRevision: 2,
    });
    const claims = [...snapshot.docs.entries()]
      .filter(([path]) => path.startsWith('resource_claims/'))
      .map(([, document]) => document.data);
    expect(claims).toHaveLength(2);
    expect(claims.filter((claim) => claim.lifecycle?.status === 'released')).toHaveLength(2);
  });
});
