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
import { createReadModelRequestContext } from './readModelRequestContext';
import { parseAccount } from '../participantAccess/participantAccessStore';

export function createQueryLessonBookingReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryLessonBookingReadModelsResult> => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    const input = parsed.data;
    const readContext = createReadModelRequestContext(firestore);
    let accountId: ReturnType<typeof AccountIdSchema.parse> | undefined;
    let instructorId: ReturnType<typeof resolveCallableInstructorId> | undefined;
    let administratorActor: ReadModelAdministratorActor | undefined;

    if (
      input.scope === 'admin_hot' ||
      input.scope === 'admin_history' ||
      input.scope === 'admin_detail'
    ) {
      administratorActor = await resolveCallableAdministratorActor(
        firestore,
        request.auth?.uid,
        readContext
      );
    }

    if (
      input.scope === 'account_hot' ||
      input.scope === 'account_history' ||
      input.scope === 'instructor_hot' ||
      input.scope === 'instructor_history'
    ) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!parsedAccountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const userSnap = await readContext.account(parsedAccountId.data);
      const profileData = userSnap.data() as Record<string, unknown> | undefined;
      const account = parseAccount(profileData);
      if (!account || account.lifecycle.status !== 'active') {
        throw new HttpsError('permission-denied', 'This action is not permitted.');
      }
      accountId = parsedAccountId.data;

      if (input.scope === 'instructor_hot' || input.scope === 'instructor_history') {
        instructorId = resolveCallableInstructorId(readCallableAccountProfile(profileData));
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
        readContext,
      });
    } catch (error) {
      if (error instanceof InvalidLessonBookingReadCursorError) {
        throw new HttpsError('invalid-argument', 'The cursor is invalid.');
      }
      throw error;
    }
  };
}
