import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryInstructorOccupancyReadModelsInputSchema,
  type QueryInstructorOccupancyReadModelsResult,
} from '@ski-academy/shared-domain';
import { queryInstructorOccupancyReadModels } from './instructorOccupancyReadModels';

export function createQueryInstructorOccupancyReadModelsHandler(firestore: Firestore) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryInstructorOccupancyReadModelsResult> => {
    const parsed = QueryInstructorOccupancyReadModelsInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'The request is invalid.');
    }

    return queryInstructorOccupancyReadModels(firestore, parsed.data);
  };
}
