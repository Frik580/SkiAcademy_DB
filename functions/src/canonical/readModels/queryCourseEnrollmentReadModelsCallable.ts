import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryCourseEnrollmentReadModelsInputSchema,
  type QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryCourseEnrollmentReadModels } from './courseEnrollmentReadModels';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';

export function createQueryCourseEnrollmentReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryCourseEnrollmentReadModelsResult> => {
    const parsed = QueryCourseEnrollmentReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const input = parsed.data;
    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;

    if (
      input.scope === 'account_hot' ||
      input.scope === 'account_history' ||
      input.scope === 'instructor_roster'
    ) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!parsedAccountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      accountId = parsedAccountId.data;

      if (input.scope === 'instructor_roster') {
        const userSnap = await firestore.collection('users').doc(request.auth.uid).get();
        instructorId = resolveCallableInstructorId(
          readCallableAccountProfile(userSnap.data() as Record<string, unknown> | undefined)
        );
        if (!instructorId) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
      }
    }

    try {
      return await queryCourseEnrollmentReadModels(firestore, input, {
        accountId,
        instructorId,
        guestActionSecret: readGuestActionTokenSecret(),
      });
    } catch (error) {
      if (error instanceof ReadModelAccessDeniedError) {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      throw error;
    }
  };
}
