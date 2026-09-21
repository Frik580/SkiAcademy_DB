import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseCatalogReadModelsInputSchema,
  type QueryCourseCatalogReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryCourseCatalogReadModels } from './courseCatalogReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryCourseCatalogReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryCourseCatalogReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryCourseCatalogReadModelsInputSchema,
      request.data
    );

    try {
      let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
      if (input.scope === 'authenticated') {
        if (!request.auth?.uid) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
        if (!parsedAccountId.success) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        accountId = parsedAccountId.data;
      }

      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(accountId ? { accountId, accountLifecycleStatus: 'active' as const } : {}),
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });
      return await queryCourseCatalogReadModels(firestore, input, { readContext, readScope });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
