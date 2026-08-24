import { describe, expect, it } from 'vitest';
import {
  accountCommandActor,
  AggregateRevisionSchema,
  activityLogIdFromCommandId,
  AUDIT_CARDINALITY_LIMITS,
  BookingIdSchema,
  canonicalReference,
  CanonicalCommandError,
  commandErrorResult,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  domainOutboxIdFromCommand,
  resolveCommandIdempotencyIdentity,
  systemCommandActor,
  timestampFromDate,
  TRANSACTION_PLANNING_FIXTURES,
  evaluateTransactionPreflight,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { executeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_audit_fn_01');
const accountId = AccountIdSchema.parse('account_audit_fn_01');
const bookingId = BookingIdSchema.parse('booking_audit_fn_01');
const bookingPath = `bookings/${bookingId}`;

function envelope(idempotencyKey = 'audit-fn-01'): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: { bookingId },
  };
}

function environment(at: string, committedAtOffsetMs = 1000) {
  return {
    clock: createAuthoritativeCommandClock(new Date(at), { committedAtOffsetMs }),
  };
}

function auditPlan(): AuditOutboxStagingPlan {
  return {
    activityLog: {
      reason: { registryVersion: 'reason:v1', reasonCode: 'self_service_completion' },
      primarySubject: {
        kind: 'booking',
        id: bookingId,
        subjectKey: `booking:${bookingId}`,
      },
      affectedSubjects: [canonicalReference('booking', bookingId)],
      effects: [
        {
          kind: 'booking_lifecycle_changed',
          subjectRef: canonicalReference('booking', bookingId),
          summary: 'Booking marked completed',
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [{ subject: canonicalReference('booking', bookingId), revision: 2 }],
    },
    outboxObligations: [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: accountId },
        channel: 'in_app',
        templateId: 'booking_completed',
        templateVersion: 'v1',
        renderInputs: { bookingId },
        deliverySemantics: 'transactional',
      },
    ],
  };
}

function auditedHandler(onExecute?: () => void): {
  planAuditOutbox: () => Promise<AuditOutboxStagingPlan>;
  execute: (
    session: Parameters<
      NonNullable<Parameters<typeof executeIdempotentCanonicalCommand>[0]['handler']['execute']>
    >[0],
    context: Parameters<
      NonNullable<Parameters<typeof executeIdempotentCanonicalCommand>[0]['handler']['execute']>
    >[1]
  ) => Promise<CommandResult<'complete_booking'>>;
} {
  return {
    planAuditOutbox: async () => auditPlan(),
    execute: async (session, context) => {
      onExecute?.();
      session.tx.update(
        { path: bookingPath },
        { revision: context.nextRevision(AggregateRevisionSchema.parse(1)), status: 'completed' }
      );
      return commandSuccessResult('complete_booking', correlationId);
    },
  };
}

describe('audited idempotent command execution', () => {
  it('stages exactly one Activity Log for a successful state-changing command', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-one-log-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: auditedHandler(),
    });

    const identity = resolveCommandIdempotencyIdentity(envelope('audit-one-log-01'));
    const activityLogPath = `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`;
    const snapshot = executor.snapshot();

    expect(snapshot.docs.has(activityLogPath)).toBe(true);
    expect(snapshot.docs.get(activityLogPath)?.data.command.commandId).toBe(identity.commandKey);
    expect(snapshot.docs.get(activityLogPath)?.data.actor.accountId).toBe(accountId);
    expect(snapshot.docs.get(activityLogPath)?.data.exercisedCapability).toBe('account_owner');
  });

  it('does not create Activity Log or outbox on rejected commands', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const rejected = await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-reject-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        planAuditOutbox: async () => auditPlan(),
        execute: async () =>
          commandErrorResult(
            'complete_booking',
            correlationId,
            new CanonicalCommandError('forbidden', { correlationId }).toTransport()
          ),
      },
    });

    expect(rejected.status).toBe('error');
    const identity = resolveCommandIdempotencyIdentity(envelope('audit-reject-01'));
    const activityLogPath = `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`;
    expect(executor.snapshot().docs.has(activityLogPath)).toBe(false);
  });

  it('replays without duplicating Activity Log or outbox obligations', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });
    let executeCalls = 0;

    const handler = auditedHandler(() => {
      executeCalls += 1;
    });

    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-replay-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler,
    });
    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-replay-01'),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler,
    });

    expect(executeCalls).toBe(1);

    const identity = resolveCommandIdempotencyIdentity(envelope('audit-replay-01'));
    const outboxPath = `domain_outbox/${domainOutboxIdFromCommand(identity.commandKey, 0)}`;
    const snapshot = executor.snapshot();
    expect(snapshot.docs.has(outboxPath)).toBe(true);
    expect(snapshot.writesAttempted).toBeGreaterThan(0);
  });

  it('fails atomically on incompatible Activity Log collision without domain writes', async () => {
    const identity = resolveCommandIdempotencyIdentity(envelope('audit-collision-01'));
    const activityLogPath = `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`;

    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
      [activityLogPath]: {
        schemaVersion: 'audit:v1',
        activityLogId: activityLogIdFromCommandId(identity.commandKey),
        command: { commandId: identity.commandKey, kind: 'complete_booking' },
        actor: {
          kind: 'account',
          actorKey: `account:${accountId}`,
          accountId,
        },
        exercisedCapability: 'account_owner',
        source: 'client_callable',
        correlationId: CorrelationIdSchema.parse('correlation_audit_collision_02'),
        decidedAt: timestampFromDate(new Date('2025-01-01T00:00:00.000Z')),
        committedAt: timestampFromDate(new Date('2025-01-01T00:00:01.000Z')),
        reason: { registryVersion: 'reason:v1', reasonCode: 'self_service_completion' },
        primarySubject: {
          kind: 'booking',
          id: bookingId,
          subjectKey: `booking:${bookingId}`,
        },
        affectedSubjects: [],
        affectedSubjectKeys: [],
        effects: [],
        monetaryEventIds: [],
        adminIssueIds: [],
        outboxIds: [],
        resultingRevisions: [],
        retentionPolicyVersion: 'audit-retention:v1',
      },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-collision-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: auditedHandler(),
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('internal');
    }
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(1);
  });

  it('rolls back domain writes when outbox staging would collide', async () => {
    const identity = resolveCommandIdempotencyIdentity(envelope('audit-outbox-collision-01'));
    const outboxPath = `domain_outbox/${domainOutboxIdFromCommand(identity.commandKey, 0)}`;

    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
      [outboxPath]: {
        schemaVersion: 'outbox:v1',
        outboxId: domainOutboxIdFromCommand(identity.commandKey, 0),
        commandId: identity.commandKey,
        activityLogId: activityLogIdFromCommandId(identity.commandKey),
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account', id: 'other_account' },
        channel: 'email',
        templateId: 'other_template',
        templateVersion: 'v9',
        renderInputs: { bookingId: 'other' },
        deliverySemantics: 'operational',
        createdAt: timestampFromDate(new Date('2025-01-01T00:00:00.000Z')),
        delivery: { status: 'pending' },
      },
    });

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-outbox-collision-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: auditedHandler(),
    });

    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(1);
  });

  it('commits domain, audit, and outbox together on success', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-atomic-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: auditedHandler(),
    });

    const identity = resolveCommandIdempotencyIdentity(envelope('audit-atomic-01'));
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(bookingPath)?.data.status).toBe('completed');
    expect(
      snapshot.docs.has(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
    ).toBe(true);
    expect(
      snapshot.docs.has(`domain_outbox/${domainOutboxIdFromCommand(identity.commandKey, 0)}`)
    ).toBe(true);
    expect(snapshot.docs.has(identity.recordPath.slice(1))).toBe(true);
  });

  it('keeps decidedAt and committedAt distinct in staged Activity Log', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-timestamps-01'),
      environment: environment('2026-01-01T00:00:00.000Z', 2500),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: auditedHandler(),
    });

    const identity = resolveCommandIdempotencyIdentity(envelope('audit-timestamps-01'));
    const activityLog = executor
      .snapshot()
      .docs.get(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)?.data;

    expect(activityLog?.decidedAt.seconds).toBe(
      Math.floor(Date.parse('2026-01-01T00:00:00.000Z') / 1000)
    );
    expect(activityLog?.committedAt.seconds).toBe(
      Math.floor((Date.parse('2026-01-01T00:00:00.000Z') + 2500) / 1000)
    );
  });

  it('still commits exactly one audit/outbox set when the transaction callback retries', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      { [bookingPath]: { revision: 1, status: 'confirmed' } },
      { simulateRetry: true }
    );
    let attempt = 0;

    await executeIdempotentCanonicalCommand({
      envelope: envelope('audit-retry-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      requireAuditOnSuccess: true,
      handler: {
        planAuditOutbox: async () => auditPlan(),
        execute: async (session, context) => {
          attempt += 1;
          if (attempt === 1) {
            throw new CanonicalCommandError('concurrent_modification', { correlationId });
          }
          session.tx.update(
            { path: bookingPath },
            {
              revision: context.nextRevision(AggregateRevisionSchema.parse(1)),
              status: 'completed',
            }
          );
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(attempt).toBe(2);
    const identity = resolveCommandIdempotencyIdentity(envelope('audit-retry-01'));
    const snapshot = executor.snapshot();
    const activityLogs = [...snapshot.docs.keys()].filter((path) =>
      path.startsWith('activity_logs/')
    );
    const outboxDocs = [...snapshot.docs.keys()].filter((path) =>
      path.startsWith('domain_outbox/')
    );
    expect(activityLogs).toHaveLength(1);
    expect(outboxDocs).toHaveLength(1);
    expect(activityLogs[0]).toBe(
      `activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`
    );
  });

  it('rejects system actors masquerading as administrator capability', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const systemEnvelope: CommandEnvelope<'complete_booking'> = {
      kind: 'complete_booking',
      context: {
        actor: systemCommandActor('system.resolveOutcome'),
        exercisedCapability: 'administrator',
        idempotencyKey: 'audit-system-mask-01',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId },
    };

    const result = await executeIdempotentCanonicalCommand({
      envelope: systemEnvelope,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        planAuditOutbox: async () => auditPlan(),
        execute: async () => commandSuccessResult('complete_booking', correlationId),
      },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
  });

  it('accepts zero outbox obligations and up to 32 obligations in planning fixtures', () => {
    const zeroObligations = evaluateTransactionPreflight(
      TRANSACTION_PLANNING_FIXTURES.individualBooking()
    );
    expect(zeroObligations.accepted).toBe(true);

    const maxObligations = evaluateTransactionPreflight(
      TRANSACTION_PLANNING_FIXTURES.maximumOutboxObligationBoundary()
    );
    expect(maxObligations.accepted).toBe(true);
    if (maxObligations.accepted) {
      expect(maxObligations.estimate.byCategory.outbox_obligation.mutations).toBe(
        AUDIT_CARDINALITY_LIMITS.outboxObligationsPerCommand
      );
      expect(maxObligations.estimate.byCategory.activity_log.mutations).toBe(1);
    }
  });
});
