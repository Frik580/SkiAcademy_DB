import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseEnrollmentReadModelsInputSchema,
  type QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidCourseEnrollmentReadCursorError,
  queryCourseEnrollmentReadModels,
} from './courseEnrollmentReadModels';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryCourseEnrollmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryCourseEnrollmentReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryCourseEnrollmentReadModelsInputSchema,
      request.data
    );

    const isGuestScope = input.scope === 'guest_single';
    const isAuthenticatedScope =
      input.scope === 'account_hot' ||
      input.scope === 'account_history' ||
      input.scope === 'instructor_roster';

    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;

    try {
      if (isAuthenticatedScope) {
        if (!request.auth?.uid) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
        if (!parsedAccountId.success) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        accountId = parsedAccountId.data;
      }

      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(isGuestScope ? {} : { accountId, accountLifecycleStatus: 'active' as const }),
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const readContext = createReadModelRequestContext(firestore, { readScope });

      if (input.scope === 'instructor_roster' && accountId) {
        const userSnap = await readContext.account(accountId);
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      return await queryCourseEnrollmentReadModels(firestore, input, {
        accountId,
        instructorId,
        guestActionSecret: readGuestActionTokenSecret(),
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof InvalidCourseEnrollmentReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid for this query.');
      }
      if (error instanceof ReadModelAccessDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
