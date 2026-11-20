import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  TestSessionMaintenanceError,
  LIVE_CANONICAL_READ_SCOPE,
  identityDocumentMatchesReadScope,
  parseLifecycleInput,
  resolveTestSessionLifecycleCommandSupport,
  type TestSessionLifecycleResult,
} from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { logSecurityCommandEvent } from '../commands/securityCommandLogging';
import { accountPath, parseAccount } from '../participantAccess/participantAccessStore';
import { resolveCallableAdministratorActor } from '../readModels/resolveCallableAdministrator';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  CanonicalExecutionScopeError,
  createFirestoreCanonicalExecutionScopeStore,
} from './canonicalExecutionScopeResolver';
import { assertTestSessionMaintenanceActor } from './canonicalReadScopeResolver';
import { createFirebaseTestSessionStorageStore } from './deleteTestSessionStorage';
import { executeTestSessionLifecycle } from './testSessionLifecycleEngine';

function httpsCode(code: TestSessionMaintenanceError['code']): 'failed-precondition' | 'not-found' | 'invalid-argument' | 'permission-denied' {
  if (code === 'TEST_SESSION_NOT_FOUND') return 'not-found';
  if (code === 'LIFECYCLE_FORBIDDEN' || code === 'TEST_MAINTENANCE_CONFIRMATION_INVALID') return 'invalid-argument';
  if (code === 'TEST_ACTOR_INVALID' || code === 'TEST_INSTRUCTOR_INVALID' || code === 'TEST_ACTOR_ASSIGNMENT_CONFLICT') {
    return 'permission-denied';
  }
  return 'failed-precondition';
}

export function createExecuteTestSessionLifecycleHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<TestSessionLifecycleResult> => {
    const requestedCommand = request.data?.command;
    const commandKind =
      typeof requestedCommand === 'string' &&
      resolveTestSessionLifecycleCommandSupport(requestedCommand) === 'LIFECYCLE_SUPPORTED'
        ? requestedCommand
        : 'test_session_lifecycle';
    const actorLog = { kind: 'account' as const, id: request.auth?.uid };
    try {
      const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
      const input = parseLifecycleInput(request.data);
      await assertTestSessionMaintenanceActor(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        actor.accountId
      );
      const storage =
        input.command === 'create_test_session'
          ? {
              async list(): Promise<readonly string[]> {
                return [];
              },
              async delete(): Promise<'deleted' | 'absent'> {
                return 'absent';
              },
            }
          : createFirebaseTestSessionStorageStore(input.testSessionId);
      const result = await executeTestSessionLifecycle(
        {
          firestore,
          now: () => new Date(),
          storage,
          executor: createFirestoreCanonicalTransactionExecutor(firestore),
          async authorizeAdmission(transaction) {
            const [accountSnapshot, testActor] = await transaction.getAll(
              firestore.doc(accountPath(actor.accountId)),
              firestore.doc(`test_actors/${actor.accountId}`)
            );
            const data = accountSnapshot?.data();
            const account = parseAccount(data);
            if (
              !isAdministratorProfile(data) ||
              account?.accountId !== actor.accountId ||
              account.lifecycle.status !== 'active' ||
              !identityDocumentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, data)
            ) {
              throw new HttpsError('permission-denied', 'This action is not permitted.');
            }
            if (testActor?.exists) {
              throw new CanonicalExecutionScopeError('TEST_ACTOR_REQUEST_FORBIDDEN');
            }
          },
        },
        actor.accountId,
        input
      );
      if (result.outcome !== 'preview' && result.outcome !== 'already_completed') {
        logSecurityCommandEvent({ actor: actorLog, commandKind, resultCode: result.outcome, scope: 'TEST' });
      }
      return result;
    } catch (error) {
      const resultCode =
        error instanceof HttpsError ||
        error instanceof CanonicalExecutionScopeError ||
        error instanceof TestSessionMaintenanceError
          ? error.code
          : 'TEST_MAINTENANCE_FAILED';
      logSecurityCommandEvent({ actor: actorLog, commandKind, resultCode, scope: 'TEST' });
      if (error instanceof HttpsError) throw error;
      if (error instanceof CanonicalExecutionScopeError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      if (error instanceof TestSessionMaintenanceError) {
        throw new HttpsError(httpsCode(error.code), error.code);
      }
      throw new HttpsError('internal', 'TEST_MAINTENANCE_FAILED');
    }
  };
}
