import type { Firestore } from 'firebase-admin/firestore';
import {
  InstructorOccupancyReadModelSchema,
  QueryInstructorOccupancyReadModelsInput,
  QueryInstructorOccupancyReadModelsResultSchema,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
  type QueryInstructorOccupancyReadModelsResult,
} from '@ski-academy/shared-domain';
import { parseInstructorCatalog } from '../bookings/bookingStore';
import {
  instructorOccupancyWindow,
  loadInstructorOccupancyItems,
  sanitizePublicInstructorOccupancy,
} from './instructorOccupancyReadSupport';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

export async function queryInstructorOccupancyReadModels(
  firestore: Firestore,
  input: QueryInstructorOccupancyReadModelsInput,
  options: {
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryInstructorOccupancyReadModelsResult> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });
  const window = instructorOccupancyWindow(input.localDate, input.timeZone, 1);

  const instructorSnap = await readContext.instructor(input.instructorId);
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
    readScope,
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
