import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminCourseEnrollmentReadModelsInputSchema,
  type QueryAdminCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';
import {
  InvalidAdminCourseEnrollmentCursorError,
  queryAdminCourseEnrollmentReadModels,
} from './adminCourseEnrollmentReadModels';
import { createReadModelRequestContext } from './readModelRequestContext';

export function createQueryAdminCourseEnrollmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminCourseEnrollmentReadModelsResult> => {
    const parsed = QueryAdminCourseEnrollmentReadModelsInputSchema.safeParse(request.data);
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
      return await queryAdminCourseEnrollmentReadModels(firestore, actor, parsed.data, {
        readContext,
      });
    } catch (error) {
      if (error instanceof InvalidAdminCourseEnrollmentCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
