import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryLessonBookingReadModelsInputSchema,
  type QueryLessonBookingReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import {
  InvalidLessonBookingReadCursorError,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryLessonBookingReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryLessonBookingReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryLessonBookingReadModelsInputSchema,
      request.data
    );

    const isAdminScope =
      input.scope === 'admin_hot' ||
      input.scope === 'admin_pending_guest' ||
      input.scope === 'admin_history' ||
      input.scope === 'admin_detail';
    const isGuestScope = input.scope === 'guest_single';
    const isAuthenticatedScope =
      input.scope === 'account_hot' ||
      input.scope === 'account_history' ||
      input.scope === 'account_calendar_month' ||
      input.scope === 'instructor_hot' ||
      input.scope === 'instructor_history';

    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    let administratorActor: ReadModelAdministratorActor | undefined;
    const liveContext = createReadModelRequestContext(firestore);

    try {
      if (isAdminScope) {
        administratorActor = await resolveCallableAdministratorActor(
          firestore,
          request.auth?.uid,
          liveContext
        );
      }

      if (isAuthenticatedScope) {
        if (!request.auth?.uid) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
        if (!parsedAccountId.success) {
          throw new HttpsError('unauthenticated', 'Authentication is required.');
        }
        const userSnap = await liveContext.account(parsedAccountId.data);
        const profileData = userSnap.data() as Record<string, unknown> | undefined;
        const account = parseAccount(profileData);
        if (!account || account.lifecycle.status !== 'active') {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
        accountId = parsedAccountId.data;

        if (input.scope === 'instructor_hot' || input.scope === 'instructor_history') {
          instructorId = resolveCallableInstructorId(readCallableAccountProfile(profileData));
          if (!instructorId) {
            throw new HttpsError('permission-denied', 'This action is not permitted.');
          }
        }
      }

      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          ...(isGuestScope
            ? {}
            : {
                accountId: accountId ?? administratorActor?.accountId,
                accountLifecycleStatus: 'active' as const,
              }),
          isAdministrator: isAdminScope,
          requestedTestSessionId,
        }
      );
      const readContext =
        readScope.dataScope === 'live'
          ? liveContext
          : createReadModelRequestContext(firestore, { readScope });
      return await queryLessonBookingReadModels(firestore, input, {
        accountId,
        instructorId,
        administratorActor,
        guestActionSecret: readGuestActionTokenSecret(),
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof InvalidLessonBookingReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
