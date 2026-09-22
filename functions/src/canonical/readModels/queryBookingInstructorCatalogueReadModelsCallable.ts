import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryBookingInstructorCatalogueReadModelsInputSchema,
  type QueryBookingInstructorCatalogueReadModelsResult,
} from '@ski-academy/shared-domain';
import { isAdministratorProfile } from '../commands/resolveCallableAccountContext';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { queryBookingInstructorCatalogueReadModels } from './bookingInstructorCatalogueReadModels';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { readCallableAccountProfile } from './resolveCallableInstructorId';

export function createQueryBookingInstructorCatalogueReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryBookingInstructorCatalogueReadModelsResult> => {
    const { requestedTestSessionId } = parseReadModelCallableData(
      QueryBookingInstructorCatalogueReadModelsInputSchema,
      request.data
    );

    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!parsedAccountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }

      // Raw user read. A LIVE-scoped account lookup hides a persistent TestActor
      // (dataScope=test, no testSessionId) before assignment can resolve.
      const userSnap = await firestore.collection('users').doc(parsedAccountId.data).get();
      const profileData = userSnap.exists
        ? (userSnap.data() as Record<string, unknown> | undefined)
        : undefined;
      const account = parseAccount(profileData);
      const profile = readCallableAccountProfile(profileData);
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId: parsedAccountId.data,
          accountLifecycleStatus: account?.lifecycle.status === 'disabled' ? 'disabled' : 'active',
          isAdministrator: isAdministratorProfile(profile),
          requestedTestSessionId,
        }
      );
      return await queryBookingInstructorCatalogueReadModels(firestore, { readScope });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
