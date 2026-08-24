import { AUDIT_CARDINALITY_LIMITS } from '../auditOutbox';
import type { TransactionPlanCategory } from './planCategories';

export const TRANSACTION_MUTATION_KINDS = ['create', 'update', 'delete'] as const;

export type TransactionMutationKind = (typeof TRANSACTION_MUTATION_KINDS)[number];

export interface TransactionPlannedRead {
  readonly path: string;
  readonly category: TransactionPlanCategory;
}

export interface TransactionPlannedMutation {
  readonly path: string;
  readonly kind: TransactionMutationKind;
  readonly category: TransactionPlanCategory;
  /**
   * Conservative serialized document payload estimate in bytes.
   * This is an application safety estimate, not exact Firestore storage.
   */
  readonly estimatedPayloadBytes: number;
  /**
   * Optional conservative index-entry impact estimate in bytes.
   */
  readonly estimatedIndexImpactBytes?: number;
}

export interface TransactionPlan {
  readonly reads: readonly TransactionPlannedRead[];
  readonly mutations: readonly TransactionPlannedMutation[];
}

export interface TransactionPlanCategoryBreakdown {
  readonly reads: number;
  readonly mutations: number;
  readonly estimatedPayloadBytes: number;
  readonly estimatedIndexImpactBytes: number;
}

export type TransactionPlanBreakdownByCategory = Record<
  TransactionPlanCategory,
  TransactionPlanCategoryBreakdown
>;

export interface TransactionPlanEstimate {
  readonly readCount: number;
  readonly mutationCount: number;
  readonly estimatedPayloadBytes: number;
  readonly estimatedIndexImpactBytes: number;
  readonly totalEstimatedBytes: number;
  readonly byCategory: TransactionPlanBreakdownByCategory;
}

export interface TransactionPlannedReadInput {
  readonly path: string;
  readonly category: TransactionPlanCategory;
}

export interface TransactionPlannedMutationInput {
  readonly path: string;
  readonly kind: TransactionMutationKind;
  readonly category: TransactionPlanCategory;
  readonly estimatedPayloadBytes: number;
  readonly estimatedIndexImpactBytes?: number;
}

type MutableTransactionPlanCategoryBreakdown = {
  reads: number;
  mutations: number;
  estimatedPayloadBytes: number;
  estimatedIndexImpactBytes: number;
};

type MutableTransactionPlanBreakdownByCategory = Record<
  TransactionPlanCategory,
  MutableTransactionPlanCategoryBreakdown
>;

function emptyBreakdown(): MutableTransactionPlanBreakdownByCategory {
  return {
    aggregate: { reads: 0, mutations: 0, estimatedPayloadBytes: 0, estimatedIndexImpactBytes: 0 },
    resource_claim: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    resource_guard: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    payment_wallet: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    idempotency: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    activity_log: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    outbox_obligation: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    capacity_projection: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    authorization_check: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    enrollment_guard: {
      reads: 0,
      mutations: 0,
      estimatedPayloadBytes: 0,
      estimatedIndexImpactBytes: 0,
    },
    other: { reads: 0, mutations: 0, estimatedPayloadBytes: 0, estimatedIndexImpactBytes: 0 },
  };
}

export class TransactionPlanBuilder {
  private readonly reads: TransactionPlannedRead[] = [];
  private readonly mutations: TransactionPlannedMutation[] = [];

  planRead(input: TransactionPlannedReadInput): this {
    this.reads.push({
      path: input.path,
      category: input.category,
    });
    return this;
  }

  planMutation(input: TransactionPlannedMutationInput): this {
    this.mutations.push({
      path: input.path,
      kind: input.kind,
      category: input.category,
      estimatedPayloadBytes: input.estimatedPayloadBytes,
      ...(input.estimatedIndexImpactBytes === undefined
        ? {}
        : { estimatedIndexImpactBytes: input.estimatedIndexImpactBytes }),
    });
    return this;
  }

  build(): TransactionPlan {
    return {
      reads: [...this.reads],
      mutations: [...this.mutations],
    };
  }
}

export function estimateTransactionPlan(plan: TransactionPlan): TransactionPlanEstimate {
  const byCategory = emptyBreakdown();

  for (const read of plan.reads) {
    byCategory[read.category].reads += 1;
  }

  let estimatedPayloadBytes = 0;
  let estimatedIndexImpactBytes = 0;

  for (const mutation of plan.mutations) {
    const category = byCategory[mutation.category];
    category.mutations += 1;
    category.estimatedPayloadBytes += mutation.estimatedPayloadBytes;
    const indexImpact = mutation.estimatedIndexImpactBytes ?? 0;
    category.estimatedIndexImpactBytes += indexImpact;
    estimatedPayloadBytes += mutation.estimatedPayloadBytes;
    estimatedIndexImpactBytes += indexImpact;
  }

  return {
    readCount: plan.reads.length,
    mutationCount: plan.mutations.length,
    estimatedPayloadBytes,
    estimatedIndexImpactBytes,
    totalEstimatedBytes: estimatedPayloadBytes + estimatedIndexImpactBytes,
    byCategory: byCategory as TransactionPlanBreakdownByCategory,
  };
}

export function planAuditOutboxContributions(
  builder: TransactionPlanBuilder,
  options: {
    activityLogPath: string;
    outboxObligationCount: number;
    outboxPathPrefix?: string;
  }
): void {
  builder.planMutation({
    path: options.activityLogPath,
    kind: 'create',
    category: 'activity_log',
    estimatedPayloadBytes: AUDIT_CARDINALITY_LIMITS.activityLogTargetBytes,
  });

  const prefix = options.outboxPathPrefix ?? 'domain_outbox';
  for (let index = 0; index < options.outboxObligationCount; index += 1) {
    builder.planMutation({
      path: `${prefix}/obligation_${index}`,
      kind: 'create',
      category: 'outbox_obligation',
      estimatedPayloadBytes: AUDIT_CARDINALITY_LIMITS.outboxObligationTargetBytes,
    });
  }
}
