import { CanonicalCommandError } from '../errors';
import type { CorrelationId } from '../identifiers';
import { TRANSACTION_SAFETY_BUDGET } from './safetyBudget';
import {
  estimateTransactionPlan,
  type TransactionPlan,
  type TransactionPlanEstimate,
} from './transactionPlan';

export const TRANSACTION_BUDGET_VIOLATIONS = [
  'reads_exceeded',
  'mutations_exceeded',
  'estimated_bytes_exceeded',
] as const;

export type TransactionBudgetViolation = (typeof TRANSACTION_BUDGET_VIOLATIONS)[number];

export interface TransactionPreflightAccepted {
  readonly accepted: true;
  readonly estimate: TransactionPlanEstimate;
}

export interface TransactionPreflightRejected {
  readonly accepted: false;
  readonly violations: readonly TransactionBudgetViolation[];
  readonly estimate: TransactionPlanEstimate;
}

export type TransactionPreflightResult =
  TransactionPreflightAccepted | TransactionPreflightRejected;

export interface TransactionPreflightDiagnostics {
  readonly violations: readonly TransactionBudgetViolation[];
  readonly estimate: TransactionPlanEstimate;
  readonly limits: {
    readonly maxReads: number;
    readonly maxMutations: number;
    readonly maxEstimatedRequestBytes: number;
  };
}

export function evaluateTransactionPreflight(plan: TransactionPlan): TransactionPreflightResult {
  const estimate = estimateTransactionPlan(plan);
  const violations: TransactionBudgetViolation[] = [];

  if (estimate.readCount > TRANSACTION_SAFETY_BUDGET.maxReads) {
    violations.push('reads_exceeded');
  }
  if (estimate.mutationCount > TRANSACTION_SAFETY_BUDGET.maxMutations) {
    violations.push('mutations_exceeded');
  }
  if (estimate.totalEstimatedBytes > TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes) {
    violations.push('estimated_bytes_exceeded');
  }

  if (violations.length > 0) {
    return { accepted: false, violations, estimate };
  }

  return { accepted: true, estimate };
}

export function transactionPreflightDiagnostics(
  rejected: TransactionPreflightRejected
): TransactionPreflightDiagnostics {
  return {
    violations: rejected.violations,
    estimate: rejected.estimate,
    limits: {
      maxReads: TRANSACTION_SAFETY_BUDGET.maxReads,
      maxMutations: TRANSACTION_SAFETY_BUDGET.maxMutations,
      maxEstimatedRequestBytes: TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes,
    },
  };
}

export function operationTooLargeFromPreflight(correlationId: CorrelationId): CanonicalCommandError {
  return new CanonicalCommandError('operation_too_large', {
    correlationId,
    details: { reason: 'out_of_range' },
  });
}

export function assertTransactionWithinBudget(
  correlationId: CorrelationId,
  plan: TransactionPlan
): TransactionPlanEstimate {
  const preflight = evaluateTransactionPreflight(plan);
  if (!preflight.accepted) {
    throw operationTooLargeFromPreflight(correlationId);
  }
  return preflight.estimate;
}
