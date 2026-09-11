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

export function createQueryParticipantProgressReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantProgressReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantProgressReadInput(raw);

    const parsed = QueryParticipantProgressReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const accountId = parseProgressReadAccountId(request.auth?.uid);
    if (!accountId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accountSnapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    if (parsed.data.scope === 'instructor') {
      instructorId = resolveCallableInstructorId(
        readCallableAccountProfile(accountSnapshot.data() as Record<string, unknown> | undefined)
      );
      if (!instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    try {
      return await queryParticipantProgressReadModels(firestore, parsed.data, {
        accountId,
        instructorId,
      });
    } catch (error) {
      if (error instanceof ParticipantProgressReadDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      throw error;
    }
  };
}
