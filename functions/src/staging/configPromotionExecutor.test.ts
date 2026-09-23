import { describe, expect, it } from 'vitest';
import { buildOperation } from './configPromotionContract';
import { executePromotionPlan } from './configPromotionExecutor';
import type { PromotionPlan } from './configPromotionPlan';

function plan(status: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'CONFLICT' | 'SKIP'): PromotionPlan {
  const operation = buildOperation({
    kind: 'instructor_filters',
    logicalKey: 'instructor_filters',
    targetPath: 'settings/instructor_filters',
    status,
    changedFields: status === 'UPDATE' ? ['enabled'] : [],
    sourceHash: 'a'.repeat(64),
    dependencyOrder: 1,
  });
  return { operations: [operation], manifestHash: 'b'.repeat(64), hasConflicts: status === 'CONFLICT' };
}

describe('configuration promotion executor', () => {
  it('dry-run returns without invoking the mutation callback', async () => {
    let writes = 0;
    await expect(executePromotionPlan(plan('CREATE'), 'dry-run', async () => { writes += 1; })).resolves.toBe(0);
    expect(writes).toBe(0);
  });

  it('apply executes only CREATE and UPDATE operations', async () => {
    let writes = 0;
    await executePromotionPlan(plan('UPDATE'), 'apply', async () => { writes += 1; });
    await executePromotionPlan(plan('UNCHANGED'), 'apply', async () => { writes += 1; });
    await executePromotionPlan(plan('SKIP'), 'apply', async () => { writes += 1; });
    expect(writes).toBe(1);
  });

  it('blocks the whole apply plan before any mutation when a conflict exists', async () => {
    let writes = 0;
    const conflicted: PromotionPlan = {
      ...plan('CONFLICT'),
      operations: [plan('CREATE').operations[0]!, plan('CONFLICT').operations[0]!],
      hasConflicts: true,
    };
    await expect(executePromotionPlan(conflicted, 'apply', async () => { writes += 1; })).rejects.toThrow(/CONFLICT/);
    expect(writes).toBe(0);
  });

  it('derives the conflict gate from operations even if the summary flag is malformed', async () => {
    let writes = 0;
    const malformed: PromotionPlan = {
      ...plan('CONFLICT'),
      hasConflicts: false,
    };
    await expect(executePromotionPlan(malformed, 'apply', async () => { writes += 1; })).rejects.toThrow(/CONFLICT/);
    expect(writes).toBe(0);
  });
});
