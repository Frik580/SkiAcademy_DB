import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryBookingProposalReadModelsInputSchema,
  rejectSpoofedBookingProposalReadInput,
  type QueryBookingProposalReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryBookingProposalReadModels } from './bookingProposalReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';
import { resolveCanonicalReadScope } from '../testSessions/canonicalReadScopeResolver';
import { createFirestoreCanonicalExecutionScopeStore } from '../testSessions/canonicalExecutionScopeResolver';

export function createQueryBookingProposalReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryBookingProposalReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedBookingProposalReadInput(raw);
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryBookingProposalReadModelsInputSchema,
      raw
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
      if (input.scope === 'instructor_open') {
        const userSnap = await readContext.account(parsedAccountId.data);
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }

      return await queryBookingProposalReadModels(firestore, input, {
        accountId: parsedAccountId.data,
        instructorId,
        readContext,
        readScope,
      });
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
