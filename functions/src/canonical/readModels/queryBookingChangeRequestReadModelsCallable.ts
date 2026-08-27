import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryBookingChangeRequestReadModelsInputSchema,
  rejectSpoofedBookingChangeRequestReadInput,
  type QueryBookingChangeRequestReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryBookingChangeRequestReadModels } from './bookingChangeRequestReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';

export function createQueryBookingChangeRequestReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryBookingChangeRequestReadModelsResult> => {
    const raw = request.data ?? {};
    rejectSpoofedBookingChangeRequestReadInput(raw);

    const parsed = QueryBookingChangeRequestReadModelsInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    if (parsed.data.scope === 'instructor_open') {
      const userSnap = await firestore.collection('users').doc(request.auth.uid).get();
      instructorId = resolveCallableInstructorId(
        readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
      );
      if (!instructorId) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
    }

    return queryBookingChangeRequestReadModels(firestore, parsed.data, {
      accountId: parsedAccountId.data,
      instructorId,
    });
  };
}
