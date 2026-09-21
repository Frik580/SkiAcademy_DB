import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminIssueReadModelsInputSchema,
  type QueryAdminIssueReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminIssueReadCursorError,
  queryAdminIssueReadModels,
} from './adminIssueReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminIssueReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminIssueReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryAdminIssueReadModelsInputSchema,
      request.data
    );

    try {
      const { actor, readScope, readContext } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryAdminIssueReadModels(firestore, actor, input, { readContext, readScope });
    } catch (error) {
      if (error instanceof InvalidAdminIssueReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
