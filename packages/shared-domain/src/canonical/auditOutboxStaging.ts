import { canonicalJsonStringify } from './canonicalJson';
import { z } from 'zod';
import {
  AUDIT_CARDINALITY_LIMITS,
  AUDIT_RETENTION_POLICY_VERSION,
  AUDIT_SCHEMA_VERSION,
  ActivityLogSchema,
  DomainOutboxObligationSchema,
  OUTBOX_SCHEMA_VERSION,
  containsLegacyMutableActivityLogFields,
  type ActivityLog,
  type AuditEffectKind,
  type DomainOutboxObligation,
  type OutboxDeliveryChannel,
} from './auditOutbox';
import { OutboxRecipientRefSchema } from './auditOutbox';
import { validateAuditEffectsForCommand } from './auditEffectRegistry';
import { validateAuditReason, type AuditReasonInput } from './auditReasonRegistry';
import { isCapabilityAllowedForActorKind } from './commands/capabilities';
import type { CommandEnvelope } from './commands/commandEnvelope';
import type { CommandActor } from './commands/actors';
import { activityLogIdFromCommandId, domainOutboxIdFromCommand } from './deterministicIdentity';
import { CanonicalCommandError } from './errors';
import { normalizeFirestoreDocument } from './firestoreSerialization';
import type {
  ActivityLogId,
  AdminIssueId,
  CanonicalReference,
  CommandId,
  CorrelationId,
  DomainOutboxId,
  MonetaryEventId,
} from './identifiers';
import { canonicalPaths } from './paths';
import { type AggregateRevision, type CanonicalTimestamp, timestampFromDate } from './primitives';
import {
  planAuditOutboxContributions,
  type TransactionPlanBuilder,
} from './transactions/transactionPlan';

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

export function activityLogActorKeyFromCommandActor(actor: CommandActor): string {
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

export function buildActivityLogActorFromCommandActor(actor: CommandActor): ActivityLog['actor'] {
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

export function deriveAffectedSubjectKeys(subjects: readonly CanonicalReference[]): string[] {
  const keys = subjects.map((subject) => `${subject.kind}:${subject.id}`);
  return [...new Set(keys)];
}

export function validateActorCapabilitySeparation(
  correlationId: CorrelationId,
  actor: CommandActor,
  exercisedCapability: CommandEnvelope['context']['exercisedCapability']
): void {
  if (!isCapabilityAllowedForActorKind(actor.kind, exercisedCapability)) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'conflict', field: 'exercisedCapability' },
    });
  }

  if (actor.kind === 'system' && exercisedCapability === 'administrator') {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'conflict', field: 'exercisedCapability' },
    });
  }
}

export function estimateUtf8JsonBytes(value: unknown): number {
  return new TextEncoder().encode(canonicalJsonStringify(value)).length;
}

export function assertActivityLogPayloadWithinTarget(record: ActivityLog): void {
  const bytes = estimateUtf8JsonBytes(record);
  if (bytes > AUDIT_CARDINALITY_LIMITS.activityLogTargetBytes) {
    throw new Error('Activity Log payload exceeds target size');
  }
}

export function assertOutboxPayloadsWithinTarget(
  obligations: readonly DomainOutboxObligation[]
): void {
  for (const obligation of obligations) {
    const bytes = estimateUtf8JsonBytes(obligation);
    if (bytes > AUDIT_CARDINALITY_LIMITS.outboxObligationTargetBytes) {
      throw new Error('Outbox obligation payload exceeds target size');
    }
  }
}

export function validateAuditOutboxStagingPlan(
  envelope: CommandEnvelope,
  plan: AuditOutboxStagingPlan
): void {
  const correlationId = envelope.context.correlationId;
  validateActorCapabilitySeparation(
    correlationId,
    envelope.context.actor,
    envelope.context.exercisedCapability
  );
  validateAuditReason(correlationId, envelope.kind, plan.activityLog.reason);
  validateAuditEffectsForCommand(correlationId, envelope.kind, plan.activityLog.effects);

  if (plan.outboxObligations.length > AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
    throw new CanonicalCommandError('operation_too_large', {
      correlationId,
      details: { reason: 'out_of_range' },
    });
  }

  if (containsLegacyMutableActivityLogFields(plan.activityLog)) {
    throw new CanonicalCommandError('validation', {
      correlationId,
      details: { reason: 'malformed', field: 'activityLog' },
    });
  }

  const envelopeLimits = [
    plan.activityLog.affectedSubjects.length <= AUDIT_CARDINALITY_LIMITS.affectedSubjects,
    plan.activityLog.effects.length <= AUDIT_CARDINALITY_LIMITS.effects,
    plan.activityLog.monetaryEventIds.length <= AUDIT_CARDINALITY_LIMITS.monetaryEventIds,
    plan.activityLog.adminIssueIds.length <= AUDIT_CARDINALITY_LIMITS.adminIssueIds,
    plan.activityLog.resultingRevisions.length <= AUDIT_CARDINALITY_LIMITS.resultingRevisions,
  ];
  if (!envelopeLimits.every(Boolean)) {
    throw new CanonicalCommandError('operation_too_large', {
      correlationId,
      details: { reason: 'out_of_range' },
    });
  }

  const affectedSubjectKeys = deriveAffectedSubjectKeys(plan.activityLog.affectedSubjects);
  if (affectedSubjectKeys.length > AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys) {
    throw new CanonicalCommandError('operation_too_large', {
      correlationId,
      details: { reason: 'out_of_range' },
    });
  }

  const ordinals = new Set<number>();
  for (const obligation of plan.outboxObligations) {
    if (ordinals.has(obligation.deliveryEffectOrdinal)) {
      throw new CanonicalCommandError('validation', {
        correlationId,
        details: { reason: 'conflict', field: 'outboxObligations.deliveryEffectOrdinal' },
      });
    }
    ordinals.add(obligation.deliveryEffectOrdinal);
  }
}

export function buildOutboxIdsFromDrafts(
  commandId: CommandId,
  drafts: readonly OutboxObligationDraft[]
): DomainOutboxId[] {
  return drafts.map((draft) => domainOutboxIdFromCommand(commandId, draft.deliveryEffectOrdinal));
}

export function buildActivityLogRecord(input: {
  envelope: CommandEnvelope;
  commandId: CommandId;
  decidedAt: CanonicalTimestamp;
  committedAt: CanonicalTimestamp;
  plan: ActivityLogEnvelopeInput;
  outboxIds: readonly DomainOutboxId[];
}): ActivityLog {
  const activityLogId = activityLogIdFromCommandId(input.commandId);
  const affectedSubjectKeys = deriveAffectedSubjectKeys(input.plan.affectedSubjects);

  const record = ActivityLogSchema.parse({
    schemaVersion: AUDIT_SCHEMA_VERSION,
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
    retentionPolicyVersion: AUDIT_RETENTION_POLICY_VERSION,
  });

  assertActivityLogPayloadWithinTarget(record);
  return record;
}

export function buildOutboxObligationRecords(input: {
  commandId: CommandId;
  activityLogId: ActivityLogId;
  createdAt: CanonicalTimestamp;
  drafts: readonly OutboxObligationDraft[];
}): DomainOutboxObligation[] {
  const obligations = input.drafts.map((draft) =>
    DomainOutboxObligationSchema.parse({
      schemaVersion: OUTBOX_SCHEMA_VERSION,
      outboxId: domainOutboxIdFromCommand(input.commandId, draft.deliveryEffectOrdinal),
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
    })
  );

  assertOutboxPayloadsWithinTarget(obligations);
  return obligations;
}

export function canonicalFirestoreRecordsEquivalent(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean {
  const normalizedExisting = normalizeFirestoreDocument(existing);
  const normalizedExpected = normalizeFirestoreDocument(expected);
  if (!normalizedExisting || !normalizedExpected) {
    return false;
  }
  return canonicalJsonStringify(normalizedExisting) === canonicalJsonStringify(normalizedExpected);
}

export function parseStoredActivityLog(
  data: Record<string, unknown> | undefined
): ActivityLog | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) {
    return undefined;
  }
  const parsed = ActivityLogSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseStoredOutboxObligation(
  data: Record<string, unknown> | undefined
): DomainOutboxObligation | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) {
    return undefined;
  }
  const parsed = DomainOutboxObligationSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function auditIntegrityViolation(correlationId: CorrelationId): CanonicalCommandError {
  return new CanonicalCommandError('audit_integrity_violation', { correlationId });
}

export function planAuditOutboxStagingContributions(
  builder: TransactionPlanBuilder,
  input: {
    activityLogPath: string;
    outboxObligationPaths: readonly string[];
  }
): void {
  planAuditOutboxContributions(builder, {
    activityLogPath: input.activityLogPath,
    outboxObligationCount: input.outboxObligationPaths.length,
  });
}

export function resolveAuditOutboxPaths(
  commandId: CommandId,
  deliveryEffectOrdinals: readonly number[]
): {
  activityLogPath: string;
  outboxPaths: string[];
} {
  const activityLogPath = canonicalPaths.activityLog(activityLogIdFromCommandId(commandId));
  const outboxPaths = deliveryEffectOrdinals.map((ordinal) =>
    canonicalPaths.domainOutbox(domainOutboxIdFromCommand(commandId, ordinal))
  );
  return { activityLogPath, outboxPaths };
}

export function emptyAuditOutboxStagingPlan(
  reasonCode: AuditReasonInput['reasonCode'] = 'scheduled_system_action'
): AuditOutboxStagingPlan {
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

export function committedAtTimestampFromClock(clock: { committedAt(): Date }): CanonicalTimestamp {
  return timestampFromDate(clock.committedAt());
}
