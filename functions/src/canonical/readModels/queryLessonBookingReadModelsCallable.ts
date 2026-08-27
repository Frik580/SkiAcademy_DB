import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  QueryLessonBookingReadModelsInputSchema,
  type QueryLessonBookingReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from './lessonBookingReadModels';
import { readGuestActionTokenSecret } from '../commands/canonicalCommandRuntime';

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

    if (input.scope === 'account_hot' || input.scope === 'account_history') {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      const parsedAccountId = AccountIdSchema.safeParse(request.auth.uid);
      if (!parsedAccountId.success) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
      }
      accountId = parsedAccountId.data;
    }

    return queryLessonBookingReadModels(firestore, input, {
      accountId,
      guestActionSecret: readGuestActionTokenSecret(),
    });
  };
}
