import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryLessonPricingSettingsReadModelInputSchema,
  type QueryLessonPricingSettingsReadModelResult,
} from '@ski-academy/shared-domain';
import { parseAccount } from '../participantAccess/participantAccessStore';
import { queryLessonPricingSettingsReadModel } from './lessonPricingSettingsReadModels';

export function createQueryLessonPricingSettingsReadModelHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryLessonPricingSettingsReadModelResult> => {
    const parsed = QueryLessonPricingSettingsReadModelInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }
    const accountId = AccountIdSchema.safeParse(request.auth?.uid);
    if (!accountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const accountSnapshot = await firestore.doc(`users/${accountId.data}`).get();
    const account = parseAccount(
      accountSnapshot.exists ? (accountSnapshot.data() as Record<string, unknown>) : undefined
    );
    if (!account || account.lifecycle.status !== 'active') {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }
    return queryLessonPricingSettingsReadModel(firestore);
  };
}
