import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  identityDocumentMatchesReadScope,
  QueryParticipantInstructorAccessReadModelsInputSchema,
  rejectSpoofedParticipantInstructorAccessReadInput,
  type QueryParticipantInstructorAccessReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryParticipantInstructorAccessReadModels } from './participantInstructorAccessReadModels';
import { resolveActiveCallableInstructorId } from './resolveCallableInstructorId';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryParticipantInstructorAccessReadModelsHandler(
  firestore: Firestore,
  now: () => Date = () => new Date()
) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantInstructorAccessReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantInstructorAccessReadInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryParticipantInstructorAccessReadModelsInputSchema,
      raw
    );

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
      const accountId = parsedAccountId.data;
      const profile =
        input.scope === 'instructor'
          ? (await firestore.collection('users').doc(accountId).get()).data()
          : undefined;
      const instructorId = resolveActiveCallableInstructorId(accountId, profile);
      if (input.scope === 'instructor' && !instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId,
          // The instructor path has passed the active Account check above.
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      if (input.scope === 'instructor' && !identityDocumentMatchesReadScope(readScope, profile)) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }

      return await queryParticipantInstructorAccessReadModels(firestore, input, {
        accountId,
        instructorId,
        now: now(),
        readContext: createReadModelRequestContext(firestore, { readScope }),
        readScope,
      });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
