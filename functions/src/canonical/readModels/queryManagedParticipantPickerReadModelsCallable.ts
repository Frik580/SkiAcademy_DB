import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryManagedParticipantPickerReadModelsInputSchema,
  parseManagedParticipantPickerAccountId,
  rejectSpoofedManagedParticipantPickerInput,
  type QueryManagedParticipantPickerReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryManagedParticipantPickerReadModels } from './managedParticipantPickerReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryManagedParticipantPickerReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryManagedParticipantPickerReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedManagedParticipantPickerInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryManagedParticipantPickerReadModelsInputSchema,
      raw
    );

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
      const isAdministrator = input.accountId !== undefined;
      const actor = isAdministrator
        ? await resolveCallableAdministratorActor(firestore, request.auth.uid)
        : undefined;
      const targetAccountId = input.accountId
        ? input.accountId
        : parseManagedParticipantPickerAccountId(request.auth.uid).success
          ? parseManagedParticipantPickerAccountId(request.auth.uid).data
          : undefined;
      if (!targetAccountId) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const resolverAccountId = actor?.accountId ?? targetAccountId;
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId: resolverAccountId,
          accountLifecycleStatus: 'active',
          isAdministrator,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });
      return await queryManagedParticipantPickerReadModels(firestore, targetAccountId, {
        readContext,
        readScope,
      });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
