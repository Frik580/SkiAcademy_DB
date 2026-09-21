import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminPlannerReadModelsInputSchema,
  type QueryAdminPlannerReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryAdminPlannerReadModels } from './adminPlannerReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminPlannerReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminPlannerReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryAdminPlannerReadModelsInputSchema,
      request.data
    );
    try {
      const { actor, readScope, readContext } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryAdminPlannerReadModels(firestore, actor, input, { readContext, readScope });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
