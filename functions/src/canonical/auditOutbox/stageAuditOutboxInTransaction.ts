import {
  activityLogIdFromCommandId,
  auditIntegrityViolation,
  buildActivityLogRecord,
  buildOutboxIdsFromDrafts,
  buildOutboxObligationRecords,
  canonicalFirestoreRecordsEquivalent,
  committedAtTimestampFromClock,
  parseStoredActivityLog,
  parseStoredOutboxObligation,
  planAuditOutboxStagingContributions,
  resolveAuditOutboxPaths,
  timestampFromDate,
  validateAuditOutboxStagingPlan,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import type { CanonicalTransactionReadResult } from '../transactions/transactionExecution';

function normalizeTransactionDocumentPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export interface PreparedAuditOutboxReads {
  readonly activityLogPath: string;
  readonly outboxPaths: readonly string[];
  readonly activityLogRead: CanonicalTransactionReadResult;
  readonly outboxReads: ReadonlyMap<string, CanonicalTransactionReadResult>;
}

export async function prepareAuditOutboxReads(
  session: CanonicalAtomicTransactionSession,
  commandId: CommandId,
  plan: AuditOutboxStagingPlan
): Promise<PreparedAuditOutboxReads> {
  const ordinals = plan.outboxObligations.map((obligation) => obligation.deliveryEffectOrdinal);
  const { activityLogPath, outboxPaths } = resolveAuditOutboxPaths(commandId, ordinals);
  const normalizedActivityLogPath = normalizeTransactionDocumentPath(activityLogPath);
  const normalizedOutboxPaths = outboxPaths.map(normalizeTransactionDocumentPath);

  const activityLogRead = await session.tx.get({ path: normalizedActivityLogPath });
  session.plan.planRead({ path: normalizedActivityLogPath, category: 'activity_log' });

  const outboxReads = new Map<string, CanonicalTransactionReadResult>();
  for (const outboxPath of normalizedOutboxPaths) {
    const read = await session.tx.get({ path: outboxPath });
    outboxReads.set(outboxPath, read);
    session.plan.planRead({ path: outboxPath, category: 'outbox_obligation' });
  }

  planAuditOutboxStagingContributions(session.plan, {
    activityLogPath: normalizedActivityLogPath,
    outboxObligationPaths: normalizedOutboxPaths,
  });

  return {
    activityLogPath: normalizedActivityLogPath,
    outboxPaths: normalizedOutboxPaths,
    activityLogRead,
    outboxReads,
  };
}

export function stageAuditOutboxInTransaction(input: {
  session: CanonicalAtomicTransactionSession;
  envelope: CommandEnvelope;
  commandId: CommandId;
  decidedAt: Date;
  committedAt: Date;
  plan: AuditOutboxStagingPlan;
  preparedReads: PreparedAuditOutboxReads;
}): void {
  const correlationId = input.envelope.context.correlationId;
  validateAuditOutboxStagingPlan(input.envelope, input.plan);

  const decidedAtTimestamp = timestampFromDate(input.decidedAt);
  const committedAtTimestamp = timestampFromDate(input.committedAt);
  const outboxIds = buildOutboxIdsFromDrafts(input.commandId, input.plan.outboxObligations);

  const activityLog = buildActivityLogRecord({
    envelope: input.envelope,
    commandId: input.commandId,
    decidedAt: decidedAtTimestamp,
    committedAt: committedAtTimestamp,
    plan: input.plan.activityLog,
    outboxIds,
  });

  const outboxObligations = buildOutboxObligationRecords({
    commandId: input.commandId,
    activityLogId: activityLogIdFromCommandId(input.commandId),
    createdAt: decidedAtTimestamp,
    drafts: input.plan.outboxObligations,
  });

  const { activityLogPath, outboxPaths, activityLogRead, outboxReads } = input.preparedReads;

  if (activityLogRead.exists) {
    const stored = parseStoredActivityLog(activityLogRead.data);
    if (!stored || !canonicalFirestoreRecordsEquivalent(activityLogRead.data ?? {}, activityLog)) {
      throw auditIntegrityViolation(correlationId);
    }
  } else {
    input.session.tx.create({ path: activityLogPath }, activityLog);
  }

  for (let index = 0; index < outboxObligations.length; index += 1) {
    const obligation = outboxObligations[index];
    const outboxPath = outboxPaths[index];
    const outboxRead = outboxReads.get(outboxPath);

    if (outboxRead?.exists) {
      const stored = parseStoredOutboxObligation(outboxRead.data);
      if (!stored || !canonicalFirestoreRecordsEquivalent(outboxRead.data ?? {}, obligation)) {
        throw auditIntegrityViolation(correlationId);
      }
      continue;
    }

    input.session.tx.create({ path: outboxPath }, obligation);
  }
}

export function committedAtFromEnvironment(environment: { clock: { committedAt(): Date } }): Date {
  return environment.clock.committedAt();
}

export function committedAtTimestampFromEnvironment(environment: {
  clock: { committedAt(): Date };
}): ReturnType<typeof committedAtTimestampFromClock> {
  return committedAtTimestampFromClock(environment.clock);
}
