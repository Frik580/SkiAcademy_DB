import { type TransactionPlan } from './transactionPlan';
/**
 * Representative ADR-0002 / ADR-0005 planning fixtures.
 * These model transaction growth shapes only — not business workflows.
 */
export declare const TRANSACTION_PLANNING_FIXTURES: {
    readonly individualBooking: () => TransactionPlan;
    readonly eightParticipantBooking: () => TransactionPlan;
    readonly eightParticipantsTenCourseDaysEnrollment: () => TransactionPlan;
    readonly courseTransfer: () => TransactionPlan;
    readonly maximumOutboxObligationBoundary: () => TransactionPlan;
};
export declare function syntheticBudgetBoundaryPlan(shape: 'reads' | 'mutations' | 'bytes', value: number): TransactionPlan;
