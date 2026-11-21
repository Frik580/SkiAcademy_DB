import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryTestSessionReadModelsInputSchema,
  type QueryTestSessionReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import {
  assertTestSessionMaintenanceActor,
  resolveCanonicalReadScope,
} from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';
import { queryTestSessionReadModels } from './testSessionReadModels';

export function createQueryTestSessionReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryTestSessionReadModelsResult> => {
    const { input } = parseReadModelCallableData(
      QueryTestSessionReadModelsInputSchema,
      request.data
    );

    try {
      const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
      const scopeStore = createFirestoreCanonicalExecutionScopeStore(firestore);
      if (input.scope === 'test_session_inventory') {
        await resolveCanonicalReadScope(scopeStore, {
          accountId: actor.accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: true,
          requestedTestSessionId: input.testSessionId,
          purpose: 'maintenance',
        });
      } else {
        await assertTestSessionMaintenanceActor(scopeStore, actor.accountId);
      }
      return await queryTestSessionReadModels(firestore, input);
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
