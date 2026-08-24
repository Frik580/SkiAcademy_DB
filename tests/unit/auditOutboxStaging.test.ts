import { describe, expect, it } from 'vitest';
import {
  AUDIT_CARDINALITY_LIMITS,
  ActivityLogSchema,
  accountCommandActor,
  activityLogIdFromCommandId,
  buildActivityLogActorFromCommandActor,
  buildActivityLogRecord,
  buildOutboxIdsFromDrafts,
  buildOutboxObligationRecords,
  canonicalFirestoreRecordsEquivalent,
  canonicalReference,
  CanonicalCommandError,
  CorrelationIdSchema,
  deriveCommandKey,
  domainOutboxIdFromCommand,
  encodeCommandActorScope,
  estimateUtf8JsonBytes,
  financialActivityLogEffectSummaryDuplicatesMonetaryDetail,
  resolveAuditOutboxPaths,
  systemCommandActor,
  timestampFromDate,
  validateActorCapabilitySeparation,
  validateAuditOutboxStagingPlan,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { canonicalPaymentWalletAuditFixtures } from '@ski-academy/shared-domain/testing';

const correlationId = CorrelationIdSchema.parse('correlation_audit_staging_unit_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const committedAt = timestampFromDate(new Date('2026-01-01T00:00:01.000Z'));

function completeBookingEnvelope(
  idempotencyKey = 'audit-staging-01'
): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor('account_audit_staging_01'),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: { bookingId: 'booking_audit_staging_01' },
  };
}

function completeBookingPlan(): AuditOutboxStagingPlan {
  return {
    activityLog: {
      reason: { registryVersion: 'reason:v1', reasonCode: 'self_service_completion' },
      primarySubject: {
        kind: 'booking',
        id: 'booking_audit_staging_01',
        subjectKey: 'booking:booking_audit_staging_01',
      },
      affectedSubjects: [canonicalReference('booking', 'booking_audit_staging_01')],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: canonicalReference('booking', 'booking_audit_staging_01'),
          summary: 'Booking marked completed',
        },
      ],
      monetaryEventIds: [canonicalPaymentWalletAuditFixtures.monetaryEvent.eventId],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: canonicalReference('booking', 'booking_audit_staging_01'),
          revision: 2,
        },
      ],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: 'account_audit_staging_01' },
        channel: 'in_app',
        templateId: 'booking_completed',
        templateVersion: 'v1',
        renderInputs: { bookingId: 'booking_audit_staging_01' },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

describe('audit outbox staging contracts', () => {
  it('derives deterministic Activity Log and outbox identities from commandId', () => {
    const envelope = completeBookingEnvelope();
    const actorScope = encodeCommandActorScope(envelope.context.actor);
    const commandId = deriveCommandKey(actorScope, envelope.context.idempotencyKey);

    expect(activityLogIdFromCommandId(commandId)).toBe(activityLogIdFromCommandId(commandId));
    expect(domainOutboxIdFromCommand(commandId, 0)).toBe(domainOutboxIdFromCommand(commandId, 0));

    const paths = resolveAuditOutboxPaths(commandId, [0]);
    expect(paths.activityLogPath).toBe(`/activity_logs/${activityLogIdFromCommandId(commandId)}`);
    expect(paths.outboxPaths[0]).toBe(`/domain_outbox/${domainOutboxIdFromCommand(commandId, 0)}`);
  });

  it('separates actor identity from exercised capability', () => {
    const actor = buildActivityLogActorFromCommandActor(
      systemCommandActor('system.resolveOutcome')
    );
    expect(actor.kind).toBe('system');
    expect(actor.actorKey).toBe('system:system.resolveOutcome');

    expect(() =>
      validateActorCapabilitySeparation(
        correlationId,
        systemCommandActor('system.resolveOutcome'),
        'administrator'
      )
    ).toThrow(CanonicalCommandError);
  });

  it('allows monetaryEventIds references without duplicating monetary amounts in effects', () => {
    const envelope = completeBookingEnvelope();
    const actorScope = encodeCommandActorScope(envelope.context.actor);
    const commandId = deriveCommandKey(actorScope, envelope.context.idempotencyKey);
    const plan = completeBookingPlan();
    const outboxIds = buildOutboxIdsFromDrafts(commandId, plan.outboxObligations);

    const record = buildActivityLogRecord({
      envelope,
      commandId,
      decidedAt,
      committedAt,
      plan: plan.activityLog,
      outboxIds,
    });

    expect(record.monetaryEventIds).toHaveLength(1);
    expect(ActivityLogSchema.safeParse(record).success).toBe(true);
    expect(financialActivityLogEffectSummaryDuplicatesMonetaryDetail('charged 100000 KZT')).toBe(
      true
    );
  });

  it('rejects oversized envelope limits before writes', () => {
    const envelope = completeBookingEnvelope('oversized-envelope');
    const oversizedPlan: AuditOutboxStagingPlan = {
      ...completeBookingPlan(),
      activityLog: {
        ...completeBookingPlan().activityLog,
        effects: Array.from({ length: AUDIT_CARDINALITY_LIMITS.effects + 1 }, (_, index) => ({
          kind: 'booking_lifecycle_changed' as const,
          summary: `effect ${index}`,
        })),
      },
    };

    expect(() => validateAuditOutboxStagingPlan(envelope, oversizedPlan)).toThrow(
      expect.objectContaining({ code: 'operation_too_large' })
    );
  });

  it('rejects 33 outbox obligations with operation_too_large', () => {
    const envelope = completeBookingEnvelope('oversized-outbox');
    const oversizedPlan: AuditOutboxStagingPlan = {
      activityLog: {
        reason: { registryVersion: 'reason:v1', reasonCode: 'self_service_completion' },
        primarySubject: {
          kind: 'booking',
          id: 'booking_audit_staging_01',
          subjectKey: 'booking:booking_audit_staging_01',
        },
        affectedSubjects: [],
        effects: [],
        monetaryEventIds: [],
        adminIssueIds: [],
        resultingRevisions: [],
      },
      outboxObligations: Array.from({ length: 33 }, (_, ordinal) => ({
        deliveryEffectOrdinal: ordinal,
        recipient: { kind: 'account', id: 'account_audit_staging_01' },
        channel: 'in_app' as const,
        templateId: 'booking_completed',
        templateVersion: 'v1',
        renderInputs: { ordinal },
        deliverySemantics: 'transactional' as const,
      })),
    };

    expect(() => validateAuditOutboxStagingPlan(envelope, oversizedPlan)).toThrow(
      expect.objectContaining({ code: 'operation_too_large' })
    );
  });

  it('maps audit_integrity_violation to internal transport', () => {
    const error = new CanonicalCommandError('audit_integrity_violation', { correlationId });
    expect(error.toTransport().code).toBe('internal');
    expect(error.code).toBe('audit_integrity_violation');
  });

  it('detects incompatible canonical record collisions', () => {
    const envelope = completeBookingEnvelope();
    const actorScope = encodeCommandActorScope(envelope.context.actor);
    const commandId = deriveCommandKey(actorScope, envelope.context.idempotencyKey);
    const plan = completeBookingPlan();
    const outboxIds = buildOutboxIdsFromDrafts(commandId, plan.outboxObligations);

    const expected = buildActivityLogRecord({
      envelope,
      commandId,
      decidedAt,
      committedAt,
      plan: plan.activityLog,
      outboxIds,
    });

    const incompatible = { ...expected, correlationId: 'correlation_other' };
    expect(canonicalFirestoreRecordsEquivalent(expected, incompatible)).toBe(false);
    expect(canonicalFirestoreRecordsEquivalent(expected, expected)).toBe(true);
  });

  it('builds immutable outbox obligations with pending delivery state only', () => {
    const envelope = completeBookingEnvelope();
    const actorScope = encodeCommandActorScope(envelope.context.actor);
    const commandId = deriveCommandKey(actorScope, envelope.context.idempotencyKey);
    const plan = completeBookingPlan();

    const obligations = buildOutboxObligationRecords({
      commandId,
      activityLogId: activityLogIdFromCommandId(commandId),
      createdAt: decidedAt,
      drafts: plan.outboxObligations,
    });

    expect(obligations).toHaveLength(1);
    expect(obligations[0].delivery.status).toBe('pending');
    expect(obligations[0].outboxId).toBe(domainOutboxIdFromCommand(commandId, 0));
  });

  it('estimates Activity Log payload within target for representative fixture', () => {
    const fixture = canonicalPaymentWalletAuditFixtures.activityLog;
    expect(estimateUtf8JsonBytes(fixture) <= AUDIT_CARDINALITY_LIMITS.activityLogTargetBytes).toBe(
      true
    );
  });
});
