import { z } from 'zod';
import {
  AccountIdSchema,
  ActivityLogIdSchema,
  AdminIssueIdSchema,
  CanonicalReferenceSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CausationIdSchema,
  DomainOutboxIdSchema,
  GuestSubjectIdSchema,
  MonetaryEventIdSchema,
  ProviderIdSchema,
  SystemActorIdSchema,
  type CommandId,
} from './identifiers';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  compareCanonicalTimestamps,
} from './primitives';
import { activityLogIdFromCommandId, domainOutboxIdFromCommand } from './deterministicIdentity';

export const AUDIT_SCHEMA_VERSION = 'audit:v1' as const;
export const OUTBOX_SCHEMA_VERSION = 'outbox:v1' as const;
export const AUDIT_RETENTION_POLICY_VERSION = 'audit-retention:v1' as const;

export const AUDIT_CARDINALITY_LIMITS = {
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
} as const;

export const ACTIVITY_LOG_ACTOR_KINDS = [
  'account',
  'guest_credential',
  'system',
  'provider',
] as const;
export type ActivityLogActorKind = (typeof ACTIVITY_LOG_ACTOR_KINDS)[number];

export const EXERCISED_CAPABILITIES = [
  'account_owner',
  'parent_guardian',
  'administrator',
  'instructor',
  'system',
  'provider_callback',
  'guest',
] as const;
export type ExercisedCapability = (typeof EXERCISED_CAPABILITIES)[number];

export const COMMAND_SOURCES = [
  'client_callable',
  'admin_callable',
  'guest_callable',
  'scheduler',
  'provider_callback',
  'system_reconciliation',
] as const;
export type CommandSource = (typeof COMMAND_SOURCES)[number];

export const AUDIT_EFFECT_KINDS = [
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
] as const;
export type AuditEffectKind = (typeof AUDIT_EFFECT_KINDS)[number];

export const FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS = [
  'payment_state_changed',
  'wallet_balance_changed',
  'financial_correction_recorded',
] as const satisfies readonly AuditEffectKind[];
export type FinancialActivityLogEffectKind = (typeof FINANCIAL_ACTIVITY_LOG_EFFECT_KINDS)[number];

const MONETARY_FIELD_ASSIGNMENT_IN_SUMMARY =
  /(?:balance|paidAmount|refundedAmount|retainedAmount|writtenOffAmount|outstandingAmount|settledAmount|minorUnits|price)\s*[:=]\s*\d/i;
const FINANCIAL_VERB_FOLLOWED_BY_AMOUNT =
  /\b(?:charged|refunded|paid|credited|debited|balance|owing|outstanding|settled|written[\s-]?off|amount)\s+\d[\d,]*/i;
const AMOUNT_WITH_CURRENCY_IN_SUMMARY =
  /\b\d[\d,]*\s+(?:KZT|kzt|₸|тенге)\b|\b(?:KZT|kzt|₸)\s+\d[\d,]*\b/i;

export function financialActivityLogEffectSummaryDuplicatesMonetaryDetail(
  summary: string
): boolean {
  return (
    MONETARY_FIELD_ASSIGNMENT_IN_SUMMARY.test(summary) ||
    FINANCIAL_VERB_FOLLOWED_BY_AMOUNT.test(summary) ||
    AMOUNT_WITH_CURRENCY_IN_SUMMARY.test(summary)
  );
}

export const ActivityLogActorSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('account'),
      actorKey: z.string().min(1).max(128),
      accountId: AccountIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('guest_credential'),
      actorKey: z.string().min(1).max(128),
      guestSubjectRef: GuestSubjectIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('system'),
      actorKey: z.string().min(1).max(128),
      systemActorId: SystemActorIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('provider'),
      actorKey: z.string().min(1).max(128),
      providerId: ProviderIdSchema,
    })
    .strict(),
]);

export const ActivityLogReasonSchema = z
  .object({
    registryVersion: z.string().min(1).max(32),
    reasonCode: z.string().min(1).max(64),
    explanation: z.string().max(AUDIT_CARDINALITY_LIMITS.explanationMaxBytes).optional(),
  })
  .strict();

export const ActivityLogPrimarySubjectSchema = z
  .object({
    kind: z.string().min(1).max(64),
    id: z.string().min(1).max(128),
    subjectKey: z.string().min(1).max(160),
  })
  .strict();

export const ActivityLogEffectSchema = z
  .object({
    kind: z.enum(AUDIT_EFFECT_KINDS),
    subjectRef: CanonicalReferenceSchema.optional(),
    summary: z.string().min(1).max(256),
  })
  .strict()
  .superRefine((effect, context) => {
    if (financialActivityLogEffectSummaryDuplicatesMonetaryDetail(effect.summary)) {
      context.addIssue({
        code: 'custom',
        path: ['summary'],
        message:
          'Activity Log effects must not embed monetary amounts, balances, or field values in summary text',
      });
    }
  });

export const ActivityLogResultingRevisionSchema = z
  .object({
    subject: CanonicalReferenceSchema,
    revision: AggregateRevisionSchema,
  })
  .strict();

export const ActivityLogSchema = z
  .object({
    schemaVersion: z.literal(AUDIT_SCHEMA_VERSION),
    activityLogId: ActivityLogIdSchema,
    command: z
      .object({
        commandId: CommandIdSchema,
        kind: z.string().min(1).max(64),
      })
      .strict(),
    actor: ActivityLogActorSchema,
    exercisedCapability: z.enum(EXERCISED_CAPABILITIES),
    source: z.enum(COMMAND_SOURCES),
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    decidedAt: CanonicalTimestampSchema,
    committedAt: CanonicalTimestampSchema,
    reason: ActivityLogReasonSchema,
    primarySubject: ActivityLogPrimarySubjectSchema,
    affectedSubjects: z
      .array(CanonicalReferenceSchema)
      .max(AUDIT_CARDINALITY_LIMITS.affectedSubjects),
    affectedSubjectKeys: z
      .array(z.string().min(1).max(160))
      .max(AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys),
    effects: z.array(ActivityLogEffectSchema).max(AUDIT_CARDINALITY_LIMITS.effects),
    monetaryEventIds: z.array(MonetaryEventIdSchema).max(AUDIT_CARDINALITY_LIMITS.monetaryEventIds),
    adminIssueIds: z.array(AdminIssueIdSchema).max(AUDIT_CARDINALITY_LIMITS.adminIssueIds),
    outboxIds: z.array(DomainOutboxIdSchema).max(AUDIT_CARDINALITY_LIMITS.outboxIds),
    resultingRevisions: z
      .array(ActivityLogResultingRevisionSchema)
      .max(AUDIT_CARDINALITY_LIMITS.resultingRevisions),
    correctsActivityLogId: ActivityLogIdSchema.optional(),
    retentionPolicyVersion: z.literal(AUDIT_RETENTION_POLICY_VERSION),
  })
  .strict()
  .superRefine((record, context) => {
    const expectedActivityLogId = activityLogIdFromCommandId(record.command.commandId);
    if (record.activityLogId !== expectedActivityLogId) {
      context.addIssue({
        code: 'custom',
        path: ['activityLogId'],
        message: 'activityLogId must be derived from commandId',
      });
    }

    if (compareCanonicalTimestamps(record.committedAt, record.decidedAt) < 0) {
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

    if (record.outboxIds.length > AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
      context.addIssue({
        code: 'custom',
        path: ['outboxIds'],
        message: 'outboxIds exceed the per-command obligation limit',
      });
    }
  });

export type ActivityLog = Readonly<z.output<typeof ActivityLogSchema>>;

export const OUTBOX_DELIVERY_CHANNELS = ['email', 'push', 'sms', 'in_app'] as const;
export type OutboxDeliveryChannel = (typeof OUTBOX_DELIVERY_CHANNELS)[number];

export const OUTBOX_DELIVERY_STATUSES = ['pending', 'leased', 'delivered', 'dead_letter'] as const;
export type OutboxDeliveryStatus = (typeof OUTBOX_DELIVERY_STATUSES)[number];

export const OutboxRecipientRefSchema = z
  .object({
    kind: z.enum(['account', 'participant', 'instructor', 'guest']),
    id: z.string().min(1).max(128),
  })
  .strict();

export const OutboxRenderInputSchema = z
  .record(z.string(), z.union([z.string().max(512), z.number().finite(), z.boolean()]))
  .refine((value) => Object.keys(value).length <= 32, 'Render inputs are bounded');

export const DomainOutboxObligationSchema = z
  .object({
    schemaVersion: z.literal(OUTBOX_SCHEMA_VERSION),
    outboxId: DomainOutboxIdSchema,
    commandId: CommandIdSchema,
    activityLogId: ActivityLogIdSchema,
    deliveryEffectOrdinal: z.number().finite().int().min(0).max(31),
    recipient: OutboxRecipientRefSchema,
    channel: z.enum(OUTBOX_DELIVERY_CHANNELS),
    templateId: z.string().min(1).max(64),
    templateVersion: z.string().min(1).max(32),
    renderInputs: OutboxRenderInputSchema,
    deliverySemantics: z.enum(['transactional', 'operational']),
    createdAt: CanonicalTimestampSchema,
    delivery: z.discriminatedUnion('status', [
      z.object({ status: z.literal('pending') }).strict(),
      z
        .object({
          status: z.literal('leased'),
          leasedAt: CanonicalTimestampSchema,
          leaseExpiresAt: CanonicalTimestampSchema,
        })
        .strict(),
      z
        .object({
          status: z.literal('delivered'),
          deliveredAt: CanonicalTimestampSchema,
        })
        .strict(),
      z
        .object({
          status: z.literal('dead_letter'),
          deadLetteredAt: CanonicalTimestampSchema,
          lastErrorCode: z.string().min(1).max(64),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((obligation, context) => {
    const expectedActivityLogId = activityLogIdFromCommandId(obligation.commandId);
    if (obligation.activityLogId !== expectedActivityLogId) {
      context.addIssue({
        code: 'custom',
        path: ['activityLogId'],
        message: 'activityLogId must match the origin command',
      });
    }

    const expectedOutboxId = domainOutboxIdFromCommand(
      obligation.commandId,
      obligation.deliveryEffectOrdinal
    );
    if (obligation.outboxId !== expectedOutboxId) {
      context.addIssue({
        code: 'custom',
        path: ['outboxId'],
        message: 'outboxId must be derived from commandId and deliveryEffectOrdinal',
      });
    }

    if (obligation.deliveryEffectOrdinal >= AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand) {
      context.addIssue({
        code: 'custom',
        path: ['deliveryEffectOrdinal'],
        message: 'deliveryEffectOrdinal exceeds the per-command outbox limit',
      });
    }
  });

export type DomainOutboxObligation = Readonly<z.output<typeof DomainOutboxObligationSchema>>;

export const MutableAuditFieldNames = [
  'updatedAt',
  'delivery',
  'leaseExpiresAt',
  'lastErrorCode',
] as const;

export const LegacyMutableActivityLogShapeSchema = z
  .object({
    updatedAt: z.unknown().optional(),
    updatedBy: z.unknown().optional(),
    mutable: z.unknown().optional(),
    balanceUSD: z.unknown().optional(),
    paidAmount: z.unknown().optional(),
    refundedAmount: z.unknown().optional(),
    walletBalance: z.unknown().optional(),
    monetaryDeltas: z.unknown().optional(),
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
    ] as const) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Legacy or mutable Activity Log field is not canonical',
        });
      }
    }
  });

export function containsLegacyMutableActivityLogFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
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

export function activityLogEnvelopeWithinLimits(record: ActivityLog): boolean {
  return (
    record.affectedSubjects.length <= AUDIT_CARDINALITY_LIMITS.affectedSubjects &&
    record.affectedSubjectKeys.length <= AUDIT_CARDINALITY_LIMITS.affectedSubjectKeys &&
    record.effects.length <= AUDIT_CARDINALITY_LIMITS.effects &&
    record.monetaryEventIds.length <= AUDIT_CARDINALITY_LIMITS.monetaryEventIds &&
    record.adminIssueIds.length <= AUDIT_CARDINALITY_LIMITS.adminIssueIds &&
    record.outboxIds.length <= AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand &&
    record.resultingRevisions.length <= AUDIT_CARDINALITY_LIMITS.resultingRevisions
  );
}

export function outboxObligationCountWithinLimit(count: number): boolean {
  return count >= 0 && count <= AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand;
}

export function activityLogLinksToCommand(
  record: Pick<ActivityLog, 'activityLogId' | 'command'>,
  commandId: CommandId
): boolean {
  return (
    record.command.commandId === commandId &&
    record.activityLogId === activityLogIdFromCommandId(commandId)
  );
}

export function serializedPayloadWithinTarget(bytes: number, targetBytes: number): boolean {
  return bytes > 0 && bytes <= targetBytes;
}
