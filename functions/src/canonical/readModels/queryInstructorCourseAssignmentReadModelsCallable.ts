import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryInstructorCourseAssignmentReadModelsInputSchema,
  type QueryInstructorCourseAssignmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';

export function createQueryInstructorCourseAssignmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorCourseAssignmentReadModelsResult> => {
    const parsed = QueryInstructorCourseAssignmentReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
    if (!parsedAccountId.success) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const userSnap = await firestore.collection('users').doc(request.auth.uid).get();
    const instructorId = resolveCallableInstructorId(
      readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
    );
    if (!instructorId) {
      throw new HttpsError('permission-denied', 'This action is not permitted.');
    }

    return queryInstructorCourseAssignmentReadModels(firestore, parsed.data, { instructorId });
  };
}
