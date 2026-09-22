import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseCatalogReadModelsInputSchema,
  type QueryCourseCatalogReadModelsResult,
} from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { queryCourseCatalogReadModels } from './courseCatalogReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { readCallableAccountProfile } from './resolveCallableInstructorId';
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
      const resolvesProductPrincipal =
        input.scope === 'authenticated' || input.scope === 'product';
      let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
      let isAdministrator = false;
      let accountLifecycleStatus: 'active' | 'disabled' = 'active';
      if (resolvesProductPrincipal) {
        if (!request.auth?.uid) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
        if (!parsedAccountId.success) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        accountId = parsedAccountId.data;
        // Raw user read. A LIVE-scoped account lookup hides a persistent TestActor
        // before assignment can select product_test.
        const userSnap = await firestore.collection('users').doc(accountId).get();
        const profileData = userSnap.exists
          ? (userSnap.data() as Record<string, unknown> | undefined)
          : undefined;
        const account = parseAccount(profileData);
        accountLifecycleStatus = account?.lifecycle.status === 'disabled' ? 'disabled' : 'active';
        isAdministrator = isAdministratorProfile(readCallableAccountProfile(profileData));
      }

      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(accountId ? { accountId, accountLifecycleStatus } : {}),
          isAdministrator,
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
