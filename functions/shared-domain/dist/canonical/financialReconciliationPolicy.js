"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialReconciliationScopeSchema = exports.FINANCIAL_RECONCILIATION_SCOPES = void 0;
exports.foldPaymentAccountingFromEvents = foldPaymentAccountingFromEvents;
exports.foldWalletBalanceFromEvents = foldWalletBalanceFromEvents;
exports.reconcilePaymentState = reconcilePaymentState;
exports.reconcileWalletState = reconcileWalletState;
exports.primaryReconciliationScopeForMismatches = primaryReconciliationScopeForMismatches;
exports.financialReconciliationMismatchIdentity = financialReconciliationMismatchIdentity;
exports.rebuildPaymentProjectionFromEvents = rebuildPaymentProjectionFromEvents;
exports.rebuildWalletProjectionFromEvents = rebuildWalletProjectionFromEvents;
exports.maxPaymentEventRevisionFromEvents = maxPaymentEventRevisionFromEvents;
exports.maxWalletEventRevisionFromEvents = maxWalletEventRevisionFromEvents;
exports.assertMonetaryEventHistoryCoversPaymentRevision = assertMonetaryEventHistoryCoversPaymentRevision;
exports.assertMonetaryEventHistoryCoversWalletRevision = assertMonetaryEventHistoryCoversWalletRevision;
const zod_1 = require("zod");
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const errors_1 = require("./errors");
const paymentWallet_1 = require("./paymentWallet");
const primitives_1 = require("./primitives");
exports.FINANCIAL_RECONCILIATION_SCOPES = [
    'payment_projection',
    'payment_invariants',
    'wallet_balance',
    'incremental_requirements',
];
exports.FinancialReconciliationScopeSchema = zod_1.z.enum(exports.FINANCIAL_RECONCILIATION_SCOPES);
function applyPaymentEffectDeltas(current, effect) {
    return {
        originalPrice: current.originalPrice,
        price: primitives_1.KztMinorUnitsSchema.parse(current.price + (effect.priceDelta ?? 0)),
        paidAmount: primitives_1.KztMinorUnitsSchema.parse(current.paidAmount + (effect.paidAmountDelta ?? 0)),
        refundedAmount: primitives_1.KztMinorUnitsSchema.parse(current.refundedAmount + (effect.refundedAmountDelta ?? 0)),
        retainedAmount: current.retainedAmount,
        settledAmount: primitives_1.KztMinorUnitsSchema.parse(current.settledAmount + (effect.settledAmountDelta ?? 0)),
        writtenOffAmount: primitives_1.KztMinorUnitsSchema.parse(current.writtenOffAmount + (effect.writtenOffAmountDelta ?? 0)),
        outstandingAmount: primitives_1.KztMinorUnitsSchema.parse(current.outstandingAmount + (effect.outstandingAmountDelta ?? 0)),
    };
}
function comparePaymentEventRevision(left, right) {
    const leftRevision = left.paymentEventRevision ?? 0;
    const rightRevision = right.paymentEventRevision ?? 0;
    if (leftRevision !== rightRevision) {
        return leftRevision - rightRevision;
    }
    return left.eventId.localeCompare(right.eventId);
}
function compareWalletEventRevision(left, right) {
    const leftRevision = left.walletEventRevision ?? 0;
    const rightRevision = right.walletEventRevision ?? 0;
    if (leftRevision !== rightRevision) {
        return leftRevision - rightRevision;
    }
    return left.eventId.localeCompare(right.eventId);
}
function foldPaymentAccountingFromEvents(originalPrice, events) {
    const paymentEvents = events
        .filter((event) => event.paymentEffect !== undefined)
        .sort(comparePaymentEventRevision);
    let fields = {
        originalPrice,
        price: originalPrice,
        paidAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        refundedAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        retainedAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        settledAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        writtenOffAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        outstandingAmount: originalPrice,
    };
    for (const event of paymentEvents) {
        if (!event.paymentEffect)
            continue;
        fields = applyPaymentEffectDeltas(fields, event.paymentEffect);
        fields = {
            ...fields,
            retainedAmount: (0, paymentWallet_1.deriveRetainedAmount)(fields.paidAmount, fields.refundedAmount),
        };
    }
    return fields;
}
function foldWalletBalanceFromEvents(events) {
    const walletEvents = events
        .filter((event) => event.walletBalanceDelta !== undefined)
        .sort(compareWalletEventRevision);
    let balance = primitives_1.KztMinorUnitsSchema.parse(0);
    for (const event of walletEvents) {
        if (event.walletBalanceDelta === undefined)
            continue;
        balance = primitives_1.KztMinorUnitsSchema.parse(balance + event.walletBalanceDelta);
    }
    return balance;
}
function collectPaymentInvariantMismatches(payment) {
    const mismatches = [];
    const issues = [];
    (0, paymentWallet_1.validatePaymentAccounting)(payment, {
        addIssue: (issue) => {
            issues.push(issue);
        },
    });
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
        if (mismatches.some((mismatch) => mismatch.field === field && mismatch.scope === 'payment_invariants')) {
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
function collectIncrementalRequirementMismatches(payment) {
    const mismatches = [];
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
function paymentProjectionFieldsMatch(stored, folded) {
    return (stored.price === folded.price &&
        stored.paidAmount === folded.paidAmount &&
        stored.refundedAmount === folded.refundedAmount &&
        stored.settledAmount === folded.settledAmount &&
        stored.writtenOffAmount === folded.writtenOffAmount &&
        stored.outstandingAmount === folded.outstandingAmount);
}
function reconcilePaymentState(input) {
    const mismatches = [
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
    const derivedStatus = (0, paymentWallet_1.derivePaymentStatus)(input.payment);
    if (input.payment.paymentStatus !== derivedStatus) {
        mismatches.push({
            scope: 'payment_projection',
            kind: 'payment_projection_mismatch',
            field: 'paymentStatus',
        });
    }
    const maxPaymentEventRevision = input.paymentEvents.reduce((max, event) => Math.max(max, event.paymentEventRevision ?? 0), 0);
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
function reconcileWalletState(input) {
    const mismatches = [];
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
    const maxRevision = input.walletEvents.reduce((max, event) => Math.max(max, event.walletEventRevision ?? 0), 0);
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
function primaryReconciliationScopeForMismatches(mismatches) {
    const scopes = new Set(mismatches.map((mismatch) => mismatch.scope));
    if (scopes.has('payment_invariants'))
        return 'payment_invariants';
    if (scopes.has('payment_projection'))
        return 'payment_projection';
    if (scopes.has('incremental_requirements'))
        return 'incremental_requirements';
    return 'wallet_balance';
}
function financialReconciliationMismatchIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'financial_reconciliation_mismatch',
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        reconciliationScope: input.reconciliationScope,
    };
}
function rebuildPaymentProjectionFromEvents(payment, events) {
    const folded = foldPaymentAccountingFromEvents(payment.originalPrice, events);
    return {
        ...folded,
        paymentStatus: (0, paymentWallet_1.derivePaymentStatus)(folded),
    };
}
function rebuildWalletProjectionFromEvents(events) {
    const balance = foldWalletBalanceFromEvents(events);
    const eventRevision = events.reduce((max, event) => Math.max(max, event.walletEventRevision ?? 0), 0);
    return { balance, eventRevision };
}
function maxPaymentEventRevisionFromEvents(events) {
    return events.reduce((max, event) => Math.max(max, event.paymentEventRevision ?? 0), 0);
}
function maxWalletEventRevisionFromEvents(events) {
    return events.reduce((max, event) => Math.max(max, event.walletEventRevision ?? 0), 0);
}
function assertMonetaryEventHistoryCoversPaymentRevision(input) {
    const maxRevision = maxPaymentEventRevisionFromEvents(input.paymentEvents);
    if (input.payment.eventRevision > maxRevision) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId: input.correlationId,
            details: { reason: 'conflict', field: 'eventRevision' },
        });
    }
}
function assertMonetaryEventHistoryCoversWalletRevision(input) {
    const maxRevision = maxWalletEventRevisionFromEvents(input.walletEvents);
    if (input.wallet.eventRevision > maxRevision) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId: input.correlationId,
            details: { reason: 'conflict', field: 'eventRevision' },
        });
    }
}
