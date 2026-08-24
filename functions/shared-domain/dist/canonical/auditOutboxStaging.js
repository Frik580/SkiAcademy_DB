"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityLogActorKeyFromCommandActor = activityLogActorKeyFromCommandActor;
exports.buildActivityLogActorFromCommandActor = buildActivityLogActorFromCommandActor;
exports.deriveAffectedSubjectKeys = deriveAffectedSubjectKeys;
exports.validateActorCapabilitySeparation = validateActorCapabilitySeparation;
exports.estimateUtf8JsonBytes = estimateUtf8JsonBytes;
exports.assertActivityLogPayloadWithinTarget = assertActivityLogPayloadWithinTarget;
exports.assertOutboxPayloadsWithinTarget = assertOutboxPayloadsWithinTarget;
exports.validateAuditOutboxStagingPlan = validateAuditOutboxStagingPlan;
exports.buildOutboxIdsFromDrafts = buildOutboxIdsFromDrafts;
exports.buildActivityLogRecord = buildActivityLogRecord;
exports.buildOutboxObligationRecords = buildOutboxObligationRecords;
exports.canonicalFirestoreRecordsEquivalent = canonicalFirestoreRecordsEquivalent;
exports.parseStoredActivityLog = parseStoredActivityLog;
exports.parseStoredOutboxObligation = parseStoredOutboxObligation;
exports.auditIntegrityViolation = auditIntegrityViolation;
exports.planAuditOutboxStagingContributions = planAuditOutboxStagingContributions;
exports.resolveAuditOutboxPaths = resolveAuditOutboxPaths;
exports.emptyAuditOutboxStagingPlan = emptyAuditOutboxStagingPlan;
exports.committedAtTimestampFromClock = committedAtTimestampFromClock;
const canonicalJson_1 = require("./canonicalJson");
const auditOutbox_1 = require("./auditOutbox");
const auditEffectRegistry_1 = require("./auditEffectRegistry");
const auditReasonRegistry_1 = require("./auditReasonRegistry");
const capabilities_1 = require("./commands/capabilities");
const deterministicIdentity_1 = require("./deterministicIdentity");
const errors_1 = require("./errors");
const firestoreSerialization_1 = require("./firestoreSerialization");
const paths_1 = require("./paths");
const primitives_1 = require("./primitives");
const transactionPlan_1 = require("./transactions/transactionPlan");
function activityLogActorKeyFromCommandActor(actor) {
    switch (actor.kind) {
        case 'account':
            return `account:${actor.accountId}`;
        case 'guest':
            return `guest:${actor.guestSubjectId}`;
        case 'system':
            return `system:${actor.systemActorId}`;
        case 'provider':
            return `provider:${actor.providerId}`;
    }
}
function buildActivityLogActorFromCommandActor(actor) {
    const actorKey = activityLogActorKeyFromCommandActor(actor);
    switch (actor.kind) {
        case 'account':
            return { kind: 'account', actorKey, accountId: actor.accountId };
        case 'guest':
            return {
                kind: 'guest_credential',
                actorKey,
                guestSubjectRef: actor.guestSubjectId,
            };
        case 'system':
            return { kind: 'system', actorKey, systemActorId: actor.systemActorId };
        case 'provider':
            return { kind: 'provider', actorKey, providerId: actor.providerId };
    }
}
function deriveAffectedSubjectKeys(subjects) {
    const keys = subjects.map((subject) => `${subject.kind}:${subject.id}`);
    return [...new Set(keys)];
}
function validateActorCapabilitySeparation(correlationId, actor, exercisedCapability) {
    if (!(0, capabilities_1.isCapabilityAllowedForActorKind)(actor.kind, exercisedCapability)) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'conflict', field: 'exercisedCapability' },
        });
    }
    if (actor.kind === 'system' && exercisedCapability === 'administrator') {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'conflict', field: 'exercisedCapability' },
        });
    }
}
function estimateUtf8JsonBytes(value) {
    return new TextEncoder().encode((0, canonicalJson_1.canonicalJsonStringify)(value)).length;
}
function assertActivityLogPayloadWithinTarget(record) {
    const bytes = estimateUtf8JsonBytes(record);
    if (bytes > auditOutbox_1.AUDIT_CARDINALITY_LIMITS.activityLogTargetBytes) {
        throw new Error('Activity Log payload exceeds target size');
    }
}
function assertOutboxPayloadsWithinTarget(obligations) {
    for (const obligation of obligations) {
        const bytes = estimateUtf8JsonBytes(obligation);
        if (bytes > auditOutbox_1.AUDIT_CARDINALITY_LIMITS.outboxObligationTargetBytes) {
            throw new Error('Outbox obligation payload exceeds target size');
        }
    }
}
function validateAuditOutboxStagingPlan(envelope, plan) {
    const correlationId = envelope.context.correlationId;
    validateActorCapabilitySeparation(correlationId, envelope.context.actor, envelope.context.exercisedCapability);
    (0, auditReasonRegistry_1.validateAuditReason)(correlationId, envelope.kind, plan.activityLog.reason);
    (0, auditEffectRegistry_1.validateAuditEffectsForCommand)(correlationId, envelope.kind, plan.activityLog.effects);
    if (plan.outboxObligations.length > auditOutbox_1.AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
        throw new errors_1.CanonicalCommandError('operation_too_large', {
            correlationId,
            details: { reason: 'out_of_range' },
        });
    }
    if ((0, auditOutbox_1.containsLegacyMutableActivityLogFields)(plan.activityLog)) {
        throw new errors_1.CanonicalCommandError('validation', {
            correlationId,
            details: { reason: 'malformed', field: 'activityLog' },
        });
    }
    const envelopeLimits = [
        plan.activityLog.affectedSubjects.length <= auditOutbox_1.AUDIT_CARDINALITY_LIMITS.affectedSubjects,
        plan.activityLog.effects.length <= auditOutbox_1.AUDIT_CARDINALITY_LIMITS.effects,
        plan.activityLog.monetaryEventIds.length <= auditOutbox_1.AUDIT_CARDINALITY_LIMITS.monetaryEventIds,
        plan.activityLog.adminIssueIds.length <= auditOutbox_1.AUDIT_CARDINALITY_LIMITS.adminIssueIds,
        plan.activityLog.resultingRevisions.length <= auditOutbox_1.AUDIT_CARDINALITY_LIMITS.resultingRevisions,
    ];
    if (!envelopeLimits.every(Boolean)) {
        throw new errors_1.CanonicalCommandError('operation_too_large', {
            correlationId,
            details: { reason: 'out_of_range' },
        });
    }
    const affectedSubjectKeys = deriveAffectedSubjectKeys(plan.activityLog.affectedSubjects);
    if (affectedSubjectKeys.length > auditOutbox_1.AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys) {
        throw new errors_1.CanonicalCommandError('operation_too_large', {
            correlationId,
            details: { reason: 'out_of_range' },
        });
    }
    const ordinals = new Set();
    for (const obligation of plan.outboxObligations) {
        if (ordinals.has(obligation.deliveryEffectOrdinal)) {
            throw new errors_1.CanonicalCommandError('validation', {
                correlationId,
                details: { reason: 'conflict', field: 'outboxObligations.deliveryEffectOrdinal' },
            });
        }
        ordinals.add(obligation.deliveryEffectOrdinal);
    }
}
function buildOutboxIdsFromDrafts(commandId, drafts) {
    return drafts.map((draft) => (0, deterministicIdentity_1.domainOutboxIdFromCommand)(commandId, draft.deliveryEffectOrdinal));
}
function buildActivityLogRecord(input) {
    const activityLogId = (0, deterministicIdentity_1.activityLogIdFromCommandId)(input.commandId);
    const affectedSubjectKeys = deriveAffectedSubjectKeys(input.plan.affectedSubjects);
    const record = auditOutbox_1.ActivityLogSchema.parse({
        schemaVersion: auditOutbox_1.AUDIT_SCHEMA_VERSION,
        activityLogId,
        command: {
            commandId: input.commandId,
            kind: input.envelope.kind,
        },
        actor: buildActivityLogActorFromCommandActor(input.envelope.context.actor),
        exercisedCapability: input.envelope.context.exercisedCapability,
        source: input.envelope.context.source,
        correlationId: input.envelope.context.correlationId,
        ...(input.envelope.context.causationId === undefined
            ? {}
            : { causationId: input.envelope.context.causationId }),
        decidedAt: input.decidedAt,
        committedAt: input.committedAt,
        reason: input.plan.reason,
        primarySubject: input.plan.primarySubject,
        affectedSubjects: input.plan.affectedSubjects,
        affectedSubjectKeys,
        effects: input.plan.effects,
        monetaryEventIds: input.plan.monetaryEventIds,
        adminIssueIds: input.plan.adminIssueIds,
        outboxIds: input.outboxIds,
        resultingRevisions: input.plan.resultingRevisions,
        ...(input.plan.correctsActivityLogId === undefined
            ? {}
            : { correctsActivityLogId: input.plan.correctsActivityLogId }),
        retentionPolicyVersion: auditOutbox_1.AUDIT_RETENTION_POLICY_VERSION,
    });
    assertActivityLogPayloadWithinTarget(record);
    return record;
}
function buildOutboxObligationRecords(input) {
    const obligations = input.drafts.map((draft) => auditOutbox_1.DomainOutboxObligationSchema.parse({
        schemaVersion: auditOutbox_1.OUTBOX_SCHEMA_VERSION,
        outboxId: (0, deterministicIdentity_1.domainOutboxIdFromCommand)(input.commandId, draft.deliveryEffectOrdinal),
        commandId: input.commandId,
        activityLogId: input.activityLogId,
        deliveryEffectOrdinal: draft.deliveryEffectOrdinal,
        recipient: draft.recipient,
        channel: draft.channel,
        templateId: draft.templateId,
        templateVersion: draft.templateVersion,
        renderInputs: draft.renderInputs,
        deliverySemantics: draft.deliverySemantics,
        createdAt: input.createdAt,
        delivery: { status: 'pending' },
    }));
    assertOutboxPayloadsWithinTarget(obligations);
    return obligations;
}
function canonicalFirestoreRecordsEquivalent(existing, expected) {
    const normalizedExisting = (0, firestoreSerialization_1.normalizeFirestoreDocument)(existing);
    const normalizedExpected = (0, firestoreSerialization_1.normalizeFirestoreDocument)(expected);
    if (!normalizedExisting || !normalizedExpected) {
        return false;
    }
    return (0, canonicalJson_1.canonicalJsonStringify)(normalizedExisting) === (0, canonicalJson_1.canonicalJsonStringify)(normalizedExpected);
}
function parseStoredActivityLog(data) {
    const normalized = (0, firestoreSerialization_1.normalizeFirestoreDocument)(data);
    if (!normalized) {
        return undefined;
    }
    const parsed = auditOutbox_1.ActivityLogSchema.safeParse(normalized);
    return parsed.success ? parsed.data : undefined;
}
function parseStoredOutboxObligation(data) {
    const normalized = (0, firestoreSerialization_1.normalizeFirestoreDocument)(data);
    if (!normalized) {
        return undefined;
    }
    const parsed = auditOutbox_1.DomainOutboxObligationSchema.safeParse(normalized);
    return parsed.success ? parsed.data : undefined;
}
function auditIntegrityViolation(correlationId) {
    return new errors_1.CanonicalCommandError('audit_integrity_violation', { correlationId });
}
function planAuditOutboxStagingContributions(builder, input) {
    (0, transactionPlan_1.planAuditOutboxContributions)(builder, {
        activityLogPath: input.activityLogPath,
        outboxObligationCount: input.outboxObligationPaths.length,
    });
}
function resolveAuditOutboxPaths(commandId, deliveryEffectOrdinals) {
    const activityLogPath = paths_1.canonicalPaths.activityLog((0, deterministicIdentity_1.activityLogIdFromCommandId)(commandId));
    const outboxPaths = deliveryEffectOrdinals.map((ordinal) => paths_1.canonicalPaths.domainOutbox((0, deterministicIdentity_1.domainOutboxIdFromCommand)(commandId, ordinal)));
    return { activityLogPath, outboxPaths };
}
function emptyAuditOutboxStagingPlan(reasonCode = 'scheduled_system_action') {
    return {
        activityLog: {
            reason: {
                registryVersion: 'reason:v1',
                reasonCode,
            },
            primarySubject: { kind: 'booking', id: 'placeholder', subjectKey: 'booking:placeholder' },
            affectedSubjects: [],
            effects: [],
            monetaryEventIds: [],
            adminIssueIds: [],
            resultingRevisions: [],
        },
        outboxObligations: [],
    };
}
function committedAtTimestampFromClock(clock) {
    return (0, primitives_1.timestampFromDate)(clock.committedAt());
}
