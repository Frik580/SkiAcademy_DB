import { z } from 'zod';
import type { AdminIssueDedupeIdentityInput } from './courseEnrollmentAttendanceAdminIssue';
import type { BookingId, CourseEnrollmentId } from './identifiers';
import { type MonetaryEvent, type Payment, type PaymentAccountingFields, type Wallet } from './paymentWallet';
import { type KztMinorUnits } from './primitives';
export declare const FINANCIAL_RECONCILIATION_SCOPES: readonly ["payment_projection", "payment_invariants", "wallet_balance", "incremental_requirements"];
export type FinancialReconciliationScope = (typeof FINANCIAL_RECONCILIATION_SCOPES)[number];
export declare const FinancialReconciliationScopeSchema: z.ZodEnum<{
    payment_projection: "payment_projection";
    payment_invariants: "payment_invariants";
    wallet_balance: "wallet_balance";
    incremental_requirements: "incremental_requirements";
}>;
export type FinancialReconciliationMismatchKind = 'payment_projection_mismatch' | 'payment_invariant_violation' | 'wallet_balance_mismatch' | 'incremental_requirement_mismatch' | 'impossible_refunded_exceeds_paid' | 'impossible_retained_mismatch' | 'payment_equation_mismatch';
export interface FinancialReconciliationMismatch {
    readonly scope: FinancialReconciliationScope;
    readonly kind: FinancialReconciliationMismatchKind;
    readonly field?: string;
}
export interface FinancialReconciliationResult {
    readonly mismatches: readonly FinancialReconciliationMismatch[];
    readonly hasMismatch: boolean;
}
export declare function foldPaymentAccountingFromEvents(originalPrice: KztMinorUnits, events: readonly MonetaryEvent[]): PaymentAccountingFields;
export declare function foldWalletBalanceFromEvents(events: readonly MonetaryEvent[]): KztMinorUnits;
export declare function reconcilePaymentState(input: {
    readonly payment: Payment;
    readonly paymentEvents: readonly MonetaryEvent[];
}): FinancialReconciliationResult;
export declare function reconcileWalletState(input: {
    readonly wallet: Wallet;
    readonly walletEvents: readonly MonetaryEvent[];
}): FinancialReconciliationResult;
export declare function primaryReconciliationScopeForMismatches(mismatches: readonly FinancialReconciliationMismatch[]): FinancialReconciliationScope;
export declare function financialReconciliationMismatchIdentity(input: {
    readonly subjectKind: 'booking' | 'course_enrollment';
    readonly subjectId: BookingId | CourseEnrollmentId;
    readonly reconciliationScope: FinancialReconciliationScope;
}): AdminIssueDedupeIdentityInput;
export declare function rebuildPaymentProjectionFromEvents(payment: Payment, events: readonly MonetaryEvent[]): PaymentAccountingFields & {
    readonly paymentStatus: Payment['paymentStatus'];
};
export declare function rebuildWalletProjectionFromEvents(events: readonly MonetaryEvent[]): {
    readonly balance: KztMinorUnits;
    readonly eventRevision: number;
};
