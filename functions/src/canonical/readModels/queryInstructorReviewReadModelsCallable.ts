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

export function createQueryInstructorReviewReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorReviewReadModelsResult> => {
    const parsed = QueryInstructorReviewReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    if (parsed.data.scope === 'account_reviews') {
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
    }

    try {
      return await queryInstructorReviewReadModels(firestore, parsed.data, { accountId });
    } catch (error) {
      if (error instanceof InvalidInstructorReviewReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
