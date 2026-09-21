import {
  CanonicalCommandError,
  parsePersistedCanonicalScope,
  type CanonicalExecutionScope,
  type CorrelationId,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { CanonicalTransactionExecutor } from '../transactions';
import { participantProgressPath } from '../progress/participantProgressStore';
import { participantAchievementsPath } from '../achievements/participantAchievementsStore';
import { instructorRatingSummaryPath } from '../reviews/instructorReviewStore';
import { crossScopeCommandError } from './assertTestMutableResourceScope';

export interface ResetTestSessionBoundRecordInput {
  readonly executor: CanonicalTransactionExecutor;
  readonly correlationId: CorrelationId;
  readonly scope: CanonicalExecutionScope;
}

function assertResetTargetIsTest(correlationId: CorrelationId, data: Record<string, unknown>): void {
  const persisted = parsePersistedCanonicalScope(data, { allowLegacyLive: true });
  if (persisted.dataScope !== 'test') {
    throw crossScopeCommandError(correlationId, 'conflict');
  }
}

async function deleteTestScopedDocument(input: {
  readonly executor: CanonicalTransactionExecutor;
  readonly correlationId: CorrelationId;
  readonly path: string;
}): Promise<'deleted' | 'missing'> {
  return input.executor.runAtomic({
    correlationId: input.correlationId,
    run: async (session) => {
      const read = await session.tx.get({ path: input.path });
      session.plan.planRead({ path: input.path, category: 'aggregate' });
      if (!read.exists || !read.data) {
        return 'missing' as const;
      }
      assertResetTargetIsTest(input.correlationId, read.data);
      session.plan.planMutation({
        path: input.path,
        kind: 'delete',
        category: 'aggregate',
        estimatedPayloadBytes: 64,
      });
      await session.transitionToWrites();
      session.tx.delete({ path: input.path });
      return 'deleted' as const;
    },
  });
}

/** Persistent Test Participant progress path is reused; session B must not mix session A state. */
export async function resetTestParticipantProgress(input: ResetTestSessionBoundRecordInput & {
  readonly participantId: ParticipantId;
}): Promise<'deleted' | 'missing'> {
  if (input.scope.dataScope !== 'test') {
    throw new CanonicalCommandError('cross_scope_forbidden', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  return deleteTestScopedDocument({
    executor: input.executor,
    correlationId: input.correlationId,
    path: participantProgressPath(input.participantId),
  });
}

export async function resetTestParticipantAchievements(input: ResetTestSessionBoundRecordInput & {
  readonly participantId: ParticipantId;
}): Promise<'deleted' | 'missing'> {
  if (input.scope.dataScope !== 'test') {
    throw new CanonicalCommandError('cross_scope_forbidden', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  return deleteTestScopedDocument({
    executor: input.executor,
    correlationId: input.correlationId,
    path: participantAchievementsPath(input.participantId),
  });
}

export async function resetTestInstructorRatingSummary(input: ResetTestSessionBoundRecordInput & {
  readonly instructorId: InstructorId;
}): Promise<'deleted' | 'missing'> {
  if (input.scope.dataScope !== 'test') {
    throw new CanonicalCommandError('cross_scope_forbidden', {
      correlationId: input.correlationId,
      details: { reason: 'unsupported' },
    });
  }
  return deleteTestScopedDocument({
    executor: input.executor,
    correlationId: input.correlationId,
    path: instructorRatingSummaryPath(input.instructorId),
  });
}
