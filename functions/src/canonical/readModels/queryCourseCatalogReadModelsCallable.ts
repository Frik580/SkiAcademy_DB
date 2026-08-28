import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseCatalogReadModelsInputSchema,
  type QueryCourseCatalogReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryCourseCatalogReadModels } from './courseCatalogReadModels';

export function createQueryCourseCatalogReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryCourseCatalogReadModelsResult> => {
    const parsed = QueryCourseCatalogReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    if (parsed.data.scope === 'authenticated') {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const accountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!accountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
    }

    return queryCourseCatalogReadModels(firestore, parsed.data);
  };
}
