import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryParticipantAchievementsReadModelsInputSchema,
  rejectSpoofedParticipantAchievementsReadInput,
  type QueryParticipantAchievementsReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  ParticipantAchievementsReadDeniedError,
  parseAchievementsReadAccountId,
  queryParticipantAchievementsReadModels,
} from './participantAchievementsReadModels';
import { parseAccount } from '../participantAccess/participantAccessStore';

export function createQueryParticipantAchievementsReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantAchievementsReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantAchievementsReadInput(raw);

    const parsed = QueryParticipantAchievementsReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const accountId = parseAchievementsReadAccountId(request.auth?.uid);
    if (!accountId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accountSnapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    try {
      return await queryParticipantAchievementsReadModels(firestore, parsed.data, {
        accountId,
      });
    } catch (error) {
      if (error instanceof ParticipantAchievementsReadDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      throw error;
    }
  };
}
