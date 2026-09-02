import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminPlannerReadModelsInputSchema,
  type QueryAdminPlannerReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import { queryAdminPlannerReadModels } from './adminPlannerReadModels';

export function createQueryAdminPlannerReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminPlannerReadModelsResult> => {
    const parsed = QueryAdminPlannerReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }
    const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    return queryAdminPlannerReadModels(firestore, actor, parsed.data);
  };
}
