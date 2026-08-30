import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminIssueReadModelsInputSchema,
  type QueryAdminIssueReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminIssueReadCursorError,
  queryAdminIssueReadModels,
} from './adminIssueReadModels';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';

export function createQueryAdminIssueReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminIssueReadModelsResult> => {
    const parsed = QueryAdminIssueReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const actor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    try {
      return await queryAdminIssueReadModels(firestore, actor, parsed.data);
    } catch (error) {
      if (error instanceof InvalidAdminIssueReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
