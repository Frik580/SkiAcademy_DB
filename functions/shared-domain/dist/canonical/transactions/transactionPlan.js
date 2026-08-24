"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionPlanBuilder = exports.TRANSACTION_MUTATION_KINDS = void 0;
exports.estimateTransactionPlan = estimateTransactionPlan;
exports.planAuditOutboxContributions = planAuditOutboxContributions;
const auditOutbox_1 = require("../auditOutbox");
exports.TRANSACTION_MUTATION_KINDS = ['create', 'update', 'delete'];
function emptyBreakdown() {
    return {
        aggregate: { reads: 0, mutations: 0, estimatedPayloadBytes: 0, estimatedIndexImpactBytes: 0 },
        resource_claim: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        resource_guard: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        payment_wallet: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        idempotency: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        activity_log: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        outbox_obligation: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        capacity_projection: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        authorization_check: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        enrollment_guard: {
            reads: 0,
            mutations: 0,
            estimatedPayloadBytes: 0,
            estimatedIndexImpactBytes: 0,
        },
        other: { reads: 0, mutations: 0, estimatedPayloadBytes: 0, estimatedIndexImpactBytes: 0 },
    };
}
class TransactionPlanBuilder {
    reads = [];
    mutations = [];
    planRead(input) {
        this.reads.push({
            path: input.path,
            category: input.category,
        });
        return this;
    }
    planMutation(input) {
        this.mutations.push({
            path: input.path,
            kind: input.kind,
            category: input.category,
            estimatedPayloadBytes: input.estimatedPayloadBytes,
            ...(input.estimatedIndexImpactBytes === undefined
                ? {}
                : { estimatedIndexImpactBytes: input.estimatedIndexImpactBytes }),
        });
        return this;
    }
    build() {
        return {
            reads: [...this.reads],
            mutations: [...this.mutations],
        };
    }
}
exports.TransactionPlanBuilder = TransactionPlanBuilder;
function estimateTransactionPlan(plan) {
    const byCategory = emptyBreakdown();
    for (const read of plan.reads) {
        byCategory[read.category].reads += 1;
    }
    let estimatedPayloadBytes = 0;
    let estimatedIndexImpactBytes = 0;
    for (const mutation of plan.mutations) {
        const category = byCategory[mutation.category];
        category.mutations += 1;
        category.estimatedPayloadBytes += mutation.estimatedPayloadBytes;
        const indexImpact = mutation.estimatedIndexImpactBytes ?? 0;
        category.estimatedIndexImpactBytes += indexImpact;
        estimatedPayloadBytes += mutation.estimatedPayloadBytes;
        estimatedIndexImpactBytes += indexImpact;
    }
    return {
        readCount: plan.reads.length,
        mutationCount: plan.mutations.length,
        estimatedPayloadBytes,
        estimatedIndexImpactBytes,
        totalEstimatedBytes: estimatedPayloadBytes + estimatedIndexImpactBytes,
        byCategory: byCategory,
    };
}
function planAuditOutboxContributions(builder, options) {
    builder.planMutation({
        path: options.activityLogPath,
        kind: 'create',
        category: 'activity_log',
        estimatedPayloadBytes: auditOutbox_1.AUDIT_CARDINALITY_LIMITS.activityLogTargetBytes,
    });
    const prefix = options.outboxPathPrefix ?? 'domain_outbox';
    for (let index = 0; index < options.outboxObligationCount; index += 1) {
        builder.planMutation({
            path: `${prefix}/obligation_${index}`,
            kind: 'create',
            category: 'outbox_obligation',
            estimatedPayloadBytes: auditOutbox_1.AUDIT_CARDINALITY_LIMITS.outboxObligationTargetBytes,
        });
    }
}
