import {
  CanonicalCommandError,
  COMMAND_IDEMPOTENCY_SCHEMA_VERSION,
  commandErrorResult,
  fromStoredCommandResult,
  parseCommandIdempotencyRecord,
  readAggregateRevision,
  resolveCommandIdempotencyIdentity,
  shouldPersistIdempotencyOutcome,
  timestampFromDate,
  toStoredCommandResult,
  assertExpectedRevision,
  nextAggregateRevision,
  validateAuditOutboxStagingPlan,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandIdempotencyRecord,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import type {
  CanonicalAtomicTransactionSession,
  CanonicalTransactionDocumentRef,
  CanonicalTransactionExecutor,
} from '../transactions';
import {
  prepareAuditOutboxReads,
  stageAuditOutboxInTransaction,
  committedAtFromEnvironment,
} from '../auditOutbox';

export interface IdempotentCommandRevisionTarget {
  readonly ref: CanonicalTransactionDocumentRef;
  readonly requireExpectedRevision?: boolean;
}

export interface IdempotentCommandWriteContext {
  readonly decidedAt: Date;
  readonly isReplay: false;
  readonly nextRevision: typeof nextAggregateRevision;
}

export interface IdempotentCanonicalCommandHandler<Kind extends CommandKind> {
  readonly read?: (session: CanonicalAtomicTransactionSession) => Promise<void>;
  readonly planAuditOutbox?: (
    session: CanonicalAtomicTransactionSession
  ) => Promise<AuditOutboxStagingPlan>;
  readonly execute: (
    session: CanonicalAtomicTransactionSession,
    context: IdempotentCommandWriteContext
  ) => Promise<CommandResult<Kind>>;
}

export interface AuthoritativeIdempotentCanonicalCommandHandler<Kind extends CommandKind> {
  readonly read?: (session: CanonicalAtomicTransactionSession) => Promise<void>;
  readonly planAuditOutbox: (
    session: CanonicalAtomicTransactionSession
  ) => Promise<AuditOutboxStagingPlan>;
  readonly execute: (
    session: CanonicalAtomicTransactionSession,
    context: IdempotentCommandWriteContext
  ) => Promise<CommandResult<Kind>>;
}

export interface ExecuteAuthoritativeIdempotentCanonicalCommandInput<Kind extends CommandKind> {
  readonly envelope: CommandEnvelope<Kind>;
  readonly environment: CommandExecutionEnvironment;
  readonly executor: CanonicalTransactionExecutor;
  readonly revisionTarget?: IdempotentCommandRevisionTarget;
  readonly handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind>;
}

export interface ExecuteIdempotentCanonicalCommandInput<Kind extends CommandKind> {
  readonly envelope: CommandEnvelope<Kind>;
  readonly environment: CommandExecutionEnvironment;
  readonly executor: CanonicalTransactionExecutor;
  readonly revisionTarget?: IdempotentCommandRevisionTarget;
  readonly handler: IdempotentCanonicalCommandHandler<Kind>;
  /**
   * When true, a successful result requires staged audit/outbox via planAuditOutbox.
   */
  readonly requireAuditOnSuccess?: boolean;
}

function completionStateForResult(
  result: CommandResult
): CommandIdempotencyRecord['completionState'] {
  return result.status === 'success' ? 'completed' : 'rejected';
}

function buildIdempotencyRecord(
  envelope: CommandEnvelope,
  identity: ReturnType<typeof resolveCommandIdempotencyIdentity>,
  result: CommandResult,
  decidedAt: Date
): CommandIdempotencyRecord {
  const decidedAtTimestamp = timestampFromDate(decidedAt);
  return {
    schemaVersion: COMMAND_IDEMPOTENCY_SCHEMA_VERSION,
    actorScope: identity.actorScope,
    commandKind: envelope.kind,
    fingerprint: identity.fingerprint,
    completionState: completionStateForResult(result),
    result: toStoredCommandResult(result),
    correlationId: envelope.context.correlationId,
    decidedAt: decidedAtTimestamp,
    createdAt: decidedAtTimestamp,
  };
}

function idempotencyConflictError(envelope: CommandEnvelope): CanonicalCommandError {
  return new CanonicalCommandError('idempotency_conflict', {
    correlationId: envelope.context.correlationId,
  });
}

function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export async function executeAuthoritativeIdempotentCanonicalCommand<Kind extends CommandKind>(
  input: ExecuteAuthoritativeIdempotentCanonicalCommandInput<Kind>
): Promise<CommandResult<Kind>> {
  return executeIdempotentCanonicalCommand({
    ...input,
    requireAuditOnSuccess: true,
  });
}

export async function executeIdempotentCanonicalCommand<Kind extends CommandKind>(
  input: ExecuteIdempotentCanonicalCommandInput<Kind>
): Promise<CommandResult<Kind>> {
  const { envelope, environment, executor, revisionTarget, handler, requireAuditOnSuccess } =
    input;
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const idempotencyPath = toTransactionPath(identity.recordPath);

  try {
    return await executor.runAtomic({
      correlationId: envelope.context.correlationId,
      run: async (session) => {
        const idempotencyRead = await session.tx.get({ path: idempotencyPath });
        session.plan.planRead({ path: idempotencyPath, category: 'idempotency' });

        if (idempotencyRead.exists) {
          const parsedRecord = parseCommandIdempotencyRecord(idempotencyRead.data);
          if (!parsedRecord.success) {
            throw new CanonicalCommandError('internal', {
              correlationId: envelope.context.correlationId,
            });
          }

          const record = parsedRecord.data;
          if (
            record.actorScope !== identity.actorScope ||
            record.commandKind !== envelope.kind ||
            record.fingerprint !== identity.fingerprint
          ) {
            throw idempotencyConflictError(envelope);
          }

          return fromStoredCommandResult(record.result, envelope.kind);
        }

        if (revisionTarget !== undefined) {
          const aggregateRead = await session.tx.get(revisionTarget.ref);
          session.plan.planRead({ path: revisionTarget.ref.path, category: 'aggregate' });
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: envelope.context.expectedRevision,
            currentRevision: aggregateRead.exists
              ? readAggregateRevision(aggregateRead.data)
              : undefined,
            requireExpectedRevision: revisionTarget.requireExpectedRevision,
          });
        }

        if (handler.read !== undefined) {
          await handler.read(session);
        }

        let auditPlan: AuditOutboxStagingPlan | undefined;
        let preparedAuditReads: Awaited<ReturnType<typeof prepareAuditOutboxReads>> | undefined;

        if (handler.planAuditOutbox !== undefined) {
          auditPlan = await handler.planAuditOutbox(session);
          validateAuditOutboxStagingPlan(envelope, auditPlan);
          preparedAuditReads = await prepareAuditOutboxReads(
            session,
            identity.commandKey,
            auditPlan
          );
        } else if (requireAuditOnSuccess) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }

        session.plan.planMutation({
          path: idempotencyPath,
          kind: 'create',
          category: 'idempotency',
          estimatedPayloadBytes: 2048,
        });

        await session.transitionToWrites();

        const decidedAt = environment.clock.decidedAt();
        const result = await handler.execute(session, {
          decidedAt,
          isReplay: false,
          nextRevision: nextAggregateRevision,
        });

        if (result.status === 'error' && result.error.retryable) {
          throw new CanonicalCommandError(result.error.code, {
            correlationId: envelope.context.correlationId,
            ...(result.error.currentRevision === undefined
              ? {}
              : { currentRevision: result.error.currentRevision }),
            ...(result.error.details === undefined ? {} : { details: result.error.details }),
          });
        }

        if (
          result.status === 'success' &&
          requireAuditOnSuccess &&
          auditPlan === undefined
        ) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }

        if (
          result.status === 'success' &&
          auditPlan !== undefined &&
          preparedAuditReads !== undefined
        ) {
          stageAuditOutboxInTransaction({
            session,
            envelope,
            commandId: identity.commandKey,
            decidedAt,
            committedAt: committedAtFromEnvironment(environment),
            plan: auditPlan,
            preparedReads: preparedAuditReads,
          });
        }

        if (shouldPersistIdempotencyOutcome(result)) {
          const record = buildIdempotencyRecord(envelope, identity, result, decidedAt);
          session.tx.create({ path: idempotencyPath }, record);
        }

        return result;
      },
    });
  } catch (error) {
    if (error instanceof CanonicalCommandError) {
      return commandErrorResult(envelope.kind, envelope.context.correlationId, error.toTransport());
    }
    throw error;
  }
}

export function idempotencyConflictResult<Kind extends CommandKind>(
  envelope: CommandEnvelope<Kind>
): CommandResult<Kind> {
  return commandErrorResult(
    envelope.kind,
    envelope.context.correlationId,
    idempotencyConflictError(envelope).toTransport()
  );
}
