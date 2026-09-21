import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryAdminCourseEnrollmentReadModelsInputSchema,
  type QueryAdminCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import {
  InvalidAdminCourseEnrollmentCursorError,
  queryAdminCourseEnrollmentReadModels,
} from './adminCourseEnrollmentReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryAdminCourseEnrollmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryAdminCourseEnrollmentReadModelsResult> => {
    const { input, requestedTestSessionId } = parseReadModelCallableData(
      QueryAdminCourseEnrollmentReadModelsInputSchema,
      request.data
    );
    try {
      const { actor, readScope, readContext } = await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryAdminCourseEnrollmentReadModels(firestore, actor, input, {
        readContext,
        readScope,
      });
    } catch (error) {
      if (error instanceof InvalidAdminCourseEnrollmentCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      rethrowReadScopeHttpsError(error);
    }
  };
}
