import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  LIVE_CANONICAL_READ_SCOPE,
  QueryAdminIdentityReadModelsInputSchema,
  type QueryAdminIdentityReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminIdentityReadCursorError,
  queryAdminIdentityReadModels,
} from './adminIdentityReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminIdentityReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminIdentityReadModelsResult> => {
    const { input } = parseReadModelCallableData(
      QueryAdminIdentityReadModelsInputSchema,
      request.data
    );

    try {
      const readScope = LIVE_CANONICAL_READ_SCOPE;
      const readContext = createReadModelRequestContext(firestore, { readScope });
      const actor = await resolveCallableAdministratorActor(
        firestore,
        request.auth?.uid,
        readContext
      );
      return await queryAdminIdentityReadModels(firestore, actor, input, { readContext, readScope });
    } catch (error) {
      if (error instanceof InvalidAdminIdentityReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
