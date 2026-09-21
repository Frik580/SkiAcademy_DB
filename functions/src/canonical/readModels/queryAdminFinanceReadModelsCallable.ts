import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminFinanceReadModelsInputSchema,
  type QueryAdminFinanceReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminFinanceReadCursorError,
  queryAdminFinanceReadModels,
} from './adminFinanceReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminFinanceReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminFinanceReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryAdminFinanceReadModelsInputSchema,
      request.data
    );

    try {
      const { actor, readScope, readContext } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryAdminFinanceReadModels(firestore, actor, input, { readContext, readScope });
    } catch (error) {
      if (error instanceof InvalidAdminFinanceReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
