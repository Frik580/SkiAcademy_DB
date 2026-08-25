"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyMutableActivityLogShapeSchema = exports.MutableAuditFieldNames = exports.DomainOutboxObligationSchema = exports.OutboxRenderInputSchema = exports.OutboxRecipientRefSchema = exports.OUTBOX_DELIVERY_STATUSES = exports.OUTBOX_DELIVERY_CHANNELS = exports.ActivityLogSchema = exports.ActivityLogResultingRevisionSchema = exports.ActivityLogEffectSchema = exports.ActivityLogPrimarySubjectSchema = exports.ActivityLogReasonSchema = exports.ActivityLogActorSchema = exports.FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS = exports.AUDIT_EFFECT_KINDS = exports.COMMAND_SOURCES = exports.EXERCISED_CAPABILITIES = exports.ACTIVITY_LOG_ACTOR_KINDS = exports.AUDIT_CARDINALITY_LIMITS = exports.AUDIT_RETENTION_POLICY_VERSION = exports.OUTBOX_SCHEMA_VERSION = exports.AUDIT_SCHEMA_VERSION = void 0;
exports.financialActivityLogEffectSummaryDuplicatesMonetaryDetail = financialActivityLogEffectSummaryDuplicatesMonetaryDetail;
exports.containsLegacyMutableActivityLogFields = containsLegacyMutableActivityLogFields;
exports.activityLogEnvelopeWithinLimits = activityLogEnvelopeWithinLimits;
exports.outboxObligationCountWithinLimit = outboxObligationCountWithinLimit;
exports.activityLogLinksToCommand = activityLogLinksToCommand;
exports.serializedPayloadWithinTarget = serializedPayloadWithinTarget;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const primitives_1 = require("./primitives");
const deterministicIdentity_1 = require("./deterministicIdentity");
exports.AUDIT_SCHEMA_VERSION = 'audit:v1';
exports.OUTBOX_SCHEMA_VERSION = 'outbox:v1';
exports.AUDIT_RETENTION_POLICY_VERSION = 'audit-retention:v1';
exports.AUDIT_CARDINALITY_LIMITS = {
    affectedSubjects: 64,
    affectedSubjectKeys: 64,
    effects: 32,
    monetaryEventIds: 32,
    adminIssueIds: 32,
    resultingRevisions: 64,
    outboxIds: 32,
    outboxObligationsPerCommand: 32,
    explanationMaxBytes: 1024,
    activityLogTargetBytes: 64 * 1024,
    outboxObligationTargetBytes: 32 * 1024,
};
exports.ACTIVITY_LOG_ACTOR_KINDS = [
    'account',
    'guest_credential',
    'system',
    'provider',
];
exports.EXERCISED_CAPABILITIES = [
    'account_owner',
    'parent_guardian',
    'administrator',
    'instructor',
    'system',
    'provider_callback',
    'guest',
];
exports.COMMAND_SOURCES = [
    'client_callable',
    'admin_callable',
    'guest_callable',
    'scheduler',
    'provider_callback',
    'system_reconciliation',
];
exports.AUDIT_EFFECT_KINDS = [
    'payment_state_changed',
    'wallet_balance_changed',
    'booking_lifecycle_changed',
    'booking_schedule_changed',
    'booking_service_changed',
    'course_enrollment_lifecycle_changed',
    'resource_claim_changed',
    'attendance_recorded',
    'admin_issue_opened',
    'admin_issue_resolved',
    'participant_access_changed',
    'audit_correction_recorded',
    'financial_correction_recorded',
    'outbox_obligation_created',
];
exports.FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS = [
    'payment_state_changed',
    'wallet_balance_changed',
    'financial_correction_recorded',
];
const MONETARY_FIELD_ASSIGNMENT_IN_SUMMARY = /(?:balance|paidAmount|refundedAmount|retainedAmount|writtenOffAmount|outstandingAmount|settledAmount|minorUnits|price)\s*[:=]\s*\d/i;
const FINANCIAL_VERB_FOLLOWED_BY_AMOUNT = /\b(?:charged|refunded|paid|credited|debited|balance|owing|outstanding|settled|written[\s-]?off|amount)\s+\d[\d,]*/i;
const AMOUNT_WITH_CURRENCY_IN_SUMMARY = /\b\d[\d,]*\s+(?:KZT|kzt|₸|тенге)\b|\b(?:KZT|kzt|₸)\s+\d[\d,]*\b/i;
function financialActivityLogEffectSummaryDuplicatesMonetaryDetail(summary) {
    return (MONETARY_FIELD_ASSIGNMENT_IN_SUMMARY.test(summary) ||
        FINANCIAL_VERB_FOLLOWED_BY_AMOUNT.test(summary) ||
        AMOUNT_WITH_CURRENCY_IN_SUMMARY.test(summary));
}
exports.ActivityLogActorSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z
        .object({
        kind: zod_1.z.literal('account'),
        actorKey: zod_1.z.string().min(1).max(128),
        accountId: identifiers_1.AccountIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('guest_credential'),
        actorKey: zod_1.z.string().min(1).max(128),
        guestSubjectRef: identifiers_1.GuestSubjectIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('system'),
        actorKey: zod_1.z.string().min(1).max(128),
        systemActorId: identifiers_1.SystemActorIdSchema,
    })
        .strict(),
    zod_1.z
        .object({
        kind: zod_1.z.literal('provider'),
        actorKey: zod_1.z.string().min(1).max(128),
        providerId: identifiers_1.ProviderIdSchema,
    })
        .strict(),
]);
exports.ActivityLogReasonSchema = zod_1.z
    .object({
    registryVersion: zod_1.z.string().min(1).max(32),
    reasonCode: zod_1.z.string().min(1).max(64),
    explanation: zod_1.z.string().max(exports.AUDIT_CARDINALITY_LIMITS.explanationMaxBytes).optional(),
})
    .strict();
exports.ActivityLogPrimarySubjectSchema = zod_1.z
    .object({
    kind: zod_1.z.string().min(1).max(64),
    id: zod_1.z.string().min(1).max(128),
    subjectKey: zod_1.z.string().min(1).max(160),
})
    .strict();
exports.ActivityLogEffectSchema = zod_1.z
    .object({
    kind: zod_1.z.enum(exports.AUDIT_EFFECT_KINDS),
    subjectRef: identifiers_1.CanonicalReferenceSchema.optional(),
    summary: zod_1.z.string().min(1).max(256),
})
    .strict()
    .superRefine((effect, context) => {
    if (financialActivityLogEffectSummaryDuplicatesMonetaryDetail(effect.summary)) {
        context.addIssue({
            code: 'custom',
            path: ['summary'],
            message: 'Activity Log effects must not embed monetary amounts, balances, or field values in summary text',
        });
    }
});
exports.ActivityLogResultingRevisionSchema = zod_1.z
    .object({
    subject: identifiers_1.CanonicalReferenceSchema,
    revision: primitives_1.AggregateRevisionSchema,
})
    .strict();
exports.ActivityLogSchema = zod_1.z
    .object({
    schemaVersion: zod_1.z.literal(exports.AUDIT_SCHEMA_VERSION),
    activityLogId: identifiers_1.ActivityLogIdSchema,
    command: zod_1.z
        .object({
        commandId: identifiers_1.CommandIdSchema,
        kind: zod_1.z.string().min(1).max(64),
    })
        .strict(),
    actor: exports.ActivityLogActorSchema,
    exercisedCapability: zod_1.z.enum(exports.EXERCISED_CAPABILITIES),
    source: zod_1.z.enum(exports.COMMAND_SOURCES),
    correlationId: identifiers_1.CorrelationIdSchema,
    causationId: identifiers_1.CausationIdSchema.optional(),
    decidedAt: primitives_1.CanonicalTimestampSchema,
    committedAt: primitives_1.CanonicalTimestampSchema,
    reason: exports.ActivityLogReasonSchema,
    primarySubject: exports.ActivityLogPrimarySubjectSchema,
    affectedSubjects: zod_1.z
        .array(identifiers_1.CanonicalReferenceSchema)
        .max(exports.AUDIT_CARDINALITY_LIMITS.affectedSubjects),
    affectedSubjectKeys: zod_1.z
        .array(zod_1.z.string().min(1).max(160))
        .max(exports.AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys),
    effects: zod_1.z.array(exports.ActivityLogEffectSchema).max(exports.AUDIT_CARDINALITY_LIMITS.effects),
    monetaryEventIds: zod_1.z.array(identifiers_1.MonetaryEventIdSchema).max(exports.AUDIT_CARDINALITY_LIMITS.monetaryEventIds),
    adminIssueIds: zod_1.z.array(identifiers_1.AdminIssueIdSchema).max(exports.AUDIT_CARDINALITY_LIMITS.adminIssueIds),
    outboxIds: zod_1.z.array(identifiers_1.DomainOutboxIdSchema).max(exports.AUDIT_CARDINALITY_LIMITS.outboxIds),
    resultingRevisions: zod_1.z
        .array(exports.ActivityLogResultingRevisionSchema)
        .max(exports.AUDIT_CARDINALITY_LIMITS.resultingRevisions),
    correctsActivityLogId: identifiers_1.ActivityLogIdSchema.optional(),
    retentionPolicyVersion: zod_1.z.literal(exports.AUDIT_RETENTION_POLICY_VERSION),
})
    .strict()
    .superRefine((record, context) => {
    const expectedActivityLogId = (0, deterministicIdentity_1.activityLogIdFromCommandId)(record.command.commandId);
    if (record.activityLogId !== expectedActivityLogId) {
        context.addIssue({
            code: 'custom',
            path: ['activityLogId'],
            message: 'activityLogId must be derived from commandId',
        });
    }
    if ((0, primitives_1.compareCanonicalTimestamps)(record.committedAt, record.decidedAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['committedAt'],
            message: 'committedAt must not precede decidedAt',
        });
    }
    const uniqueSubjectKeys = new Set(record.affectedSubjectKeys);
    if (uniqueSubjectKeys.size !== record.affectedSubjectKeys.length) {
        context.addIssue({
            code: 'custom',
            path: ['affectedSubjectKeys'],
            message: 'affectedSubjectKeys must be deduplicated',
        });
    }
    if (record.outboxIds.length > exports.AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
        context.addIssue({
            code: 'custom',
            path: ['outboxIds'],
            message: 'outboxIds exceed the per-command obligation limit',
        });
    }
});
exports.OUTBOX_DELIVERY_CHANNELS = ['email', 'push', 'sms', 'in_app'];
exports.OUTBOX_DELIVERY_STATUSES = ['pending', 'leased', 'delivered', 'dead_letter'];
exports.OutboxRecipientRefSchema = zod_1.z
    .object({
    kind: zod_1.z.enum(['account', 'participant', 'instructor', 'guest']),
    id: zod_1.z.string().min(1).max(128),
})
    .strict();
exports.OutboxRenderInputSchema = zod_1.z
    .record(zod_1.z.string(), zod_1.z.union([zod_1.z.string().max(512), zod_1.z.number().finite(), zod_1.z.boolean()]))
    .refine((value) => Object.keys(value).length <= 32, 'Render inputs are bounded');
exports.DomainOutboxObligationSchema = zod_1.z
    .object({
    schemaVersion: zod_1.z.literal(exports.OUTBOX_SCHEMA_VERSION),
    outboxId: identifiers_1.DomainOutboxIdSchema,
    commandId: identifiers_1.CommandIdSchema,
    activityLogId: identifiers_1.ActivityLogIdSchema,
    deliveryEffectOrdinal: zod_1.z.number().finite().int().min(0).max(31),
    recipient: exports.OutboxRecipientRefSchema,
    channel: zod_1.z.enum(exports.OUTBOX_DELIVERY_CHANNELS),
    templateId: zod_1.z.string().min(1).max(64),
    templateVersion: zod_1.z.string().min(1).max(32),
    renderInputs: exports.OutboxRenderInputSchema,
    deliverySemantics: zod_1.z.enum(['transactional', 'operational']),
    createdAt: primitives_1.CanonicalTimestampSchema,
    delivery: zod_1.z.discriminatedUnion('status', [
        zod_1.z.object({ status: zod_1.z.literal('pending') }).strict(),
        zod_1.z
            .object({
            status: zod_1.z.literal('leased'),
            leasedAt: primitives_1.CanonicalTimestampSchema,
            leaseExpiresAt: primitives_1.CanonicalTimestampSchema,
        })
            .strict(),
        zod_1.z
            .object({
            status: zod_1.z.literal('delivered'),
            deliveredAt: primitives_1.CanonicalTimestampSchema,
        })
            .strict(),
        zod_1.z
            .object({
            status: zod_1.z.literal('dead_letter'),
            deadLetteredAt: primitives_1.CanonicalTimestampSchema,
            lastErrorCode: zod_1.z.string().min(1).max(64),
        })
            .strict(),
    ]),
})
    .strict()
    .superRefine((obligation, context) => {
    const expectedActivityLogId = (0, deterministicIdentity_1.activityLogIdFromCommandId)(obligation.commandId);
    if (obligation.activityLogId !== expectedActivityLogId) {
        context.addIssue({
            code: 'custom',
            path: ['activityLogId'],
            message: 'activityLogId must match the origin command',
        });
    }
    const expectedOutboxId = (0, deterministicIdentity_1.domainOutboxIdFromCommand)(obligation.commandId, obligation.deliveryEffectOrdinal);
    if (obligation.outboxId !== expectedOutboxId) {
        context.addIssue({
            code: 'custom',
            path: ['outboxId'],
            message: 'outboxId must be derived from commandId and deliveryEffectOrdinal',
        });
    }
    if (obligation.deliveryEffectOrdinal >= exports.AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
        context.addIssue({
            code: 'custom',
            path: ['deliveryEffectOrdinal'],
            message: 'deliveryEffectOrdinal exceeds the per-command outbox limit',
        });
    }
});
exports.MutableAuditFieldNames = [
    'updatedAt',
    'delivery',
    'leaseExpiresAt',
    'lastErrorCode',
];
exports.LegacyMutableActivityLogShapeSchema = zod_1.z
    .object({
    updatedAt: zod_1.z.unknown().optional(),
    updatedBy: zod_1.z.unknown().optional(),
    mutable: zod_1.z.unknown().optional(),
    balanceUSD: zod_1.z.unknown().optional(),
    paidAmount: zod_1.z.unknown().optional(),
    refundedAmount: zod_1.z.unknown().optional(),
    walletBalance: zod_1.z.unknown().optional(),
    monetaryDeltas: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of [
        'updatedAt',
        'updatedBy',
        'mutable',
        'balanceUSD',
        'paidAmount',
        'refundedAmount',
        'walletBalance',
        'monetaryDeltas',
    ]) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Legacy or mutable Activity Log field is not canonical',
            });
        }
    }
});
function containsLegacyMutableActivityLogFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    return [
        'updatedAt',
        'updatedBy',
        'mutable',
        'balanceUSD',
        'paidAmount',
        'refundedAmount',
        'walletBalance',
        'monetaryDeltas',
    ].some((field) => record[field] !== undefined);
}
function activityLogEnvelopeWithinLimits(record) {
    return (record.affectedSubjects.length <= exports.AUDIT_CARDINALITY_LIMITS.affectedSubjects &&
        record.affectedSubjectKeys.length <= exports.AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys &&
        record.effects.length <= exports.AUDIT_CARDINALITY_LIMITS.effects &&
        record.monetaryEventIds.length <= exports.AUDIT_CARDINALITY_LIMITS.monetaryEventIds &&
        record.adminIssueIds.length <= exports.AUDIT_CARDINALITY_LIMITS.adminIssueIds &&
        record.outboxIds.length <= exports.AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand &&
        record.resultingRevisions.length <= exports.AUDIT_CARDINALITY_LIMITS.resultingRevisions);
}
function outboxObligationCountWithinLimit(count) {
    return count >= 0 && count <= exports.AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand;
}
function activityLogLinksToCommand(record, commandId) {
    return (record.command.commandId === commandId &&
        record.activityLogId === (0, deterministicIdentity_1.activityLogIdFromCommandId)(commandId));
}
function serializedPayloadWithinTarget(bytes, targetBytes) {
    return bytes > 0 && bytes <= targetBytes;
}
