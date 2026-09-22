import type { Account, AccountId, CorrelationId } from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import {
  assertTestMutableSubjectScope,
  crossScopeCommandError,
} from './assertTestMutableResourceScope';
import {
  parseTestActor,
  parseTestActorAssignment,
  testActorAssignmentPath,
  testActorPath,
} from './testSessionStore';

/**
 * Three layers stay distinct:
 *
 * Persistent TestActor identity — `users/{accountId}` and `test_actors/{accountId}`
 * may be `dataScope=test` with no `testSessionId`.
 *
 * Active session relationship — `test_actor_assignments/{accountId}.activeTestSessionId`.
 *
 * Session-bound working state — Participant, Wallet, Course clone, CourseDay,
 * Booking, Payment, Enrollment, Attendance, Progress, and Review — stays on
 * `assertTestMutableSubjectScope`: `dataScope=test` and `testSessionId` of the
 * current execution scope.
 *
 * This helper is payer/account authority only. The Account document is not
 * session authority by itself, and a missing `testSessionId` is never accepted
 * for a transactional resource.
 */
export function isPersistentTestAccountShape(account: {
  readonly dataScope?: string;
  readonly testSessionId?: string;
}): boolean {
  return account.dataScope === 'test' && account.testSessionId === undefined;
}

export async function assertPayerAccountAuthority(input: {
  readonly session: CanonicalAtomicTransactionSession;
  readonly correlationId: CorrelationId;
  readonly accountId: AccountId;
  readonly account: Account;
}): Promise<void> {
  if (input.account.accountId !== input.accountId) {
    throw crossScopeCommandError(input.correlationId, 'conflict');
  }

  const scope = input.session.scope;
  if (scope?.dataScope !== 'test' || !isPersistentTestAccountShape(input.account)) {
    assertTestMutableSubjectScope({
      correlationId: input.correlationId,
      scope,
      persisted: input.account,
    });
    return;
  }

  const actorDocumentPath = testActorPath(input.accountId);
  const actorRead = await input.session.tx.get({ path: actorDocumentPath });
  input.session.plan.planRead({
    path: actorDocumentPath,
    category: 'authorization_check',
  });
  const actor = parseTestActor(actorRead.exists ? actorRead.data : undefined);
  if (!actor || actor.accountId !== input.accountId || actor.allowed !== true) {
    throw crossScopeCommandError(input.correlationId, 'conflict');
  }

  const assignmentDocumentPath = testActorAssignmentPath(input.accountId);
  const assignmentRead = await input.session.tx.get({ path: assignmentDocumentPath });
  input.session.plan.planRead({
    path: assignmentDocumentPath,
    category: 'authorization_check',
  });
  const assignment = parseTestActorAssignment(
    assignmentRead.exists ? assignmentRead.data : undefined
  );
  if (
    !assignment ||
    assignment.accountId !== input.accountId ||
    assignment.activeTestSessionId !== scope.testSessionId
  ) {
    throw crossScopeCommandError(input.correlationId, 'conflict');
  }
}
