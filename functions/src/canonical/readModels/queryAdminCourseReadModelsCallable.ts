import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminCourseReadModelsInputSchema,
  type QueryAdminCourseReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryAdminCourseReadModels } from './adminCourseReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminCourseReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminCourseReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryAdminCourseReadModelsInputSchema,
      request.data
    );
    try {
      const { actor, readScope, readContext } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryAdminCourseReadModels(firestore, actor, input, { readContext, readScope });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_cursor') {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
