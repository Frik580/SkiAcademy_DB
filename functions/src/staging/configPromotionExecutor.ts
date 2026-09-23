import type { PromotionOperation } from './configPromotionContract';
import type { PromotionPlan } from './configPromotionPlan';

export type PromotionExecutionMode = 'dry-run' | 'apply';

export async function executePromotionPlan(
  plan: PromotionPlan,
  mode: PromotionExecutionMode,
  mutate: (operation: PromotionOperation) => Promise<void>
): Promise<number> {
  if (mode === 'dry-run') return 0;
  if (plan.hasConflicts || plan.operations.some((operation) => operation.status === 'CONFLICT')) {
    throw new Error('PROMOTION: apply stopped because the plan contains CONFLICT operations');
  }
  let applied = 0;
  for (const operation of plan.operations) {
    if (operation.status !== 'CREATE' && operation.status !== 'UPDATE') continue;
    await mutate(operation);
    applied += 1;
  }
  return applied;
}
