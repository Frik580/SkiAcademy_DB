"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSACTION_BUDGET_VIOLATIONS = void 0;
exports.evaluateTransactionPreflight = evaluateTransactionPreflight;
exports.transactionPreflightDiagnostics = transactionPreflightDiagnostics;
exports.operationTooLargeFromPreflight = operationTooLargeFromPreflight;
exports.assertTransactionWithinBudget = assertTransactionWithinBudget;
const errors_1 = require("../errors");
const safetyBudget_1 = require("./safetyBudget");
const transactionPlan_1 = require("./transactionPlan");
exports.TRANSACTION_BUDGET_VIOLATIONS = [
    'reads_exceeded',
    'mutations_exceeded',
    'estimated_bytes_exceeded',
];
function evaluateTransactionPreflight(plan) {
    const estimate = (0, transactionPlan_1.estimateTransactionPlan)(plan);
    const violations = [];
    if (estimate.readCount > safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxReads) {
        violations.push('reads_exceeded');
    }
    if (estimate.mutationCount > safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxMutations) {
        violations.push('mutations_exceeded');
    }
    if (estimate.totalEstimatedBytes > safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes) {
        violations.push('estimated_bytes_exceeded');
    }
    if (violations.length > 0) {
        return { accepted: false, violations, estimate };
    }
    return { accepted: true, estimate };
}
function transactionPreflightDiagnostics(rejected) {
    return {
        violations: rejected.violations,
        estimate: rejected.estimate,
        limits: {
            maxReads: safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxReads,
            maxMutations: safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxMutations,
            maxEstimatedRequestBytes: safetyBudget_1.TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes,
        },
    };
}
function operationTooLargeFromPreflight(correlationId) {
    return new errors_1.CanonicalCommandError('operation_too_large', {
        correlationId,
        details: { reason: 'out_of_range' },
    });
}
function assertTransactionWithinBudget(correlationId, plan) {
    const preflight = evaluateTransactionPreflight(plan);
    if (!preflight.accepted) {
        throw operationTooLargeFromPreflight(correlationId);
    }
    return preflight.estimate;
}
