import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryParticipantProgressReadModelsInputSchema,
  rejectSpoofedParticipantProgressReadInput,
  type QueryParticipantProgressReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  ParticipantProgressReadDeniedError,
  parseProgressReadAccountId,
  queryParticipantProgressReadModels,
} from './participantProgressReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryParticipantProgressReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantProgressReadModelsResult> => {
    const { participantProgressContract, ...raw } = request.data ?? {};
    rejectSpoofedParticipantProgressReadInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryParticipantProgressReadModelsInputSchema,
      raw
    );

    const accountId = parseProgressReadAccountId(request.auth?.uid);
    if (!accountId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accountSnapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    try {
      const administratorActor =
        input.scope === 'admin'
          ? await resolveCallableAdministratorActor(firestore, request.auth?.uid)
          : undefined;
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId,
          accountLifecycleStatus: 'active',
          isAdministrator: input.scope === 'admin',
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });

      let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
      if (input.scope === 'instructor') {
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(accountSnapshot.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      const result = await queryParticipantProgressReadModels(firestore, input, {
        accountId,
        instructorId,
        administratorActor,
        readContext,
        readScope,
      });
      // Old strict readers do not know levelState. This is a wire projection,
      // never a rewrite of historical/canonical progress.
      return participantProgressContract === 2
        ? result
        : {
            ...result,
            items: result.items.map((item) => {
              const legacyItem = { ...item };
              delete legacyItem.levelState;
              return legacyItem;
            }),
          };
    } catch (error) {
      if (error instanceof ParticipantProgressReadDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
