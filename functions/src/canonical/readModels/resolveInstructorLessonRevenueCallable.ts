import { z } from 'zod';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  INSTRUCTOR_LESSON_REVENUE_STATE_PATH,
  instructorLessonRevenuePath,
} from '@ski-academy/shared-domain';
import { parseAccount } from '../finance/financeStore';
import { createReadModelRequestContext } from './readModelRequestContext';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

/** Resolves only the caller's sanitized subscription; accepts no instructor ID. */
export function createResolveInstructorLessonRevenueHandler(firestore: Firestore) {
  return async (request: CallableRequest<Record<string, unknown>>) => {
    const identity = AccountIdSchema.safeParse(request.auth?.uid);
    if (!identity.success) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const { requestedTestSessionId } = parseReadModelCallableData(
      z.object({ idempotencyKey: z.string().max(256).optional() }).strict(),
      request.data
    );
    try {
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId: identity.data,
          accountLifecycleStatus: 'active',
          isAdministrator: false,
          requestedTestSessionId,
        }
      );
      const context = createReadModelRequestContext(firestore, { readScope });
      const snapshot = await context.account(identity.data);
      const account = parseAccount(snapshot.data());
      const instructorId = resolveCallableInstructorId(readCallableAccountProfile(snapshot.data()));
      if (!account || account.lifecycle.status !== 'active' || !instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      return {
        summaryPath: instructorLessonRevenuePath(readScope, instructorId),
        statePath: INSTRUCTOR_LESSON_REVENUE_STATE_PATH,
      };
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
