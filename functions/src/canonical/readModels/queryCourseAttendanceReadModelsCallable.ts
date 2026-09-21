import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseAttendanceReadModelsInputSchema,
  type QueryCourseAttendanceReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryCourseAttendanceReadModels } from './courseAttendanceReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryCourseAttendanceReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryCourseAttendanceReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryCourseAttendanceReadModelsInputSchema,
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

      let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
      if (input.scope === 'instructor_roster') {
        const userSnap = await readContext.account(parsedAccountId.data);
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      return await queryCourseAttendanceReadModels(firestore, input, {
        accountId: parsedAccountId.data,
        instructorId,
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof ReadModelAccessDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
