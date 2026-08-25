import {
  adminIssueKindPolicy,
  assertAdministratorMayMutateAdminIssue,
  resolveAdminIssue,
  type AdminIssueLifecycleActor,
  type ResolveOrDismissAdminIssueInput,
} from './adminIssuePolicy';
import type { AdminIssue } from './courseEnrollmentAttendanceAdminIssue';
import { CanonicalCommandError } from './errors';
import type { AdminIssueId, CorrelationId, MonetaryEventId, PaymentId } from './identifiers';
import {
  derivePaymentStatus,
  deriveRetainedAmount,
  MonetaryPaymentEffectSchema,
  validatePaymentAccounting,
  type MonetaryEvent,
  type Payment,
  type PaymentAccountingFields,
} from './paymentWallet';
import {
  applyRefundDelta,
  applyWriteOffAmount,
  creditWalletBalance,
  debitWalletBalance,
  paymentEffectFromProjectionChange,
  PaymentAccountingInvariantError,
  type PaymentAccountingProjection,
} from './paymentWalletOperations';
import { z } from 'zod';
import { KztMinorUnitsSchema, type KztMinorUnits } from './primitives';

export const FINANCIAL_CORRECTION_KINDS = [
  'admin_refund',
  'write_off',
  'reverse_write_off',
  'compensating_event',
] as const;

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

function projectFromFields(fields: PaymentAccountingFields): PaymentAccountingProjection {
  const retainedAmount = deriveRetainedAmount(fields.paidAmount, fields.refundedAmount);
  const accounting: PaymentAccountingFields = { ...fields, retainedAmount };
  const issues: z.ZodIssue[] = [];
  validatePaymentAccounting(accounting, {
    addIssue: (issue) => {
      issues.push(issue as z.ZodIssue);
    },
  } as z.RefinementCtx);
  if (issues.length > 0) {
    throw new PaymentAccountingInvariantError(issues[0]?.message ?? 'Invalid payment accounting');
  }
  return {
    ...accounting,
    paymentStatus: derivePaymentStatus(accounting),
  };
}

export function planAdminRefundCorrection(input: {
  readonly before: PaymentAccountingFields;
  readonly refundAmount: KztMinorUnits;
  readonly destination: 'wallet' | 'manual_external';
  readonly walletAccountId?: Payment['payerAccountId'];
  readonly manualExternalReference?: string;
}): FinancialCorrectionPlan {
  if (input.refundAmount <= 0) {
    throw new PaymentAccountingInvariantError('Refund correction amount must be positive');
  }
  const projection = applyRefundDelta(input.before, input.refundAmount);
  const event: PlannedFinancialCorrectionEvent = {
    eventKind: input.destination === 'wallet' ? 'refund_to_wallet' : 'manual_external_refund',
    paymentEffect: paymentEffectFromProjectionChange(input.before, projection),
    ...(input.destination === 'wallet'
      ? {
          walletBalanceDelta: input.refundAmount,
          refundDestinationKind: 'wallet' as const,
          refundAccountIdAtEvent: input.walletAccountId,
        }
      : {
          manualReference: input.manualExternalReference,
          refundDestinationKind: 'manual_external' as const,
        }),
  };

  return {
    paymentProjection: projection,
    monetaryEvents: [event],
    ...(input.destination === 'wallet'
      ? {
          walletBalanceDelta: input.refundAmount,
          walletAccountId: input.walletAccountId,
        }
      : {}),
  };
}

export function planWriteOffCorrection(input: {
  readonly before: PaymentAccountingFields;
  readonly amount: KztMinorUnits;
}): FinancialCorrectionPlan {
  const projection = applyWriteOffAmount(input.before, input.amount);
  return {
    paymentProjection: projection,
    monetaryEvents: [
      {
        eventKind: 'write_off',
        paymentEffect: paymentEffectFromProjectionChange(input.before, projection),
      },
    ],
  };
}

export function planReverseWriteOffCorrection(input: {
  readonly before: PaymentAccountingFields;
  readonly amount: KztMinorUnits;
}): FinancialCorrectionPlan {
  const afterFields: PaymentAccountingFields = {
    ...input.before,
    writtenOffAmount: KztMinorUnitsSchema.parse(input.before.writtenOffAmount - input.amount),
    outstandingAmount: KztMinorUnitsSchema.parse(input.before.outstandingAmount + input.amount),
    retainedAmount: deriveRetainedAmount(input.before.paidAmount, input.before.refundedAmount),
  };
  const projection = projectFromFields(afterFields);
  return {
    paymentProjection: projection,
    monetaryEvents: [
      {
        eventKind: 'correction',
        paymentEffect: paymentEffectFromProjectionChange(input.before, projection),
      },
    ],
  };
}

export function planCompensatingEventCorrection(input: {
  readonly before: PaymentAccountingFields;
  readonly paymentEffect: NonNullable<MonetaryEvent['paymentEffect']>;
  readonly correctsEventId: MonetaryEventId;
  readonly walletBalanceDelta?: number;
  readonly walletAccountId?: Payment['payerAccountId'];
}): FinancialCorrectionPlan {
  MonetaryPaymentEffectSchema.parse(input.paymentEffect);

  let next = { ...input.before };
  next = {
    originalPrice: next.originalPrice,
    price: KztMinorUnitsSchema.parse(next.price + (input.paymentEffect.priceDelta ?? 0)),
    paidAmount: KztMinorUnitsSchema.parse(next.paidAmount + (input.paymentEffect.paidAmountDelta ?? 0)),
    refundedAmount: KztMinorUnitsSchema.parse(
      next.refundedAmount + (input.paymentEffect.refundedAmountDelta ?? 0)
    ),
    retainedAmount: next.retainedAmount,
    settledAmount: KztMinorUnitsSchema.parse(
      next.settledAmount + (input.paymentEffect.settledAmountDelta ?? 0)
    ),
    writtenOffAmount: KztMinorUnitsSchema.parse(
      next.writtenOffAmount + (input.paymentEffect.writtenOffAmountDelta ?? 0)
    ),
    outstandingAmount: KztMinorUnitsSchema.parse(
      next.outstandingAmount + (input.paymentEffect.outstandingAmountDelta ?? 0)
    ),
  };
  next = {
    ...next,
    retainedAmount: deriveRetainedAmount(next.paidAmount, next.refundedAmount),
  };

  const projection = projectFromFields(next);
  const walletDelta =
    input.walletBalanceDelta === undefined
      ? undefined
      : KztMinorUnitsSchema.parse(input.walletBalanceDelta);

  return {
    paymentProjection: projection,
    monetaryEvents: [
      {
        eventKind: 'correction',
        paymentEffect: input.paymentEffect,
        correctsEventId: input.correctsEventId,
        ...(walletDelta === undefined
          ? {}
          : {
              walletBalanceDelta: walletDelta,
            }),
      },
    ],
    ...(walletDelta === undefined
      ? {}
      : {
          walletBalanceDelta: walletDelta,
          walletAccountId: input.walletAccountId,
        }),
  };
}

export function assertFinancialCorrectionHasEffect(plan: FinancialCorrectionPlan): void {
  const hasPaymentEffect = plan.monetaryEvents.some((event) => event.paymentEffect !== undefined);
  const hasWalletEffect = plan.walletBalanceDelta !== undefined && plan.walletBalanceDelta !== 0;
  if (!hasPaymentEffect && !hasWalletEffect) {
    throw new PaymentAccountingInvariantError('Financial correction produces no effect');
  }
}

export function assertWalletCorrectionDoesNotOverdraw(
  currentBalance: KztMinorUnits,
  walletBalanceDelta?: KztMinorUnits
): void {
  if (walletBalanceDelta === undefined || walletBalanceDelta >= 0) {
    return;
  }
  debitWalletBalance(currentBalance, KztMinorUnitsSchema.parse(-walletBalanceDelta));
}

export function applyWalletCorrectionDelta(
  currentBalance: KztMinorUnits,
  walletBalanceDelta: KztMinorUnits
): KztMinorUnits {
  if (walletBalanceDelta === 0) {
    return currentBalance;
  }
  if (walletBalanceDelta > 0) {
    return creditWalletBalance(currentBalance, walletBalanceDelta);
  }
  return debitWalletBalance(currentBalance, KztMinorUnitsSchema.parse(-walletBalanceDelta));
}

const FINANCIAL_ISSUE_KINDS_RESOLVABLE_BY_CORRECTION = new Set<AdminIssue['kind']>([
  'financial_reconciliation_mismatch',
  'attendance_payment_conflict',
]);

export function resolveFinancialAdminIssueForCorrection(
  existing: AdminIssue,
  input: ResolveOrDismissAdminIssueInput & {
    readonly paymentId: PaymentId;
    readonly adminIssueId: AdminIssueId;
  }
): AdminIssue {
  if (existing.issueId !== input.adminIssueId) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'adminIssueId', reason: 'conflict' },
    });
  }
  if (!FINANCIAL_ISSUE_KINDS_RESOLVABLE_BY_CORRECTION.has(existing.kind)) {
    throw new CanonicalCommandError('forbidden', { correlationId: input.correlationId });
  }
  assertAdministratorMayMutateAdminIssue(input.correlationId, input.actor);
  const policy = adminIssueKindPolicy(existing.kind);
  if (policy.requireCoupledDomainCommandToResolve && !input.coupledDomainCommand) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  return resolveAdminIssue(existing, input);
}

export function assertFinancialCorrectionIssueSubjectMatchesPayment(
  correlationId: CorrelationId,
  issue: AdminIssue,
  payment: Payment
): void {
  const subjectId =
    issue.subjectRef.subjectKind === 'booking'
      ? issue.subjectRef.bookingId
      : issue.subjectRef.enrollmentId;
  if (issue.subjectRef.subjectKind !== payment.subjectType || subjectId !== payment.subjectId) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { field: 'adminIssueId', reason: 'conflict' },
    });
  }
}

export function financialCorrectionActorFromContext(actor: AdminIssueLifecycleActor['actor']) {
  if (actor.kind === 'account') {
    return { kind: 'account' as const, accountId: actor.accountId };
  }
  if (actor.kind === 'system') {
    return { kind: 'system' as const, systemActorId: actor.systemActorId };
  }
  if (actor.kind === 'provider') {
    return { kind: 'provider' as const, providerId: actor.providerId };
  }
  return { kind: 'guest' as const, guestSubjectId: actor.guestSubjectId };
}
