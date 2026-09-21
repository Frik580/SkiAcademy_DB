import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryBookingChangeRequestReadModelsInputSchema,
  rejectSpoofedBookingChangeRequestReadInput,
  type QueryBookingChangeRequestReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  BookingChangeRequestAdminReadForbiddenError,
  queryBookingChangeRequestReadModels,
} from './bookingChangeRequestReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryBookingChangeRequestReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryBookingChangeRequestReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedBookingChangeRequestReadInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryBookingChangeRequestReadModelsInputSchema,
      raw
    );

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const isAdminScope = input.scope === 'admin_open' || input.scope === 'admin_detail';

    const liveContext = createReadModelRequestContext(firestore);
    try {
      const administratorActor = isAdminScope
        ? await resolveCallableAdministratorActor(firestore, request.auth.uid, liveContext)
        : undefined;
      const readScope = await resolveCanonicalReadScope(
        createFirestoreCanonicalExecutionScopeStore(firestore),
        {
          accountId: parsedAccountId.data,
          accountLifecycleStatus: 'active',
          isAdministrator: isAdminScope,
          requestedTestSessionId,
        }
      );
      const readContext =
        readScope.dataScope === 'live'
          ? liveContext
          : createReadModelRequestContext(firestore, { readScope });

      if (isAdminScope) {
        return await queryBookingChangeRequestReadModels(firestore, input, {
          accountId: parsedAccountId.data,
          administratorActor,
          readContext,
          readScope,
        });
      }

      let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
      if (input.scope === 'instructor_open') {
        const userSnap = await readContext.account(parsedAccountId.data);
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      return await queryBookingChangeRequestReadModels(firestore, input, {
        accountId: parsedAccountId.data,
        instructorId,
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof BookingChangeRequestAdminReadForbiddenError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
