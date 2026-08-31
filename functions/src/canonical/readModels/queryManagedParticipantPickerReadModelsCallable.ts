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

export function createQueryManagedParticipantPickerReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryManagedParticipantPickerReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedManagedParticipantPickerInput(raw);

    const parsed = QueryManagedParticipantPickerReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    if (parsed.data.accountId !== undefined) {
      await resolveCallableAdministratorActor(firestore, request.auth.uid);
      return queryManagedParticipantPickerReadModels(firestore, parsed.data.accountId);
    }

    const parsedAccountId = parseManagedParticipantPickerAccountId(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    return queryManagedParticipantPickerReadModels(firestore, parsedAccountId.data);
  };
}
