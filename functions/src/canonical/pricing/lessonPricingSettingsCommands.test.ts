import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  accountCommandActor,
  activityLogIdFromCommandId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const adminAccountId = AccountIdSchema.parse('account_pricing_admin_01');
const correlationId = CorrelationIdSchema.parse('correlation_pricing_admin_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function envelope(
  expectedRevision: number,
  idempotencyKey: string,
  surcharge = 6_000,
  maxParticipantsPerLesson = 4
) {
  return {
    kind: 'update_lesson_pricing_settings',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      additionalParticipantSurchargePerHourKzt: surcharge,
      maxParticipantsPerLesson,
      reasonExplanation: 'Seasonal pricing policy',
    },
  } as CommandEnvelope<'update_lesson_pricing_settings'>;
}

function executor() {
  return createInMemoryCanonicalTransactionExecutor({
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_admin',
        lastChangedByCommandId: 'command_seed_admin',
        correlationId,
      },
    }),
  });
}

describe('update_lesson_pricing_settings command', () => {
  it('creates the singleton, audits it, and replays idempotently', async () => {
    const tx = executor();
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      tx
    );
    const command = envelope(0, 'pricing-create-01');
    expect((await commands.execute(command)).status).toBe('success');
    expect((await commands.execute(command)).status).toBe('success');
    const snapshot = tx.snapshot();
    expect(snapshot.docs.get('lesson_pricing_settings/lesson_booking')?.data).toMatchObject({
      additionalParticipantSurchargePerHourKzt: 6_000,
      maxParticipantsPerLesson: 4,
      revision: 1,
    });
    const identity = resolveCommandIdempotencyIdentity(command);
    expect(
      snapshot.docs.get(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)?.data
    ).toMatchObject({
      reason: { reasonCode: 'manual_override', explanation: 'Seasonal pricing policy' },
      effects: [
        {
          kind: 'pricing_settings_changed',
          summary: 'Lesson pricing and participant limit settings changed',
        },
      ],
    });
  });

  it('updates with OCC and rejects a stale revision without changing the value', async () => {
    const tx = executor();
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      tx
    );
    expect((await commands.execute(envelope(0, 'pricing-create-02'))).status).toBe('success');
    expect((await commands.execute(envelope(1, 'pricing-update-02', 8_000, 2))).status).toBe(
      'success'
    );
    const stale = await commands.execute(envelope(1, 'pricing-stale-02', 9_000, 1));
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
    expect(tx.snapshot().docs.get('lesson_pricing_settings/lesson_booking')?.data).toMatchObject({
      additionalParticipantSurchargePerHourKzt: 8_000,
      maxParticipantsPerLesson: 2,
      revision: 2,
    });
  });

  it('updates surcharge and maximum independently through the same OCC command', async () => {
    const tx = executor();
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      tx
    );
    expect((await commands.execute(envelope(0, 'pricing-create-independent'))).status).toBe(
      'success'
    );
    expect((await commands.execute(envelope(1, 'pricing-max-independent', 6_000, 2))).status).toBe(
      'success'
    );
    expect(
      (await commands.execute(envelope(2, 'pricing-surcharge-independent', 9_000, 2))).status
    ).toBe('success');
    expect(tx.snapshot().docs.get('lesson_pricing_settings/lesson_booking')?.data).toMatchObject({
      additionalParticipantSurchargePerHourKzt: 9_000,
      maxParticipantsPerLesson: 2,
      revision: 3,
    });
  });

  it('rejects a non-administrator context', async () => {
    const tx = executor();
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      tx
    );
    const command = envelope(0, 'pricing-forbidden-01');
    const result = await commands.execute({
      ...command,
      context: {
        ...command.context,
        exercisedCapability: 'account_owner',
        source: 'client_callable',
      },
    } as CommandEnvelope<'update_lesson_pricing_settings'>);
    expect(result.status).toBe('error');
    expect(tx.snapshot().docs.has('lesson_pricing_settings/lesson_booking')).toBe(false);
  });

  it('rewrites a pre-cutover per-lesson surcharge document instead of failing internal', async () => {
    const tx = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: AccountSchema.parse({
        accountId: adminAccountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_admin',
          lastChangedByCommandId: 'command_seed_admin',
          correlationId,
        },
      }),
      'lesson_pricing_settings/lesson_booking': {
        settingsId: 'lesson_booking',
        additionalParticipantSurchargeKzt: 6_000,
        maxParticipantsPerLesson: 4,
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_legacy_pricing',
          lastChangedByCommandId: 'command_seed_legacy_pricing',
          correlationId,
        },
      },
    });
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
      tx
    );
    const result = await commands.execute(envelope(1, 'pricing-legacy-rewrite-01', 7_000, 3));
    expect(result.status).toBe('success');
    const stored = tx.snapshot().docs.get('lesson_pricing_settings/lesson_booking')?.data;
    expect(stored).toMatchObject({
      additionalParticipantSurchargePerHourKzt: 7_000,
      maxParticipantsPerLesson: 3,
      revision: 2,
    });
    expect(stored).not.toHaveProperty('additionalParticipantSurchargeKzt');
  });
});
