import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryLessonBookingReadModelsInputSchema,
  type QueryLessonBookingReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import {
  InvalidLessonBookingReadCursorError,
  queryLessonBookingReadModels,
} from './lessonBookingReadModels';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';
import {
  readCallableAccountProfile,
  resolveCallableInstructorId,
} from './resolveCallableInstructorId';
import { resolveCallableAdministratorActor } from './resolveCallableAdministrator';

export function createQueryLessonBookingReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryLessonBookingReadModelsResult> => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const input = parsed.data;
    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    let administratorActor: ReadModelAdministratorActor | undefined;

    if (
      input.scope === 'admin_hot' ||
      input.scope === 'admin_history' ||
      input.scope === 'admin_detail'
    ) {
      administratorActor = await resolveCallableAdministratorActor(firestore, request.auth?.uid);
    }

    if (
      input.scope === 'account_hot' ||
      input.scope === 'account_history' ||
      input.scope === 'instructor_hot'
    ) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!parsedAccountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      accountId = parsedAccountId.data;

      if (input.scope === 'instructor_hot') {
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
      return await queryLessonBookingReadModels(firestore, input, {
        accountId,
        instructorId,
        administratorActor,
        guestActionSecret: readGuestActionTokenSecret(),
      });
    } catch (error) {
      if (error instanceof InvalidLessonBookingReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
