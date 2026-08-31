import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminIdentityReadModelsInputSchema,
  type QueryAdminIdentityReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminIdentityReadCursorError,
  queryAdminIdentityReadModels,
} from './adminIdentityReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';

export function createQueryAdminIdentityReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminIdentityReadModelsResult> => {
    const parsed = QueryAdminIdentityReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    try {
      return await queryAdminIdentityReadModels(firestore, actor, parsed.data);
    } catch (error) {
      if (error instanceof InvalidAdminIdentityReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
