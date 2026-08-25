"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_CORRECTION_KINDS = void 0;
exports.planAdminRefundCorrection = planAdminRefundCorrection;
exports.planWriteOffCorrection = planWriteOffCorrection;
exports.planReverseWriteOffCorrection = planReverseWriteOffCorrection;
exports.planCompensatingEventCorrection = planCompensatingEventCorrection;
exports.assertFinancialCorrectionHasEffect = assertFinancialCorrectionHasEffect;
exports.assertWalletCorrectionDoesNotOverdraw = assertWalletCorrectionDoesNotOverdraw;
exports.applyWalletCorrectionDelta = applyWalletCorrectionDelta;
exports.resolveFinancialAdminIssueForCorrection = resolveFinancialAdminIssueForCorrection;
exports.assertFinancialCorrectionIssueSubjectMatchesPayment = assertFinancialCorrectionIssueSubjectMatchesPayment;
exports.financialCorrectionActorFromContext = financialCorrectionActorFromContext;
const adminIssuePolicy_1 = require("./adminIssuePolicy");
const errors_1 = require("./errors");
const paymentWallet_1 = require("./paymentWallet");
const paymentWalletOperations_1 = require("./paymentWalletOperations");
const primitives_1 = require("./primitives");
exports.FINANCIAL_CORRECTION_KINDS = [
    'admin_refund',
    'write_off',
    'reverse_write_off',
    'compensating_event',
];
function projectFromFields(fields) {
    const retainedAmount = (0, paymentWallet_1.deriveRetainedAmount)(fields.paidAmount, fields.refundedAmount);
    const accounting = { ...fields, retainedAmount };
    const issues = [];
    (0, paymentWallet_1.validatePaymentAccounting)(accounting, {
        addIssue: (issue) => {
            issues.push(issue);
        },
    });
    if (issues.length > 0) {
        throw new paymentWalletOperations_1.PaymentAccountingInvariantError(issues[0]?.message ?? 'Invalid payment accounting');
    }
    return {
        ...accounting,
        paymentStatus: (0, paymentWallet_1.derivePaymentStatus)(accounting),
    };
}
function planAdminRefundCorrection(input) {
    if (input.refundAmount <= 0) {
        throw new paymentWalletOperations_1.PaymentAccountingInvariantError('Refund correction amount must be positive');
    }
    const projection = (0, paymentWalletOperations_1.applyRefundDelta)(input.before, input.refundAmount);
    const event = {
        eventKind: input.destination === 'wallet' ? 'refund_to_wallet' : 'manual_external_refund',
        paymentEffect: (0, paymentWalletOperations_1.paymentEffectFromProjectionChange)(input.before, projection),
        ...(input.destination === 'wallet'
            ? {
                walletBalanceDelta: input.refundAmount,
                refundDestinationKind: 'wallet',
                refundAccountIdAtEvent: input.walletAccountId,
            }
            : {
                manualReference: input.manualExternalReference,
                refundDestinationKind: 'manual_external',
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
function planWriteOffCorrection(input) {
    const projection = (0, paymentWalletOperations_1.applyWriteOffAmount)(input.before, input.amount);
    return {
        paymentProjection: projection,
        monetaryEvents: [
            {
                eventKind: 'write_off',
                paymentEffect: (0, paymentWalletOperations_1.paymentEffectFromProjectionChange)(input.before, projection),
            },
        ],
    };
}
function planReverseWriteOffCorrection(input) {
    const afterFields = {
        ...input.before,
        writtenOffAmount: primitives_1.KztMinorUnitsSchema.parse(input.before.writtenOffAmount - input.amount),
        outstandingAmount: primitives_1.KztMinorUnitsSchema.parse(input.before.outstandingAmount + input.amount),
        retainedAmount: (0, paymentWallet_1.deriveRetainedAmount)(input.before.paidAmount, input.before.refundedAmount),
    };
    const projection = projectFromFields(afterFields);
    return {
        paymentProjection: projection,
        monetaryEvents: [
            {
                eventKind: 'correction',
                paymentEffect: (0, paymentWalletOperations_1.paymentEffectFromProjectionChange)(input.before, projection),
            },
        ],
    };
}
function planCompensatingEventCorrection(input) {
    paymentWallet_1.MonetaryPaymentEffectSchema.parse(input.paymentEffect);
    let next = { ...input.before };
    next = {
        originalPrice: next.originalPrice,
        price: primitives_1.KztMinorUnitsSchema.parse(next.price + (input.paymentEffect.priceDelta ?? 0)),
        paidAmount: primitives_1.KztMinorUnitsSchema.parse(next.paidAmount + (input.paymentEffect.paidAmountDelta ?? 0)),
        refundedAmount: primitives_1.KztMinorUnitsSchema.parse(next.refundedAmount + (input.paymentEffect.refundedAmountDelta ?? 0)),
        retainedAmount: next.retainedAmount,
        settledAmount: primitives_1.KztMinorUnitsSchema.parse(next.settledAmount + (input.paymentEffect.settledAmountDelta ?? 0)),
        writtenOffAmount: primitives_1.KztMinorUnitsSchema.parse(next.writtenOffAmount + (input.paymentEffect.writtenOffAmountDelta ?? 0)),
        outstandingAmount: primitives_1.KztMinorUnitsSchema.parse(next.outstandingAmount + (input.paymentEffect.outstandingAmountDelta ?? 0)),
    };
    next = {
        ...next,
        retainedAmount: (0, paymentWallet_1.deriveRetainedAmount)(next.paidAmount, next.refundedAmount),
    };
    const projection = projectFromFields(next);
    const walletDelta = input.walletBalanceDelta === undefined
        ? undefined
        : primitives_1.KztMinorUnitsSchema.parse(input.walletBalanceDelta);
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
function assertFinancialCorrectionHasEffect(plan) {
    const hasPaymentEffect = plan.monetaryEvents.some((event) => event.paymentEffect !== undefined);
    const hasWalletEffect = plan.walletBalanceDelta !== undefined && plan.walletBalanceDelta !== 0;
    if (!hasPaymentEffect && !hasWalletEffect) {
        throw new paymentWalletOperations_1.PaymentAccountingInvariantError('Financial correction produces no effect');
    }
}
function assertWalletCorrectionDoesNotOverdraw(currentBalance, walletBalanceDelta) {
    if (walletBalanceDelta === undefined || walletBalanceDelta >= 0) {
        return;
    }
    (0, paymentWalletOperations_1.debitWalletBalance)(currentBalance, primitives_1.KztMinorUnitsSchema.parse(-walletBalanceDelta));
}
function applyWalletCorrectionDelta(currentBalance, walletBalanceDelta) {
    if (walletBalanceDelta === 0) {
        return currentBalance;
    }
    if (walletBalanceDelta > 0) {
        return (0, paymentWalletOperations_1.creditWalletBalance)(currentBalance, walletBalanceDelta);
    }
    return (0, paymentWalletOperations_1.debitWalletBalance)(currentBalance, primitives_1.KztMinorUnitsSchema.parse(-walletBalanceDelta));
}
const FINANCIAL_ISSUE_KINDS_RESOLVABLE_BY_CORRECTION = new Set([
    'financial_reconciliation_mismatch',
    'attendance_payment_conflict',
]);
function resolveFinancialAdminIssueForCorrection(existing, input) {
    if (existing.issueId !== input.adminIssueId) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId: input.correlationId,
            details: { field: 'adminIssueId', reason: 'conflict' },
        });
    }
    if (!FINANCIAL_ISSUE_KINDS_RESOLVABLE_BY_CORRECTION.has(existing.kind)) {
        throw new errors_1.CanonicalCommandError('forbidden', { correlationId: input.correlationId });
    }
    (0, adminIssuePolicy_1.assertAdministratorMayMutateAdminIssue)(input.correlationId, input.actor);
    const policy = (0, adminIssuePolicy_1.adminIssueKindPolicy)(existing.kind);
    if (policy.requireCoupledDomainCommandToResolve && !input.coupledDomainCommand) {
        throw new errors_1.CanonicalCommandError('invalid_transition', {
            correlationId: input.correlationId,
            details: { reason: 'unsupported' },
        });
    }
    return (0, adminIssuePolicy_1.resolveAdminIssue)(existing, input);
}
function assertFinancialCorrectionIssueSubjectMatchesPayment(correlationId, issue, payment) {
    const subjectId = issue.subjectRef.subjectKind === 'booking'
        ? issue.subjectRef.bookingId
        : issue.subjectRef.enrollmentId;
    if (issue.subjectRef.subjectKind !== payment.subjectType || subjectId !== payment.subjectId) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { field: 'adminIssueId', reason: 'conflict' },
        });
    }
}
function financialCorrectionActorFromContext(actor) {
    if (actor.kind === 'account') {
        return { kind: 'account', accountId: actor.accountId };
    }
    if (actor.kind === 'system') {
        return { kind: 'system', systemActorId: actor.systemActorId };
    }
    if (actor.kind === 'provider') {
        return { kind: 'provider', providerId: actor.providerId };
    }
    return { kind: 'guest', guestSubjectId: actor.guestSubjectId };
}
