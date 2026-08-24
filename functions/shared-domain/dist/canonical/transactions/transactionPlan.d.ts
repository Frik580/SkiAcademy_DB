import type { TransactionPlanCategory } from './planCategories';
export declare const TRANSACTION_MUTATION_KINDS: readonly ["create", "update", "delete"];
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
export type TransactionPlanBreakdownByCategory = Record<TransactionPlanCategory, TransactionPlanCategoryBreakdown>;
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
export declare class TransactionPlanBuilder {
    private readonly reads;
    private readonly mutations;
    planRead(input: TransactionPlannedReadInput): this;
    planMutation(input: TransactionPlannedMutationInput): this;
    build(): TransactionPlan;
}
export declare function estimateTransactionPlan(plan: TransactionPlan): TransactionPlanEstimate;
export declare function planAuditOutboxContributions(builder: TransactionPlanBuilder, options: {
    activityLogPath: string;
    outboxObligationCount: number;
    outboxPathPrefix?: string;
}): void;
