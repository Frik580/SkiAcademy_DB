import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  TestSessionMaintenanceError,
  parseLifecycleInput,
  type TestSessionLifecycleResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from '../readModels/resolveCallableAdministrator';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
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
    try {
      const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
      const input = parseLifecycleInput(request.data);
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
      return await executeTestSessionLifecycle(
        {
          firestore,
          now: () => new Date(),
          storage,
          executor: createFirestoreCanonicalTransactionExecutor(firestore),
        },
        actor.accountId,
        input
      );
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof TestSessionMaintenanceError) {
        throw new HttpsError(httpsCode(error.code), error.code);
      }
      throw new HttpsError('internal', 'TEST_MAINTENANCE_FAILED');
    }
  };
}
