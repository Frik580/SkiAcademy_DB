import { type AdminIssueLifecycleActor, type ResolveOrDismissAdminIssueInput } from './adminIssuePolicy';
import type { AdminIssue } from './courseEnrollmentAttendanceAdminIssue';
import type { AdminIssueId, CorrelationId, MonetaryEventId, PaymentId } from './identifiers';
import { type MonetaryEvent, type Payment, type PaymentAccountingFields } from './paymentWallet';
import { type PaymentAccountingProjection } from './paymentWalletOperations';
import { type KztMinorUnits } from './primitives';
export declare const FINANCIAL_CORRECTION_KINDS: readonly ["admin_refund", "write_off", "reverse_write_off", "compensating_event"];
export type FinancialCorrectionKind = (typeof FINANCIAL_CORRECTION_KINDS)[number];
export interface FinancialCorrectionPlan {
    readonly paymentProjection: PaymentAccountingProjection;
    readonly monetaryEvents: readonly PlannedFinancialCorrectionEvent[];
    readonly walletBalanceDelta?: KztMinorUnits;
    readonly walletAccountId?: Payment['payerAccountId'];
}
export interface PlannedFinancialCorrectionEvent {
    readonly eventKind: MonetaryEvent['eventKind'];
    readonly paymentEffect?: NonNullable<MonetaryEvent['paymentEffect']>;
    readonly walletBalanceDelta?: number;
    readonly correctsEventId?: MonetaryEventId;
    readonly refundDestinationKind?: 'wallet' | 'manual_external';
    readonly refundAccountIdAtEvent?: Payment['payerAccountId'];
    readonly manualReference?: string;
}
export declare function planAdminRefundCorrection(input: {
    readonly before: PaymentAccountingFields;
    readonly refundAmount: KztMinorUnits;
    readonly destination: 'wallet' | 'manual_external';
    readonly walletAccountId?: Payment['payerAccountId'];
    readonly manualExternalReference?: string;
}): FinancialCorrectionPlan;
export declare function planWriteOffCorrection(input: {
    readonly before: PaymentAccountingFields;
    readonly amount: KztMinorUnits;
}): FinancialCorrectionPlan;
export declare function planReverseWriteOffCorrection(input: {
    readonly before: PaymentAccountingFields;
    readonly amount: KztMinorUnits;
}): FinancialCorrectionPlan;
export declare function planCompensatingEventCorrection(input: {
    readonly before: PaymentAccountingFields;
    readonly paymentEffect: NonNullable<MonetaryEvent['paymentEffect']>;
    readonly correctsEventId: MonetaryEventId;
    readonly walletBalanceDelta?: number;
    readonly walletAccountId?: Payment['payerAccountId'];
}): FinancialCorrectionPlan;
export declare function assertFinancialCorrectionHasEffect(plan: FinancialCorrectionPlan): void;
export declare function assertWalletCorrectionDoesNotOverdraw(currentBalance: KztMinorUnits, walletBalanceDelta?: KztMinorUnits): void;
export declare function applyWalletCorrectionDelta(currentBalance: KztMinorUnits, walletBalanceDelta: KztMinorUnits): KztMinorUnits;
export declare function resolveFinancialAdminIssueForCorrection(existing: AdminIssue, input: ResolveOrDismissAdminIssueInput & {
    readonly paymentId: PaymentId;
    readonly adminIssueId: AdminIssueId;
}): AdminIssue;
export declare function assertFinancialCorrectionIssueSubjectMatchesPayment(correlationId: CorrelationId, issue: AdminIssue, payment: Payment): void;
export declare function financialCorrectionActorFromContext(actor: AdminIssueLifecycleActor['actor']): {
    kind: "account";
    accountId: import("./identifiers").CanonicalId<"account">;
    systemActorId?: undefined;
    providerId?: undefined;
    guestSubjectId?: undefined;
} | {
    kind: "system";
    systemActorId: import("./identifiers").CanonicalId<"system_actor">;
    accountId?: undefined;
    providerId?: undefined;
    guestSubjectId?: undefined;
} | {
    kind: "provider";
    providerId: import("./identifiers").CanonicalId<"provider">;
    accountId?: undefined;
    systemActorId?: undefined;
    guestSubjectId?: undefined;
} | {
    kind: "guest";
    guestSubjectId: import("./identifiers").CanonicalId<"guest_subject">;
    accountId?: undefined;
    systemActorId?: undefined;
    providerId?: undefined;
};
