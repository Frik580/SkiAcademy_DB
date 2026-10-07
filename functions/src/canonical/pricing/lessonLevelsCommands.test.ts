import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  DEFAULT_LESSON_LEVELS,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
  type LessonLevelDefinition,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { assertActiveLessonLevel } from './lessonLevelsStore';

const accountId = AccountIdSchema.parse('account_level_admin');
const correlationId = CorrelationIdSchema.parse('correlation_level_admin');
const now = new Date('2026-10-01T00:00:00Z');
const at = timestampFromDate(now);
function setup() {
  const tx = createInMemoryCanonicalTransactionExecutor({
    [`users/${accountId}`]: AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    'bookings/historical': { difficulty: 'ADVANCED', notes: 'Historical lesson' },
  });
  return {
    tx,
    commands: createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(now) },
      tx
    ),
  };
}
function envelope(
  levels: readonly LessonLevelDefinition[],
  revision: number,
  key: string
): CommandEnvelope<'update_lesson_levels'> {
  return {
    kind: 'update_lesson_levels',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'administrator',
      source: 'admin_callable',
      idempotencyKey: key,
      correlationId,
      expectedRevision: AggregateRevisionSchema.parse(revision),
    },
    intent: { levels: [...levels], reasonExplanation: 'Catalog management' },
  };
}
describe('canonical lesson level commands', () => {
  it('initializes, adds, edits, reorders, archives and restores without rewriting history', async () => {
    const { tx, commands } = setup();
    const execute = async (levels: readonly LessonLevelDefinition[], revision: number) => {
      const result = await commands.execute(envelope(levels, revision, `levels-${revision}`));
      expect(result.status).toBe('success');
    };
    await execute(DEFAULT_LESSON_LEVELS, 0);
    const added = [
      ...DEFAULT_LESSON_LEVELS,
      { id: 'race', nameRu: 'Гонки', nameEn: 'Race', marker: '🏁', order: 5, isActive: true },
    ];
    await execute(added, 1);
    const edited = added.map((level) =>
      level.id === 'advanced' ? { ...level, nameRu: 'Экспертный' } : level
    );
    await execute(edited, 2);
    const reordered = [...edited].reverse().map((level, order) => ({ ...level, order }));
    await execute(reordered, 3);
    const archived = reordered.map((level) =>
      level.id === 'advanced' ? { ...level, isActive: false } : level
    );
    await execute(archived, 4);
    expect(tx.snapshot().docs.get('bookings/historical')?.data).toEqual({
      difficulty: 'ADVANCED',
      notes: 'Historical lesson',
    });
    await execute(reordered, 5);
    expect(tx.snapshot().docs.get('settings/lesson_levels')?.data).toMatchObject({
      revision: 6,
      levels: reordered,
    });
    const logs = [...tx.snapshot().docs].filter(([path]) => path.startsWith('activity_logs/'));
    expect(logs).toHaveLength(6);
    expect(logs[0][1].data).toMatchObject({
      primarySubject: {
        kind: 'lesson_levels',
        id: 'lesson_levels',
        subjectKey: 'lesson_levels:lesson_levels',
      },
      effects: [{ kind: 'lesson_levels_changed' }],
    });
  });
  it('replays idempotently and rejects stale writes', async () => {
    const { tx, commands } = setup();
    const request = envelope(DEFAULT_LESSON_LEVELS, 0, 'levels-replay');
    expect((await commands.execute(request)).status).toBe('success');
    expect((await commands.execute(request)).status).toBe('success');
    const stale = await commands.execute(envelope(DEFAULT_LESSON_LEVELS, 0, 'levels-stale'));
    expect(stale).toMatchObject({ status: 'error', error: { code: 'stale_version' } });
    expect(tx.snapshot().docs.get('settings/lesson_levels')?.data).toMatchObject({ revision: 1 });
  });
  it('rejects non-admin capability, deletion, duplicate ID and invalid catalogs', async () => {
    const { tx, commands } = setup();
    const request = envelope(DEFAULT_LESSON_LEVELS, 0, 'levels-forbidden');
    expect(
      (
        await commands.execute({
          ...request,
          context: {
            ...request.context,
            exercisedCapability: 'account_owner',
            source: 'client_callable',
          },
        })
      ).status
    ).toBe('error');
    for (const [index, levels] of [
      DEFAULT_LESSON_LEVELS.slice(1),
      DEFAULT_LESSON_LEVELS.map((level) => ({ ...level, isActive: false })),
      [...DEFAULT_LESSON_LEVELS, { ...DEFAULT_LESSON_LEVELS[0], order: 5 }],
      DEFAULT_LESSON_LEVELS.map((level) => ({ ...level, nameEn: '' })),
    ].entries()) {
      expect((await commands.execute(envelope(levels, 0, `levels-invalid-${index}`))).status).toBe(
        'error'
      );
    }
    expect(tx.snapshot().docs.has('settings/lesson_levels')).toBe(false);
  });
  it('checks active references using one transactional document read', async () => {
    const { tx, commands } = setup();
    const levels = DEFAULT_LESSON_LEVELS.map((level) => ({
      ...level,
      isActive: level.id !== 'advanced',
    }));
    await commands.execute(envelope(levels, 0, 'levels-archive'));
    const reads: string[] = [];
    const session = {
      tx: {
        get: async ({ path }: { path: string }) => {
          reads.push(path);
          return { exists: true, data: tx.snapshot().docs.get(path)?.data };
        },
      },
      plan: { planRead: () => undefined },
    } as unknown as Parameters<typeof assertActiveLessonLevel>[0];
    const request = envelope(levels, 1, 'levels-reference');
    await expect(assertActiveLessonLevel(session, request, 'ADVANCED')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(assertActiveLessonLevel(session, request, 'XYZ')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(assertActiveLessonLevel(session, request, 'beginner')).resolves.toBeUndefined();
    expect(reads).toEqual(Array(3).fill('settings/lesson_levels'));
  });
});
