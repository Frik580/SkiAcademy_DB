import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminFinanceReadModelsInputSchema,
  type QueryAdminFinanceReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminFinanceReadCursorError,
  queryAdminFinanceReadModels,
} from './adminFinanceReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';

export function createQueryAdminFinanceReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminFinanceReadModelsResult> => {
    const parsed = QueryAdminFinanceReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    try {
      return await queryAdminFinanceReadModels(firestore, actor, parsed.data);
    } catch (error) {
      if (error instanceof InvalidAdminFinanceReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
