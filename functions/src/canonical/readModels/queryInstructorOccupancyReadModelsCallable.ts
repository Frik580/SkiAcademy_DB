import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryInstructorOccupancyReadModelsInputSchema,
  type QueryInstructorOccupancyReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryInstructorOccupancyReadModels } from './instructorOccupancyReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryInstructorOccupancyReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorOccupancyReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryInstructorOccupancyReadModelsInputSchema,
      request.data
    );

    try {
      const parsedAccountId = AccountIdSchema.safeParse(request.auth?.uid);
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(parsedAccountId.success
            ? { accountId: parsedAccountId.data, accountLifecycleStatus: 'active' as const }
            : {}),
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });
      return await queryInstructorOccupancyReadModels(firestore, input, { readContext, readScope });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
