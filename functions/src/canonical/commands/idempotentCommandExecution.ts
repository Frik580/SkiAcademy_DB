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
  LIVE_CANONICAL_EXECUTION_SCOPE,
} from '@ski-academy/shared-domain';
import type {
  CanonicalAtomicTransactionSession,
  CanonicalTransactionDocumentRef,
  CanonicalTransactionExecutor,
} from '../transactions';
import { scopeCanonicalTransactionSession } from '../transactions/scopedCanonicalTransaction';
import {
  prepareAuditOutboxReads,
  stageAuditOutboxInTransaction,
  committedAtFromEnvironment,
} from '../auditOutbox';
import {
  commitAdminLessonBookingsRevisionBump,
  mergeAdminLessonBookingsRevisionIntoResult,
  planAdminLessonBookingsRevisionBump,
  plannedMutationsAffectAdminLessonBookings,
} from '../bookings/adminLessonBookingsRevision';
import {
  commitAdminPlannerRevisionBump,
  mergeAdminPlannerRevisionIntoResult,
  planAdminPlannerRevisionBump,
  plannedMutationsAffectAdminPlanner,
} from '../planner/adminPlannerRevision';
import {
  commitAdminCoursesRevisionBump,
  mergeAdminCoursesRevisionIntoResult,
  planAdminCoursesRevisionBump,
  plannedMutationsAffectAdminCourses,
} from '../courses/adminCoursesRevision';
import {
  commitAdminFinanceRevisionBump,
  mergeAdminFinanceRevisionIntoResult,
  planAdminFinanceRevisionBump,
  plannedMutationsAffectAdminFinance,
} from '../finance/adminFinanceRevision';
import {
  commitAdminPeopleRevisionBump,
  mergeAdminPeopleRevisionIntoResult,
  planAdminPeopleRevisionBump,
  plannedMutationsAffectAdminPeople,
} from '../identity/adminPeopleRevision';
import {
  commitAdminBookingChangeRequestsRevisionBump,
  mergeAdminBookingChangeRequestsRevisionIntoResult,
  planAdminBookingChangeRequestsRevisionBump,
  plannedMutationsAffectAdminBookingChangeRequests,
} from '../bookings/adminBookingChangeRequestsRevision';

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
  readonly onSettled?: (observation: IdempotentCommandExecutionObservation<Kind>) => void;
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
  readonly onSettled?: (observation: IdempotentCommandExecutionObservation<Kind>) => void;
}

export interface IdempotentCommandExecutionObservation<Kind extends CommandKind> {
  readonly result: CommandResult<Kind>;
  readonly replayed: boolean;
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
    ...identity.scope,
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
  const {
    envelope,
    environment,
    executor,
    revisionTarget,
    handler,
    requireAuditOnSuccess,
    onSettled,
  } = input;
  const executionScope = environment.scope ?? LIVE_CANONICAL_EXECUTION_SCOPE;
  const identity = resolveCommandIdempotencyIdentity(envelope, executionScope);
  const idempotencyPath = toTransactionPath(identity.recordPath);

  try {
    const observation = await executor.runAtomic<IdempotentCommandExecutionObservation<Kind>>({
      correlationId: envelope.context.correlationId,
      run: async (baseSession) => {
        const session = scopeCanonicalTransactionSession(baseSession, executionScope);
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
            record.dataScope !== identity.scope.dataScope ||
            record.testSessionId !==
              (identity.scope.dataScope === 'test' ? identity.scope.testSessionId : undefined) ||
            record.commandKind !== envelope.kind ||
            record.fingerprint !== identity.fingerprint
          ) {
            throw idempotencyConflictError(envelope);
          }

          return {
            result: fromStoredCommandResult(record.result, envelope.kind),
            replayed: true,
          };
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

        const plannedMutations = session.plan.build().mutations;
        const mayBumpLiveAdminRuntime = executionScope.dataScope === 'live';
        const shouldBumpAdminLessonBookingsRevision =
          mayBumpLiveAdminRuntime && plannedMutationsAffectAdminLessonBookings(plannedMutations);
        const shouldBumpAdminPlannerRevision =
          mayBumpLiveAdminRuntime &&
          plannedMutationsAffectAdminPlanner(plannedMutations, envelope.kind);
        const shouldBumpAdminCoursesRevision =
          mayBumpLiveAdminRuntime &&
          plannedMutationsAffectAdminCourses(plannedMutations, envelope.kind);
        const shouldBumpAdminFinanceRevision =
          mayBumpLiveAdminRuntime &&
          plannedMutationsAffectAdminFinance(plannedMutations, envelope.kind);
        const shouldBumpAdminPeopleRevision =
          mayBumpLiveAdminRuntime && plannedMutationsAffectAdminPeople(plannedMutations);
        const shouldBumpAdminBookingChangeRequestsRevision =
          mayBumpLiveAdminRuntime &&
          plannedMutationsAffectAdminBookingChangeRequests(plannedMutations);
        if (shouldBumpAdminLessonBookingsRevision) {
          await planAdminLessonBookingsRevisionBump(session);
        }
        if (shouldBumpAdminPlannerRevision) {
          await planAdminPlannerRevisionBump(session);
        }
        if (shouldBumpAdminCoursesRevision) {
          await planAdminCoursesRevisionBump(session);
        }
        if (shouldBumpAdminFinanceRevision) {
          await planAdminFinanceRevisionBump(session);
        }
        if (shouldBumpAdminPeopleRevision) {
          await planAdminPeopleRevisionBump(session);
        }
        if (shouldBumpAdminBookingChangeRequestsRevision) {
          await planAdminBookingChangeRequestsRevisionBump(session);
        }

        await session.transitionToWrites();

        const decidedAt = environment.clock.decidedAt();
        let result = await handler.execute(session, {
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

        if (result.status === 'success' && requireAuditOnSuccess && auditPlan === undefined) {
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
            scope: executionScope,
          });
        }

        if (result.status === 'success' && shouldBumpAdminLessonBookingsRevision) {
          result = mergeAdminLessonBookingsRevisionIntoResult(
            result,
            commitAdminLessonBookingsRevisionBump(session, timestampFromDate(decidedAt))
          );
        }
        if (result.status === 'success' && shouldBumpAdminPlannerRevision) {
          result = mergeAdminPlannerRevisionIntoResult(
            result,
            commitAdminPlannerRevisionBump(session, timestampFromDate(decidedAt))
          );
        }
        if (result.status === 'success' && shouldBumpAdminCoursesRevision) {
          result = mergeAdminCoursesRevisionIntoResult(
            result,
            commitAdminCoursesRevisionBump(session, timestampFromDate(decidedAt))
          );
        }
        if (result.status === 'success' && shouldBumpAdminFinanceRevision) {
          result = mergeAdminFinanceRevisionIntoResult(
            result,
            commitAdminFinanceRevisionBump(session, timestampFromDate(decidedAt))
          );
        }
        if (result.status === 'success' && shouldBumpAdminPeopleRevision) {
          result = mergeAdminPeopleRevisionIntoResult(
            result,
            commitAdminPeopleRevisionBump(session, timestampFromDate(decidedAt))
          );
        }
        if (result.status === 'success' && shouldBumpAdminBookingChangeRequestsRevision) {
          result = mergeAdminBookingChangeRequestsRevisionIntoResult(
            result,
            commitAdminBookingChangeRequestsRevisionBump(session, timestampFromDate(decidedAt))
          );
        }

        if (shouldPersistIdempotencyOutcome(result)) {
          const record = buildIdempotencyRecord(envelope, identity, result, decidedAt);
          session.tx.create({ path: idempotencyPath }, record);
        }

        return { result, replayed: false };
      },
    });
    onSettled?.(observation);
    return observation.result;
  } catch (error) {
    if (error instanceof CanonicalCommandError) {
      const result = commandErrorResult(
        envelope.kind,
        envelope.context.correlationId,
        error.toTransport()
      );
      onSettled?.({ result, replayed: false });
      return result;
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
