import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryParticipantLessonFeedbackReadModelsInputSchema,
  rejectSpoofedParticipantLessonFeedbackReadInput,
  type QueryParticipantLessonFeedbackReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  ParticipantLessonFeedbackReadDeniedError,
  parseFeedbackReadAccountId,
  queryParticipantLessonFeedbackReadModels,
} from './participantLessonFeedbackReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { parseAccount } from '../participantAccess/participantAccessStore';

export function createQueryParticipantLessonFeedbackReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantLessonFeedbackReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantLessonFeedbackReadInput(raw);

    const parsed = QueryParticipantLessonFeedbackReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const accountId = parseFeedbackReadAccountId(request.auth?.uid);
    if (!accountId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accountSnapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    if (parsed.data.scope === 'instructor_lesson') {
      instructorId = resolveCallableInstructorId(
        readCallableAccountProfile(accountSnapshot.data() as Record<string, unknown> | undefined)
      );
      if (!instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    try {
      return await queryParticipantLessonFeedbackReadModels(firestore, parsed.data, {
        accountId,
        instructorId,
      });
    } catch (error) {
      if (error instanceof ParticipantLessonFeedbackReadDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      throw error;
    }
  };
}
