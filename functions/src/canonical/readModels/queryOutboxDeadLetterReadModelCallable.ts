import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryOutboxDeadLetterReadModelInputSchema,
  type QueryOutboxDeadLetterReadModelResult,
} from '@ski-academy/shared-domain';
import { queryOutboxDeadLetterReadModel } from './outboxDeadLetterReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryOutboxDeadLetterReadModelHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryOutboxDeadLetterReadModelResult> => {
    const { requestedTestSessionId } = parseReadModelCallableData(
      QueryOutboxDeadLetterReadModelInputSchema,
      request.data
    );
    try {
      const { readScope } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryOutboxDeadLetterReadModel(firestore, readScope);
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
