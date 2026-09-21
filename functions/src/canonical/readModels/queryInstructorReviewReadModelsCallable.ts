import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryInstructorReviewReadModelsInputSchema,
  type QueryInstructorReviewReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidInstructorReviewReadCursorError,
  queryInstructorReviewReadModels,
} from './instructorReviewReadModels';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryInstructorReviewReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorReviewReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryInstructorReviewReadModelsInputSchema,
      request.data
    );

    try {
      let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
      if (input.scope === 'account_reviews') {
        if (!request.auth?.uid) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
        if (!parsedAccountId.success) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const accountSnapshot = await firestore.collection('users').doc(parsedAccountId.data).get();
        const account = parseAccount(
          accountSnapshot.data() as Record<string, unknown> | undefined
        );
        if (!account || account.lifecycle.status !== 'active') {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
        accountId = parsedAccountId.data;
      } else {
        const parsedAccountId = AccountIdSchema.safeParse(request.auth?.uid);
        if (parsedAccountId.success) {
          accountId = parsedAccountId.data;
        }
      }

      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(accountId ? { accountId, accountLifecycleStatus: 'active' as const } : {}),
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });
      return await queryInstructorReviewReadModels(firestore, input, {
        accountId,
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof InvalidInstructorReviewReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
