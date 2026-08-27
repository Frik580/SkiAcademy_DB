import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryParticipantInstructorAccessReadModelsInputSchema,
  rejectSpoofedParticipantInstructorAccessReadInput,
  type QueryParticipantInstructorAccessReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryParticipantInstructorAccessReadModels } from './participantInstructorAccessReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';

export function createQueryParticipantInstructorAccessReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantInstructorAccessReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantInstructorAccessReadInput(raw);

    const parsed = QueryParticipantInstructorAccessReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    if (parsed.data.scope === 'instructor') {
      const userSnap = await firestore.collection('users').doc(request.auth.uid).get();
      instructorId = resolveCallableInstructorId(
        readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
      );
      if (!instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    return queryParticipantInstructorAccessReadModels(firestore, parsed.data, {
      accountId: parsedAccountId.data,
      instructorId,
    });
  };
}
