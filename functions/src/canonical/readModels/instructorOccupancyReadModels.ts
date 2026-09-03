import type { Firestore } from 'firebase-admin/firestore';
import {
  InstructorOccupancyReadModelSchema,
  QueryInstructorOccupancyReadModelsInput,
  QueryInstructorOccupancyReadModelsResultSchema,
  type QueryInstructorOccupancyReadModelsResult,
} from '@ski-academy/shared-domain';
import { parseInstructorCatalog } from '../bookings/bookingStore';
import {
  instructorOccupancyWindow,
  loadInstructorOccupancyItems,
  sanitizePublicInstructorOccupancy,
} from './instructorOccupancyReadSupport';

export async function queryInstructorOccupancyReadModels(
  firestore: Firestore,
  input: QueryInstructorOccupancyReadModelsInput
): Promise<QueryInstructorOccupancyReadModelsResult> {
  const window = instructorOccupancyWindow(input.localDate, input.timeZone, 1);

  const instructorSnap = await firestore.collection('instructors').doc(input.instructorId).get();
  const instructor = parseInstructorCatalog(
    input.instructorId,
    instructorSnap.data() as Record<string, unknown> | undefined
  );
  if (!instructor || instructor.isAvailable === false) {
    const emptyItem = InstructorOccupancyReadModelSchema.parse({
      instructorId: input.instructorId,
      localDate: input.localDate,
      timeZone: input.timeZone,
      window,
      occupancy: [],
      truncated: false,
    });
    return QueryInstructorOccupancyReadModelsResultSchema.parse({
      scope: 'public_instructor_day',
      item: emptyItem,
    });
  }

  const loaded = await loadInstructorOccupancyItems(firestore, {
    window,
    instructorId: input.instructorId,
  });

  const item = InstructorOccupancyReadModelSchema.parse({
    instructorId: input.instructorId,
    localDate: input.localDate,
    timeZone: input.timeZone,
    window,
    occupancy: sanitizePublicInstructorOccupancy(loaded.occupancy),
    truncated: loaded.truncated,
  });

  return QueryInstructorOccupancyReadModelsResultSchema.parse({
    scope: 'public_instructor_day',
    item,
  });
}
