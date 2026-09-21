import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryInstructorCourseAssignmentReadModelsInputSchema,
  type QueryInstructorCourseAssignmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryInstructorCourseAssignmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorCourseAssignmentReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryInstructorCourseAssignmentReadModelsInputSchema,
      request.data
    );

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    try {
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId: parsedAccountId.data,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });
      const userSnap = await readContext.account(parsedAccountId.data);
      const instructorId = resolveCallableInstructorId(
        readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
      );
      if (!instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }

      return await queryInstructorCourseAssignmentReadModels(firestore, input, {
        instructorId,
        readContext,
        readScope,
      });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
