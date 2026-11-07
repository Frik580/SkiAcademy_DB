import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { QueryParticipantProgressHistoryReadModelsInputSchema } from '@ski-academy/shared-domain';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import {
  parseProgressReadAccountId,
  ParticipantProgressReadDeniedError,
} from './participantProgressReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { queryParticipantProgressHistoryReadModels } from './participantProgressHistoryReadModels';

export function createQueryParticipantProgressHistoryReadModelsHandler(
  firestore: Firestore,
  cursorSecret: string
) {
  return async (request: CallableRequest<Record<string, unknown>>) => {
    const accountId = parseProgressReadAccountId(request.auth?.uid);
    if (!accountId) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryParticipantProgressHistoryReadModelsInputSchema,
      request.data
    );
    const snapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(snapshot.data());
    const instructorId = resolveCallableInstructorId(readCallableAccountProfile(snapshot.data()));
    if (
      !account ||
      account.accountId !== accountId ||
      account.lifecycle.status !== 'active' ||
      !instructorId
    ) {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
    try {
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      return await queryParticipantProgressHistoryReadModels(firestore, input, {
        instructorId,
        readScope,
        cursorSecret,
      });
    } catch (error) {
      if (error instanceof ParticipantProgressReadDeniedError)
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      rethrowReadScopeHttpsError(error);
    }
  };
}
