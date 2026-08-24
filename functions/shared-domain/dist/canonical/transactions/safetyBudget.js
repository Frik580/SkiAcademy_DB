"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSACTION_SAFETY_BUDGET = exports.TRANSACTION_SAFETY_BUDGET_VERSION = void 0;
/**
 * Application-level transaction safety budgets from ADR-0002.
 *
 * These are conservative internal limits with operational headroom — they are
 * NOT Firestore platform quotas or permanent domain cardinality rules.
 */
exports.TRANSACTION_SAFETY_BUDGET_VERSION = 'transaction-safety:v1';
exports.TRANSACTION_SAFETY_BUDGET = {
    version: exports.TRANSACTION_SAFETY_BUDGET_VERSION,
    maxReads: 400,
    maxMutations: 400,
    /**
     * Conservative application estimate for combined document payload and
     * affected-index impact (~6 MiB). This is not an exact Firestore billing
     * calculation.
     */
    maxEstimatedRequestBytes: 6 * 1024 * 1024,
};
