import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminCourseReadModelsInputSchema,
  type QueryAdminCourseReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { queryAdminCourseReadModels } from './adminCourseReadModels';

export function createQueryAdminCourseReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminCourseReadModelsResult> => {
    const parsed = QueryAdminCourseReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }
    const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    return queryAdminCourseReadModels(firestore, actor, parsed.data);
  };
}
