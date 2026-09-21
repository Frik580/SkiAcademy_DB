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
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryParticipantLessonFeedbackReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryParticipantLessonFeedbackReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedParticipantLessonFeedbackReadInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryParticipantLessonFeedbackReadModelsInputSchema,
      raw
    );

    const accountId = parseFeedbackReadAccountId(request.auth?.uid);
    if (!accountId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const accountSnapshot = await firestore.collection('users').doc(accountId).get();
    const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
    if (!account || account.lifecycle.status !== 'active') {
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
      const readContext = createReadModelRequestContext(firestore, { readScope });

      let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
      if (input.scope === 'instructor_lesson') {
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(accountSnapshot.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      return await queryParticipantLessonFeedbackReadModels(firestore, input, {
        accountId,
        instructorId,
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof ParticipantLessonFeedbackReadDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
