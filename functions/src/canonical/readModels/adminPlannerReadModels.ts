import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  AdminPlannerInstructorPresentationSchema,
  AdminPlannerReadModelSchema,
  QueryAdminPlannerReadModelsResultSchema,
  parseInstructorCatalogRevision,
  type AdminPlannerOccupancyItem,
  type QueryAdminPlannerReadModelsInput,
  type QueryAdminPlannerReadModelsResult,
  type ReadModelAdministratorActor,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import { parseInstructorCatalog } from '../bookings/bookingStore';
import { sanitizeInstructorPresentationAvatarUrl } from './instructorPresentationAvatar';
import {
  instructorOccupancyWindow,
  loadInstructorOccupancyItems,
} from './instructorOccupancyReadSupport';
import { type ReadModelRequestContext } from './readModelRequestContext';
import { parseIfVisibleInReadScope } from './readModelScope';

async function paginateInstructors(
  firestore: Firestore,
  readScope: CanonicalReadScope
): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await firestore.collection('instructors').limit(64).get();
  return snapshot.docs.filter((doc) =>
    Boolean(
      parseIfVisibleInReadScope(
        doc.data(),
        (data) => parseInstructorCatalog(doc.id, data),
        readScope,
        'identity'
      )
    )
  );
}

export async function queryAdminPlannerReadModels(
  firestore: Firestore,
  _actor: ReadModelAdministratorActor,
  input: QueryAdminPlannerReadModelsInput,
  options: {
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryAdminPlannerReadModelsResult> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const window = instructorOccupancyWindow(
    input.localDate,
    input.timeZone,
    input.windowDays ?? (input.view === 'week' ? 7 : 1)
  );

  const instructorSnap = await paginateInstructors(firestore, readScope);
  const instructors = instructorSnap
    .map((document) => {
      const record = parseInstructorCatalog(
        document.id,
        document.data() as Record<string, unknown>
      );
      if (!record) return undefined;
      const avatarUrl = sanitizeInstructorPresentationAvatarUrl(record.avatarUrl);
      return AdminPlannerInstructorPresentationSchema.parse({
        instructorId: record.instructorId,
        name: record.name,
        ...(record.pricePerHourKZT !== undefined
          ? { pricePerHourKZT: Math.round(record.pricePerHourKZT) }
          : {}),
        isAvailable: record.isAvailable !== false,
        revision: parseInstructorCatalogRevision(document.data() as Record<string, unknown>),
        ...(avatarUrl ? { avatarUrl } : {}),
      });
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  const loaded = await loadInstructorOccupancyItems(firestore, {
    window,
    bookingScope: 'admin_planner_visualization',
    readScope,
  });
  const occupancy: AdminPlannerOccupancyItem[] = loaded.occupancy;

  const item = AdminPlannerReadModelSchema.parse({
    view: input.view,
    localDate: input.localDate,
    timeZone: input.timeZone,
    window,
    instructors,
    occupancy,
    truncated: loaded.truncated,
  });

  return QueryAdminPlannerReadModelsResultSchema.parse({
    scope: 'admin_planner',
    item,
  });
}
