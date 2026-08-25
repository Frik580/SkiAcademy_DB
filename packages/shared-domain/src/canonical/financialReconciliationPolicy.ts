import { z } from 'zod';
import { ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION } from './courseEnrollmentAttendanceAdminIssue';
import type { AdminIssueDedupeIdentityInput } from './courseEnrollmentAttendanceAdminIssue';
import type { BookingId, CourseEnrollmentId } from './identifiers';
import {
  derivePaymentStatus,
  deriveRetainedAmount,
  validatePaymentAccounting,
  type MonetaryEvent,
  type Payment,
  type PaymentAccountingFields,
  type Wallet,
} from './paymentWallet';
import { KztMinorUnitsSchema, type KztMinorUnits } from './primitives';

export const FINANCIAL_RECONCILIATION_SCOPES = [
  'payment_projection',
  'payment_invariants',
  'wallet_balance',
  'incremental_requirements',
] as const;

export type FinancialReconciliationScope = (typeof FINANCIAL_RECONCILIATION_SCOPES)[number];

export const FinancialReconciliationScopeSchema = z.enum(FINANCIAL_RECONCILIATION_SCOPES);

export type FinancialReconciliationMismatchKind =
  | 'payment_projection_mismatch'
  | 'payment_invariant_violation'
  | 'wallet_balance_mismatch'
  | 'incremental_requirement_mismatch'
  | 'impossible_refunded_exceeds_paid'
  | 'impossible_retained_mismatch'
  | 'payment_equation_mismatch';

export interface FinancialReconciliationMismatch {
  readonly scope: FinancialReconciliationScope;
  readonly kind: FinancialReconciliationMismatchKind;
  readonly field?: string;
}

export interface FinancialReconciliationResult {
  readonly mismatches: readonly FinancialReconciliationMismatch[];
  readonly hasMismatch: boolean;
}

function applyPaymentEffectDeltas(
  current: PaymentAccountingFields,
  effect: NonNullable<MonetaryEvent['paymentEffect']>
): PaymentAccountingFields {
  return {
    originalPrice: current.originalPrice,
    price: KztMinorUnitsSchema.parse(current.price + (effect.priceDelta ?? 0)),
    paidAmount: KztMinorUnitsSchema.parse(current.paidAmount + (effect.paidAmountDelta ?? 0)),
    refundedAmount: KztMinorUnitsSchema.parse(
      current.refundedAmount + (effect.refundedAmountDelta ?? 0)
    ),
    retainedAmount: current.retainedAmount,
    settledAmount: KztMinorUnitsSchema.parse(
      current.settledAmount + (effect.settledAmountDelta ?? 0)
    ),
    writtenOffAmount: KztMinorUnitsSchema.parse(
      current.writtenOffAmount + (effect.writtenOffAmountDelta ?? 0)
    ),
    outstandingAmount: KztMinorUnitsSchema.parse(
      current.outstandingAmount + (effect.outstandingAmountDelta ?? 0)
    ),
  };
}

function comparePaymentEventRevision(
  left: MonetaryEvent,
  right: MonetaryEvent
): number {
  const leftRevision = left.paymentEventRevision ?? 0;
  const rightRevision = right.paymentEventRevision ?? 0;
  if (leftRevision !== rightRevision) {
    return leftRevision - rightRevision;
  }
  return left.eventId.localeCompare(right.eventId);
}

function compareWalletEventRevision(left: MonetaryEvent, right: MonetaryEvent): number {
  const leftRevision = left.walletEventRevision ?? 0;
  const rightRevision = right.walletEventRevision ?? 0;
  if (leftRevision !== rightRevision) {
    return leftRevision - rightRevision;
  }
  return left.eventId.localeCompare(right.eventId);
}

export function foldPaymentAccountingFromEvents(
  originalPrice: KztMinorUnits,
  events: readonly MonetaryEvent[]
): PaymentAccountingFields {
  const paymentEvents = events
    .filter((event) => event.paymentEffect !== undefined)
    .sort(comparePaymentEventRevision);

  let fields: PaymentAccountingFields = {
    originalPrice,
    price: originalPrice,
    paidAmount: KztMinorUnitsSchema.parse(0),
    refundedAmount: KztMinorUnitsSchema.parse(0),
    retainedAmount: KztMinorUnitsSchema.parse(0),
    settledAmount: KztMinorUnitsSchema.parse(0),
    writtenOffAmount: KztMinorUnitsSchema.parse(0),
    outstandingAmount: originalPrice,
  };

  for (const event of paymentEvents) {
    if (!event.paymentEffect) continue;
    fields = applyPaymentEffectDeltas(fields, event.paymentEffect);
    fields = {
      ...fields,
      retainedAmount: deriveRetainedAmount(fields.paidAmount, fields.refundedAmount),
    };
  }

  return fields;
}

export function foldWalletBalanceFromEvents(events: readonly MonetaryEvent[]): KztMinorUnits {
  const walletEvents = events
    .filter((event) => event.walletBalanceDelta !== undefined)
    .sort(compareWalletEventRevision);

  let balance = KztMinorUnitsSchema.parse(0);
  for (const event of walletEvents) {
    if (event.walletBalanceDelta === undefined) continue;
    balance = KztMinorUnitsSchema.parse(balance + event.walletBalanceDelta);
  }
  return balance;
}

function collectPaymentInvariantMismatches(
  payment: PaymentAccountingFields
): FinancialReconciliationMismatch[] {
  const mismatches: FinancialReconciliationMismatch[] = [];
  const issues: z.ZodIssue[] = [];
  validatePaymentAccounting(payment, {
    addIssue: (issue) => {
      issues.push(issue as z.ZodIssue);
    },
  } as z.RefinementCtx);

  if (payment.refundedAmount > payment.paidAmount) {
    mismatches.push({
      scope: 'payment_invariants',
      kind: 'impossible_refunded_exceeds_paid',
      field: 'refundedAmount',
    });
  }

  if (payment.retainedAmount !== payment.paidAmount - payment.refundedAmount) {
    mismatches.push({
      scope: 'payment_invariants',
      kind: 'impossible_retained_mismatch',
      field: 'retainedAmount',
    });
  }

  if (payment.price !== payment.settledAmount + payment.writtenOffAmount + payment.outstandingAmount) {
    mismatches.push({
      scope: 'payment_invariants',
      kind: 'payment_equation_mismatch',
      field: 'price',
    });
  }

  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'payment');
    if (
      mismatches.some(
        (mismatch) => mismatch.field === field && mismatch.scope === 'payment_invariants'
      )
    ) {
      continue;
    }
    mismatches.push({
      scope: 'payment_invariants',
      kind: 'payment_invariant_violation',
      field,
    });
  }

  return mismatches;
}

function collectIncrementalRequirementMismatches(
  payment: Payment
): FinancialReconciliationMismatch[] {
  const mismatches: FinancialReconciliationMismatch[] = [];
  let allocatedSettledTotal = 0;
  let allocatedRetainedTotal = 0;

  payment.incrementalRequirements.forEach((requirement) => {
    allocatedSettledTotal += requirement.allocatedSettledAmount;
    allocatedRetainedTotal += requirement.allocatedRetainedAmount;
    if (requirement.allocatedRetainedAmount > requirement.allocatedSettledAmount) {
      mismatches.push({
        scope: 'incremental_requirements',
        kind: 'incremental_requirement_mismatch',
        field: 'allocatedRetainedAmount',
      });
    }
    if (requirement.allocatedSettledAmount > requirement.requiredPriceDelta) {
      mismatches.push({
        scope: 'incremental_requirements',
        kind: 'incremental_requirement_mismatch',
        field: 'allocatedSettledAmount',
      });
    }
  });

  if (allocatedSettledTotal > payment.settledAmount) {
    mismatches.push({
      scope: 'incremental_requirements',
      kind: 'incremental_requirement_mismatch',
      field: 'allocatedSettledTotal',
    });
  }
  if (allocatedRetainedTotal > payment.retainedAmount) {
    mismatches.push({
      scope: 'incremental_requirements',
      kind: 'incremental_requirement_mismatch',
      field: 'allocatedRetainedTotal',
    });
  }

  return mismatches;
}

function paymentProjectionFieldsMatch(
  stored: PaymentAccountingFields,
  folded: PaymentAccountingFields
): boolean {
  return (
    stored.price === folded.price &&
    stored.paidAmount === folded.paidAmount &&
    stored.refundedAmount === folded.refundedAmount &&
    stored.settledAmount === folded.settledAmount &&
    stored.writtenOffAmount === folded.writtenOffAmount &&
    stored.outstandingAmount === folded.outstandingAmount
  );
}

export function reconcilePaymentState(input: {
  readonly payment: Payment;
  readonly paymentEvents: readonly MonetaryEvent[];
}): FinancialReconciliationResult {
  const mismatches: FinancialReconciliationMismatch[] = [
    ...collectPaymentInvariantMismatches(input.payment),
    ...collectIncrementalRequirementMismatches(input.payment),
  ];

  const folded = foldPaymentAccountingFromEvents(input.payment.originalPrice, input.paymentEvents);
  if (!paymentProjectionFieldsMatch(input.payment, folded)) {
    mismatches.push({
      scope: 'payment_projection',
      kind: 'payment_projection_mismatch',
    });
  }

  const derivedStatus = derivePaymentStatus(input.payment);
  if (input.payment.paymentStatus !== derivedStatus) {
    mismatches.push({
      scope: 'payment_projection',
      kind: 'payment_projection_mismatch',
      field: 'paymentStatus',
    });
  }

  const maxPaymentEventRevision = input.paymentEvents.reduce(
    (max, event) => Math.max(max, event.paymentEventRevision ?? 0),
    0
  );
  if (input.payment.eventRevision !== maxPaymentEventRevision && input.paymentEvents.length > 0) {
    mismatches.push({
      scope: 'payment_projection',
      kind: 'payment_projection_mismatch',
      field: 'eventRevision',
    });
  }

  return {
    mismatches,
    hasMismatch: mismatches.length > 0,
  };
}

export function reconcileWalletState(input: {
  readonly wallet: Wallet;
  readonly walletEvents: readonly MonetaryEvent[];
}): FinancialReconciliationResult {
  const mismatches: FinancialReconciliationMismatch[] = [];
  const foldedBalance = foldWalletBalanceFromEvents(input.walletEvents);

  if (input.wallet.balance !== foldedBalance) {
    mismatches.push({
      scope: 'wallet_balance',
      kind: 'wallet_balance_mismatch',
      field: 'balance',
    });
  }

  if (input.wallet.balance < 0) {
    mismatches.push({
      scope: 'wallet_balance',
      kind: 'wallet_balance_mismatch',
      field: 'balance',
    });
  }

  const maxRevision = input.walletEvents.reduce(
    (max, event) => Math.max(max, event.walletEventRevision ?? 0),
    0
  );
  if (input.wallet.eventRevision !== maxRevision && input.walletEvents.length > 0) {
    mismatches.push({
      scope: 'wallet_balance',
      kind: 'wallet_balance_mismatch',
      field: 'eventRevision',
    });
  }

  return {
    mismatches,
    hasMismatch: mismatches.length > 0,
  };
}

export function primaryReconciliationScopeForMismatches(
  mismatches: readonly FinancialReconciliationMismatch[]
): FinancialReconciliationScope {
  const scopes = new Set(mismatches.map((mismatch) => mismatch.scope));
  if (scopes.has('payment_invariants')) return 'payment_invariants';
  if (scopes.has('payment_projection')) return 'payment_projection';
  if (scopes.has('incremental_requirements')) return 'incremental_requirements';
  return 'wallet_balance';
}

export function financialReconciliationMismatchIdentity(input: {
  readonly subjectKind: 'booking' | 'course_enrollment';
  readonly subjectId: BookingId | CourseEnrollmentId;
  readonly reconciliationScope: FinancialReconciliationScope;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'financial_reconciliation_mismatch',
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    reconciliationScope: input.reconciliationScope,
  };
}

export function rebuildPaymentProjectionFromEvents(
  payment: Payment,
  events: readonly MonetaryEvent[]
): PaymentAccountingFields & { readonly paymentStatus: Payment['paymentStatus'] } {
  const folded = foldPaymentAccountingFromEvents(payment.originalPrice, events);
  return {
    ...folded,
    paymentStatus: derivePaymentStatus(folded),
  };
}

export function rebuildWalletProjectionFromEvents(
  events: readonly MonetaryEvent[]
): { readonly balance: KztMinorUnits; readonly eventRevision: number } {
  const balance = foldWalletBalanceFromEvents(events);
  const eventRevision = events.reduce(
    (max, event) => Math.max(max, event.walletEventRevision ?? 0),
    0
  );
  return { balance, eventRevision };
}
