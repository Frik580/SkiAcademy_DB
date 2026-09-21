import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryTestSessionReadModelsInputSchema,
  type QueryTestSessionReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
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
      if (input.scope === 'test_session_inventory') {
        await resolveCanonicalReadScope(createFirestoreCanonicalExecutionScopeStore(firestore), {
          accountId: actor.accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: true,
          requestedTestSessionId: input.testSessionId,
          purpose: 'maintenance',
        });
      }
      return await queryTestSessionReadModels(firestore, input);
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
