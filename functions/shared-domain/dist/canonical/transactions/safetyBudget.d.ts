/**
 * Application-level transaction safety budgets from ADR-0002.
 *
 * These are conservative internal limits with operational headroom — they are
 * NOT Firestore platform quotas or permanent domain cardinality rules.
 */
export declare const TRANSACTION_SAFETY_BUDGET_VERSION: "transaction-safety:v1";
export type TransactionSafetyBudgetVersion = typeof TRANSACTION_SAFETY_BUDGET_VERSION;
export declare const TRANSACTION_SAFETY_BUDGET: {
    readonly version: "transaction-safety:v1";
    readonly maxReads: 400;
    readonly maxMutations: 400;
    /**
     * Conservative application estimate for combined document payload and
     * affected-index impact (~6 MiB). This is not an exact Firestore billing
     * calculation.
     */
    readonly maxEstimatedRequestBytes: number;
};
export type TransactionSafetyBudget = typeof TRANSACTION_SAFETY_BUDGET;
