import { z } from 'zod';
import { type CommandId } from './identifiers';
export declare const AUDIT_SCHEMA_VERSION: "audit:v1";
export declare const OUTBOX_SCHEMA_VERSION: "outbox:v1";
export declare const AUDIT_RETENTION_POLICY_VERSION: "audit-retention:v1";
export declare const AUDIT_CARDINALITY_LIMITS: {
    readonly affectedSubjects: 64;
    readonly affectedSubjectKeys: 64;
    readonly effects: 32;
    readonly monetaryEventIds: 32;
    readonly adminIssueIds: 32;
    readonly resultingRevisions: 64;
    readonly outboxIds: 32;
    readonly outboxObligationsPerCommand: 32;
    readonly explanationMaxBytes: 1024;
    readonly activityLogTargetBytes: number;
    readonly outboxObligationTargetBytes: number;
};
export declare const ACTIVITY_LOG_ACTOR_KINDS: readonly ["account", "guest_credential", "system", "provider"];
export type ActivityLogActorKind = (typeof ACTIVITY_LOG_ACTOR_KINDS)[number];
export declare const EXERCISED_CAPABILITIES: readonly ["account_owner", "parent_guardian", "administrator", "instructor", "system", "provider_callback", "guest"];
export type ExercisedCapability = (typeof EXERCISED_CAPABILITIES)[number];
export declare const COMMAND_SOURCES: readonly ["client_callable", "admin_callable", "guest_callable", "scheduler", "provider_callback", "system_reconciliation"];
export type CommandSource = (typeof COMMAND_SOURCES)[number];
export declare const AUDIT_EFFECT_KINDS: readonly ["payment_state_changed", "wallet_balance_changed", "booking_lifecycle_changed", "booking_schedule_changed", "booking_service_changed", "booking_party_changed", "course_enrollment_lifecycle_changed", "resource_claim_changed", "attendance_recorded", "admin_issue_opened", "admin_issue_resolved", "participant_access_changed", "audit_correction_recorded", "financial_correction_recorded", "outbox_obligation_created"];
export type AuditEffectKind = (typeof AUDIT_EFFECT_KINDS)[number];
export declare const FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS: readonly ["payment_state_changed", "wallet_balance_changed", "financial_correction_recorded"];
export type FinancialActivityLogEffectKind = (typeof FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS)[number];
export declare function financialActivityLogEffectSummaryDuplicatesMonetaryDetail(summary: string): boolean;
export declare const ActivityLogActorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"account">;
    actorKey: z.ZodString;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"guest_credential">;
    actorKey: z.ZodString;
    guestSubjectRef: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"system">;
    actorKey: z.ZodString;
    systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"system_actor">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"provider">;
    actorKey: z.ZodString;
    providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"provider">, string>>;
}, z.core.$strict>], "kind">;
export declare const ActivityLogReasonSchema: z.ZodObject<{
    registryVersion: z.ZodString;
    reasonCode: z.ZodString;
    explanation: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const ActivityLogPrimarySubjectSchema: z.ZodObject<{
    kind: z.ZodString;
    id: z.ZodString;
    subjectKey: z.ZodString;
}, z.core.$strict>;
export declare const ActivityLogEffectSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        payment_state_changed: "payment_state_changed";
        wallet_balance_changed: "wallet_balance_changed";
        booking_lifecycle_changed: "booking_lifecycle_changed";
        booking_schedule_changed: "booking_schedule_changed";
        booking_service_changed: "booking_service_changed";
        booking_party_changed: "booking_party_changed";
        course_enrollment_lifecycle_changed: "course_enrollment_lifecycle_changed";
        resource_claim_changed: "resource_claim_changed";
        attendance_recorded: "attendance_recorded";
        admin_issue_opened: "admin_issue_opened";
        admin_issue_resolved: "admin_issue_resolved";
        participant_access_changed: "participant_access_changed";
        audit_correction_recorded: "audit_correction_recorded";
        financial_correction_recorded: "financial_correction_recorded";
        outbox_obligation_created: "outbox_obligation_created";
    }>;
    subjectRef: z.ZodOptional<z.ZodType<import("./identifiers").CanonicalReference, unknown, z.core.$ZodTypeInternals<import("./identifiers").CanonicalReference, unknown>>>;
    summary: z.ZodString;
}, z.core.$strict>;
export declare const ActivityLogResultingRevisionSchema: z.ZodObject<{
    subject: z.ZodType<import("./identifiers").CanonicalReference, unknown, z.core.$ZodTypeInternals<import("./identifiers").CanonicalReference, unknown>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
}, z.core.$strict>;
export declare const ActivityLogSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"audit:v1">;
    activityLogId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"activity_log">, string>>;
    command: z.ZodObject<{
        commandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        kind: z.ZodString;
    }, z.core.$strict>;
    actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"account">;
        actorKey: z.ZodString;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"guest_credential">;
        actorKey: z.ZodString;
        guestSubjectRef: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"system">;
        actorKey: z.ZodString;
        systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"system_actor">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"provider">;
        actorKey: z.ZodString;
        providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"provider">, string>>;
    }, z.core.$strict>], "kind">;
    exercisedCapability: z.ZodEnum<{
        instructor: "instructor";
        guest: "guest";
        system: "system";
        account_owner: "account_owner";
        parent_guardian: "parent_guardian";
        administrator: "administrator";
        provider_callback: "provider_callback";
    }>;
    source: z.ZodEnum<{
        provider_callback: "provider_callback";
        client_callable: "client_callable";
        admin_callable: "admin_callable";
        guest_callable: "guest_callable";
        scheduler: "scheduler";
        system_reconciliation: "system_reconciliation";
    }>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"causation">, string>>>;
    decidedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    committedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reason: z.ZodObject<{
        registryVersion: z.ZodString;
        reasonCode: z.ZodString;
        explanation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    primarySubject: z.ZodObject<{
        kind: z.ZodString;
        id: z.ZodString;
        subjectKey: z.ZodString;
    }, z.core.$strict>;
    affectedSubjects: z.ZodArray<z.ZodType<import("./identifiers").CanonicalReference, unknown, z.core.$ZodTypeInternals<import("./identifiers").CanonicalReference, unknown>>>;
    affectedSubjectKeys: z.ZodArray<z.ZodString>;
    effects: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            payment_state_changed: "payment_state_changed";
            wallet_balance_changed: "wallet_balance_changed";
            booking_lifecycle_changed: "booking_lifecycle_changed";
            booking_schedule_changed: "booking_schedule_changed";
            booking_service_changed: "booking_service_changed";
            booking_party_changed: "booking_party_changed";
            course_enrollment_lifecycle_changed: "course_enrollment_lifecycle_changed";
            resource_claim_changed: "resource_claim_changed";
            attendance_recorded: "attendance_recorded";
            admin_issue_opened: "admin_issue_opened";
            admin_issue_resolved: "admin_issue_resolved";
            participant_access_changed: "participant_access_changed";
            audit_correction_recorded: "audit_correction_recorded";
            financial_correction_recorded: "financial_correction_recorded";
            outbox_obligation_created: "outbox_obligation_created";
        }>;
        subjectRef: z.ZodOptional<z.ZodType<import("./identifiers").CanonicalReference, unknown, z.core.$ZodTypeInternals<import("./identifiers").CanonicalReference, unknown>>>;
        summary: z.ZodString;
    }, z.core.$strict>>;
    monetaryEventIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"monetary_event">, string>>>;
    adminIssueIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"admin_issue">, string>>>;
    outboxIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"domain_outbox">, string>>>;
    resultingRevisions: z.ZodArray<z.ZodObject<{
        subject: z.ZodType<import("./identifiers").CanonicalReference, unknown, z.core.$ZodTypeInternals<import("./identifiers").CanonicalReference, unknown>>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    }, z.core.$strict>>;
    correctsActivityLogId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"activity_log">, string>>>;
    retentionPolicyVersion: z.ZodLiteral<"audit-retention:v1">;
}, z.core.$strict>;
export type ActivityLog = Readonly<z.output<typeof ActivityLogSchema>>;
export declare const OUTBOX_DELIVERY_CHANNELS: readonly ["email", "push", "sms", "in_app"];
export type OutboxDeliveryChannel = (typeof OUTBOX_DELIVERY_CHANNELS)[number];
export declare const OUTBOX_DELIVERY_STATUSES: readonly ["pending", "leased", "delivered", "dead_letter"];
export type OutboxDeliveryStatus = (typeof OUTBOX_DELIVERY_STATUSES)[number];
export declare const OutboxRecipientRefSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        account: "account";
        instructor: "instructor";
        participant: "participant";
        guest: "guest";
    }>;
    id: z.ZodString;
}, z.core.$strict>;
export declare const OutboxRenderInputSchema: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
export declare const DomainOutboxObligationSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"outbox:v1">;
    outboxId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"domain_outbox">, string>>;
    commandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
    activityLogId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"activity_log">, string>>;
    deliveryEffectOrdinal: z.ZodNumber;
    recipient: z.ZodObject<{
        kind: z.ZodEnum<{
            account: "account";
            instructor: "instructor";
            participant: "participant";
            guest: "guest";
        }>;
        id: z.ZodString;
    }, z.core.$strict>;
    channel: z.ZodEnum<{
        push: "push";
        email: "email";
        sms: "sms";
        in_app: "in_app";
    }>;
    templateId: z.ZodString;
    templateVersion: z.ZodString;
    renderInputs: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    deliverySemantics: z.ZodEnum<{
        transactional: "transactional";
        operational: "operational";
    }>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    delivery: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"pending">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"leased">;
        leasedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        leaseExpiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"delivered">;
        deliveredAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"dead_letter">;
        deadLetteredAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        lastErrorCode: z.ZodString;
    }, z.core.$strict>], "status">;
}, z.core.$strict>;
export type DomainOutboxObligation = Readonly<z.output<typeof DomainOutboxObligationSchema>>;
export declare const MutableAuditFieldNames: readonly ["updatedAt", "delivery", "leaseExpiresAt", "lastErrorCode"];
export declare const LegacyMutableActivityLogShapeSchema: z.ZodObject<{
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodOptional<z.ZodUnknown>;
    mutable: z.ZodOptional<z.ZodUnknown>;
    balanceUSD: z.ZodOptional<z.ZodUnknown>;
    paidAmount: z.ZodOptional<z.ZodUnknown>;
    refundedAmount: z.ZodOptional<z.ZodUnknown>;
    walletBalance: z.ZodOptional<z.ZodUnknown>;
    monetaryDeltas: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare function containsLegacyMutableActivityLogFields(input: unknown): boolean;
export declare function activityLogEnvelopeWithinLimits(record: ActivityLog): boolean;
export declare function outboxObligationCountWithinLimit(count: number): boolean;
export declare function activityLogLinksToCommand(record: Pick<ActivityLog, 'activityLogId' | 'command'>, commandId: CommandId): boolean;
export declare function serializedPayloadWithinTarget(bytes: number, targetBytes: number): boolean;
