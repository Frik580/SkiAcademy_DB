import { z } from 'zod';
import { type ActivityLog, type AuditEffectKind, type DomainOutboxObligation, type OutboxDeliveryChannel } from './auditOutbox';
import { OutboxRecipientRefSchema } from './auditOutbox';
import { type AuditReasonInput } from './auditReasonRegistry';
import type { CommandEnvelope } from './commands/commandEnvelope';
import type { CommandActor } from './commands/actors';
import { CanonicalCommandError } from './errors';
import type { ActivityLogId, AdminIssueId, CanonicalReference, CommandId, CorrelationId, DomainOutboxId, MonetaryEventId } from './identifiers';
import { type AggregateRevision, type CanonicalTimestamp } from './primitives';
import { type TransactionPlanBuilder } from './transactions/transactionPlan';
export interface ActivityLogEffectInput {
    readonly kind: AuditEffectKind;
    readonly subjectRef?: CanonicalReference;
    readonly summary: string;
}
export interface ActivityLogResultingRevisionInput {
    readonly subject: CanonicalReference;
    readonly revision: AggregateRevision;
}
export interface ActivityLogEnvelopeInput {
    readonly reason: AuditReasonInput;
    readonly primarySubject: {
        readonly kind: string;
        readonly id: string;
        readonly subjectKey: string;
    };
    readonly affectedSubjects: readonly CanonicalReference[];
    readonly effects: readonly ActivityLogEffectInput[];
    readonly monetaryEventIds: readonly MonetaryEventId[];
    readonly adminIssueIds: readonly AdminIssueId[];
    readonly resultingRevisions: readonly ActivityLogResultingRevisionInput[];
    readonly correctsActivityLogId?: ActivityLogId;
}
export interface OutboxObligationDraft {
    readonly deliveryEffectOrdinal: number;
    readonly recipient: z.output<typeof OutboxRecipientRefSchema>;
    readonly channel: OutboxDeliveryChannel;
    readonly templateId: string;
    readonly templateVersion: string;
    readonly renderInputs: Record<string, string | number | boolean>;
    readonly deliverySemantics: 'transactional' | 'operational';
}
export interface AuditOutboxStagingPlan {
    readonly activityLog: ActivityLogEnvelopeInput;
    readonly outboxObligations: readonly OutboxObligationDraft[];
}
export declare function activityLogActorKeyFromCommandActor(actor: CommandActor): string;
export declare function buildActivityLogActorFromCommandActor(actor: CommandActor): ActivityLog['actor'];
export declare function deriveAffectedSubjectKeys(subjects: readonly CanonicalReference[]): string[];
export declare function validateActorCapabilitySeparation(correlationId: CorrelationId, actor: CommandActor, exercisedCapability: CommandEnvelope['context']['exercisedCapability']): void;
export declare function estimateUtf8JsonBytes(value: unknown): number;
export declare function assertActivityLogPayloadWithinTarget(record: ActivityLog): void;
export declare function assertOutboxPayloadsWithinTarget(obligations: readonly DomainOutboxObligation[]): void;
export declare function validateAuditOutboxStagingPlan(envelope: CommandEnvelope, plan: AuditOutboxStagingPlan): void;
export declare function buildOutboxIdsFromDrafts(commandId: CommandId, drafts: readonly OutboxObligationDraft[]): DomainOutboxId[];
export declare function buildActivityLogRecord(input: {
    envelope: CommandEnvelope;
    commandId: CommandId;
    decidedAt: CanonicalTimestamp;
    committedAt: CanonicalTimestamp;
    plan: ActivityLogEnvelopeInput;
    outboxIds: readonly DomainOutboxId[];
}): ActivityLog;
export declare function buildOutboxObligationRecords(input: {
    commandId: CommandId;
    activityLogId: ActivityLogId;
    createdAt: CanonicalTimestamp;
    drafts: readonly OutboxObligationDraft[];
}): DomainOutboxObligation[];
export declare function canonicalFirestoreRecordsEquivalent(existing: Record<string, unknown>, expected: Record<string, unknown>): boolean;
export declare function parseStoredActivityLog(data: Record<string, unknown> | undefined): ActivityLog | undefined;
export declare function parseStoredOutboxObligation(data: Record<string, unknown> | undefined): DomainOutboxObligation | undefined;
export declare function auditIntegrityViolation(correlationId: CorrelationId): CanonicalCommandError;
export declare function planAuditOutboxStagingContributions(builder: TransactionPlanBuilder, input: {
    activityLogPath: string;
    outboxObligationPaths: readonly string[];
}): void;
export declare function resolveAuditOutboxPaths(commandId: CommandId, deliveryEffectOrdinals: readonly number[]): {
    activityLogPath: string;
    outboxPaths: string[];
};
export declare function emptyAuditOutboxStagingPlan(reasonCode?: AuditReasonInput['reasonCode']): AuditOutboxStagingPlan;
export declare function committedAtTimestampFromClock(clock: {
    committedAt(): Date;
}): CanonicalTimestamp;
