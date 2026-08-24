import { CanonicalCommandError } from '../errors';
import type { CorrelationId } from '../identifiers';
import { type TransactionPlan, type TransactionPlanEstimate } from './transactionPlan';
export declare const TRANSACTION_BUDGET_VIOLATIONS: readonly ["reads_exceeded", "mutations_exceeded", "estimated_bytes_exceeded"];
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
export type TransactionPreflightResult = TransactionPreflightAccepted | TransactionPreflightRejected;
export interface TransactionPreflightDiagnostics {
    readonly violations: readonly TransactionBudgetViolation[];
    readonly estimate: TransactionPlanEstimate;
    readonly limits: {
        readonly maxReads: number;
        readonly maxMutations: number;
        readonly maxEstimatedRequestBytes: number;
    };
}
export declare function evaluateTransactionPreflight(plan: TransactionPlan): TransactionPreflightResult;
export declare function transactionPreflightDiagnostics(rejected: TransactionPreflightRejected): TransactionPreflightDiagnostics;
export declare function operationTooLargeFromPreflight(correlationId: CorrelationId): CanonicalCommandError;
export declare function assertTransactionWithinBudget(correlationId: CorrelationId, plan: TransactionPlan): TransactionPlanEstimate;
