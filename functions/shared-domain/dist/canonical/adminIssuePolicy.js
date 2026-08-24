"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_ISSUE_KIND_POLICIES = exports.PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION = void 0;
exports.adminIssueKindPolicy = adminIssueKindPolicy;
exports.paymentRequiredAtStartIdentity = paymentRequiredAtStartIdentity;
exports.evaluateIndividualBookingPaymentStartGate = evaluateIndividualBookingPaymentStartGate;
exports.assertBookingPaymentIdentity = assertBookingPaymentIdentity;
exports.assertCompatibleAdminIssueIdentity = assertCompatibleAdminIssueIdentity;
exports.createOpenAdminIssue = createOpenAdminIssue;
exports.reuseOrReopenAdminIssue = reuseOrReopenAdminIssue;
exports.assertAdministratorMayMutateAdminIssue = assertAdministratorMayMutateAdminIssue;
exports.resolveAdminIssue = resolveAdminIssue;
exports.dismissAdminIssue = dismissAdminIssue;
exports.sanitizePaymentStartGateForInstructor = sanitizePaymentStartGateForInstructor;
exports.sanitizedInstructorViewOmitsFinancialFields = sanitizedInstructorViewOmitsFinancialFields;
const courseEnrollmentAttendanceAdminIssue_1 = require("./courseEnrollmentAttendanceAdminIssue");
const errors_1 = require("./errors");
const paymentWallet_1 = require("./paymentWallet");
const primitives_1 = require("./primitives");
const revisionConcurrency_1 = require("./revisionConcurrency");
const deterministicIdentity_1 = require("./deterministicIdentity");
exports.PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION = 'Payment required—do not start';
exports.ADMIN_ISSUE_KIND_POLICIES = {
    missing_attendance: {
        severity: 'normal',
        blocksOutcome: true,
        blocksDelivery: false,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    payment_required_at_start: {
        severity: 'urgent',
        blocksOutcome: true,
        blocksDelivery: true,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    unresolved_pending_cancellation: {
        severity: 'normal',
        blocksOutcome: true,
        blocksDelivery: true,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    attendance_payment_conflict: {
        severity: 'critical',
        blocksOutcome: true,
        blocksDelivery: true,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    resource_reconciliation_mismatch: {
        severity: 'urgent',
        blocksOutcome: false,
        blocksDelivery: false,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    financial_reconciliation_mismatch: {
        severity: 'urgent',
        blocksOutcome: false,
        blocksDelivery: false,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
    outcome_correction_required: {
        severity: 'urgent',
        blocksOutcome: true,
        blocksDelivery: false,
        allowDismiss: false,
        requireCoupledDomainCommandToResolve: true,
    },
};
function adminIssueKindPolicy(kind) {
    return exports.ADMIN_ISSUE_KIND_POLICIES[kind];
}
function paymentRequiredAtStartIdentity(input) {
    return {
        strategyVersion: courseEnrollmentAttendanceAdminIssue_1.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: 'payment_required_at_start',
        subjectKind: 'booking',
        subjectId: input.bookingId,
        occurrenceId: input.occurrenceId,
    };
}
function evaluateIndividualBookingPaymentStartGate(input) {
    if (input.subjectKind !== 'booking') {
        return { outcome: 'unsupported_subject' };
    }
    if (!input.booking || !input.payment) {
        return { outcome: 'unsupported_subject' };
    }
    if (input.booking.party.kind !== 'individual') {
        return { outcome: 'ineligible_not_individual' };
    }
    const status = input.booking.lifecycle.status;
    if (status === 'cancelled' || status === 'completed' || status === 'no_show') {
        return { outcome: 'ineligible_terminal' };
    }
    if (status !== 'confirmed') {
        return { outcome: 'ineligible_not_confirmed' };
    }
    if ((0, primitives_1.compareCanonicalTimestamps)(input.now, input.booking.occurrence.interval.startsAt) < 0) {
        return { outcome: 'too_early' };
    }
    return (0, paymentWallet_1.isPaymentFullyFundedForService)(input.payment)
        ? { outcome: 'fully_funded' }
        : { outcome: 'underfunded' };
}
function assertBookingPaymentIdentity(correlationId, booking, payment) {
    const expectedPaymentId = (0, deterministicIdentity_1.paymentIdFromBookingId)(booking.bookingId);
    if (booking.paymentId !== payment.paymentId ||
        payment.paymentId !== expectedPaymentId ||
        !(0, paymentWallet_1.paymentIdMatchesSubject)(payment, {
            subjectType: 'booking',
            subjectId: booking.bookingId,
        })) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { field: 'paymentId', reason: 'conflict', resourceKind: 'booking' },
        });
    }
}
function assertCompatibleAdminIssueIdentity(correlationId, existing, identity) {
    const expectedKey = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueDedupeKeyFromIdentity)(identity);
    const expectedId = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueIdFromDedupeKey)(expectedKey);
    const actualKey = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueDedupeKeyFromIdentity)((0, courseEnrollmentAttendanceAdminIssue_1.adminIssueDedupeIdentityFromRecord)(existing));
    if (existing.issueId !== expectedId ||
        existing.dedupeKey !== expectedKey ||
        actualKey !== expectedKey) {
        throw new errors_1.CanonicalCommandError('audit_integrity_violation', { correlationId });
    }
}
function createOpenAdminIssue(input) {
    const policy = adminIssueKindPolicy(input.identity.kind);
    const dedupeKey = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueDedupeKeyFromIdentity)(input.identity);
    const issueId = (0, courseEnrollmentAttendanceAdminIssue_1.adminIssueIdFromDedupeKey)(dedupeKey);
    const subjectRef = input.identity.subjectKind === 'booking'
        ? { subjectKind: 'booking', bookingId: input.identity.subjectId }
        : {
            subjectKind: 'course_enrollment',
            enrollmentId: input.identity.subjectId,
        };
    return courseEnrollmentAttendanceAdminIssue_1.AdminIssueSchema.parse({
        issueId,
        kind: input.identity.kind,
        subjectRef,
        ...(input.identity.occurrenceId === undefined
            ? {}
            : { occurrenceId: input.identity.occurrenceId }),
        ...(input.identity.participantId === undefined
            ? {}
            : { participantId: input.identity.participantId }),
        ...(input.identity.courseDayId === undefined
            ? {}
            : { courseDayId: input.identity.courseDayId }),
        ...(input.identity.scheduleRevision === undefined
            ? {}
            : { scheduleRevision: input.identity.scheduleRevision }),
        ...(input.identity.reconciliationScope === undefined
            ? {}
            : { reconciliationScope: input.identity.reconciliationScope }),
        lifecycle: {
            status: 'open',
            openedAt: input.now,
            lastDetectedAt: input.now,
        },
        severity: policy.severity,
        blocksOutcome: policy.blocksOutcome,
        blocksDelivery: policy.blocksDelivery,
        dedupeKey,
        revision: 1,
        correlationId: input.correlationId,
        ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
        createdAt: input.now,
        updatedAt: input.now,
        audit: {
            createdByCommandId: input.commandId,
            lastChangedByCommandId: input.commandId,
            correlationId: input.correlationId,
        },
    });
}
function reuseOrReopenAdminIssue(existing, input) {
    assertCompatibleAdminIssueIdentity(input.correlationId, existing, input.identity);
    const openedAt = existing.lifecycle.openedAt;
    const nextLifecycle = existing.lifecycle.status === 'open'
        ? {
            status: 'open',
            openedAt,
            lastDetectedAt: input.now,
            ...(existing.lifecycle.reopenedAt === undefined
                ? {}
                : { reopenedAt: existing.lifecycle.reopenedAt }),
        }
        : {
            status: 'open',
            openedAt,
            lastDetectedAt: input.now,
            reopenedAt: input.now,
        };
    return courseEnrollmentAttendanceAdminIssue_1.AdminIssueSchema.parse({
        ...existing,
        lifecycle: nextLifecycle,
        revision: (0, revisionConcurrency_1.nextAggregateRevision)(existing.revision),
        correlationId: input.correlationId,
        updatedAt: input.now,
        audit: {
            ...existing.audit,
            lastChangedByCommandId: input.commandId,
            correlationId: input.correlationId,
        },
    });
}
function assertAdministratorMayMutateAdminIssue(correlationId, actor) {
    if (actor.actor.kind !== 'account' || actor.exercisedCapability !== 'administrator') {
        throw new errors_1.CanonicalCommandError('forbidden', { correlationId });
    }
    return actor.actor.accountId;
}
function assertOpenIssue(correlationId, issue) {
    if (issue.lifecycle.status !== 'open') {
        throw new errors_1.CanonicalCommandError('invalid_transition', {
            correlationId,
            details: { reason: 'conflict' },
        });
    }
}
function applyTerminalIssueLifecycle(existing, input, status) {
    const resolvedByAccountId = assertAdministratorMayMutateAdminIssue(input.correlationId, input.actor);
    (0, revisionConcurrency_1.assertExpectedRevision)({
        correlationId: input.correlationId,
        expectedRevision: input.expectedRevision,
        currentRevision: existing.revision,
        requireExpectedRevision: true,
    });
    assertOpenIssue(input.correlationId, existing);
    const reason = input.reason.trim();
    if (!reason) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId: input.correlationId,
            details: { field: 'reason', reason: 'required' },
        });
    }
    return courseEnrollmentAttendanceAdminIssue_1.AdminIssueSchema.parse({
        ...existing,
        lifecycle: {
            status,
            openedAt: existing.lifecycle.openedAt,
            lastDetectedAt: existing.lifecycle.lastDetectedAt,
            ...(existing.lifecycle.reopenedAt === undefined
                ? {}
                : { reopenedAt: existing.lifecycle.reopenedAt }),
            resolvedAt: input.now,
            resolution: {
                reason,
                resolvedByAccountId,
            },
        },
        revision: (0, revisionConcurrency_1.nextAggregateRevision)(existing.revision),
        updatedAt: input.now,
        audit: {
            ...existing.audit,
            lastChangedByCommandId: input.commandId,
            correlationId: input.correlationId,
        },
    });
}
function resolveAdminIssue(existing, input) {
    const policy = adminIssueKindPolicy(existing.kind);
    if (policy.requireCoupledDomainCommandToResolve && !input.coupledDomainCommand) {
        throw new errors_1.CanonicalCommandError('invalid_transition', {
            correlationId: input.correlationId,
            details: { reason: 'unsupported' },
        });
    }
    return applyTerminalIssueLifecycle(existing, input, 'resolved');
}
function dismissAdminIssue(existing, input) {
    const policy = adminIssueKindPolicy(existing.kind);
    if (!policy.allowDismiss) {
        throw new errors_1.CanonicalCommandError('invalid_transition', {
            correlationId: input.correlationId,
            details: { reason: 'unsupported' },
        });
    }
    return applyTerminalIssueLifecycle(existing, input, 'dismissed');
}
function sanitizePaymentStartGateForInstructor(issue) {
    if (issue.kind !== 'payment_required_at_start' ||
        issue.lifecycle.status !== 'open' ||
        issue.blocksDelivery !== true) {
        return undefined;
    }
    return {
        restriction: 'payment_required_at_start',
        instruction: exports.PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION,
        blocksDelivery: true,
    };
}
function sanitizedInstructorViewOmitsFinancialFields(view) {
    const serialized = JSON.stringify(view);
    return !/(price|paidAmount|outstandingAmount|retainedAmount|writtenOffAmount|balance|refund)/i.test(serialized);
}
