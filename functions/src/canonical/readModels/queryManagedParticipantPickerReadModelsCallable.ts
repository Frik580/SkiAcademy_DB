import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryManagedParticipantPickerReadModelsInputSchema,
  parseManagedParticipantPickerAccountId,
  rejectSpoofedManagedParticipantPickerInput,
  type QueryManagedParticipantPickerReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryManagedParticipantPickerReadModels } from './managedParticipantPickerReadModels';

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

    const parsedAccountId = parseManagedParticipantPickerAccountId(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    return queryManagedParticipantPickerReadModels(firestore, parsedAccountId.data);
  };
}
