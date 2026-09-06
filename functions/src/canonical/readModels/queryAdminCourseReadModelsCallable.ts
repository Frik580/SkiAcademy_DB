import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminCourseReadModelsInputSchema,
  type QueryAdminCourseReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { queryAdminCourseReadModels } from './adminCourseReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';

export function createQueryAdminCourseReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminCourseReadModelsResult> => {
    const parsed = QueryAdminCourseReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }
    const readContext = createReadModelRequestContext(firestore);
    const actor = await resolveCallableAdministratorActor(
      firestore,
      request.auth?.uid,
      readContext
    );
    try {
      return await queryAdminCourseReadModels(firestore, actor, parsed.data, { readContext });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_cursor') {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
