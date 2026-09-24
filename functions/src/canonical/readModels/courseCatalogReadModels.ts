import {
  evaluateCourseCatalogEnrollmentEligibility,
  isCourseCapacityFrozen,
  isCourseOperationalForEnrollment,
  sortedCourseDays,
  timestampFromDate,
  type Course,
  type CourseCatalogContent,
  type CourseCatalogReadModel,
  type QueryCourseCatalogReadModelsInput,
  type QueryCourseCatalogReadModelsResult,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseCourseCatalogContent } from '../courses/courseCatalogContentStore';
import { parseCourse, parseCourseDays, courseDaysCollectionPath } from '../courses/courseStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';
import { parseIfVisibleInReadScope, queryDocsMatchingReadScope } from './readModelScope';

const CATALOG_PRESENTATION_EXCLUDED_KEYS = [
  'courseId',
  'revision',
  'dataScope',
  'testSessionId',
] as const satisfies readonly (keyof CourseCatalogContent)[];

function catalogPresentation(
  content: CourseCatalogContent | undefined
): CourseCatalogReadModel['presentation'] {
  if (!content) return undefined;
  // Presentation is CourseCatalogContentInput: identity, revision, and canonical
  // scope stay on the course document / read-model root and must not leak here.
  const presentation: Record<string, unknown> = { ...content };
  for (const key of CATALOG_PRESENTATION_EXCLUDED_KEYS) {
    delete presentation[key];
  }
  return presentation as CourseCatalogReadModel['presentation'];
}

async function readCatalogPresentation(
  firestore: Firestore,
  courseId: Course['courseId'],
  readScope: CanonicalReadScope
): Promise<CourseCatalogReadModel['presentation']> {
  const snapshot = await firestore.collection('course_catalog_content').doc(courseId).get();
  const content = parseIfVisibleInReadScope(
    snapshot.exists ? snapshot.data() : undefined,
    (data) => parseCourseCatalogContent(data, courseId),
    readScope
  );
  return catalogPresentation(content);
}

async function buildCourseCatalogReadModel(
  firestore: Firestore,
  course: Course,
  now: ReturnType<typeof timestampFromDate>,
  readScope: CanonicalReadScope
): Promise<CourseCatalogReadModel | undefined> {
  const dayDocuments = await firestore.collection(courseDaysCollectionPath(course.courseId)).get();
  const courseDays = sortedCourseDays(
    parseCourseDays(
      queryDocsMatchingReadScope(dayDocuments.docs, readScope).map((doc) => ({
        data: doc.data() as Record<string, unknown>,
      }))
    )
  );
  if (!isCourseOperationalForEnrollment(course, courseDays)) {
    return undefined;
  }

  const isFrozen = isCourseCapacityFrozen({
    now,
    courseStartAt: course.startAt,
  });
  const isEligible = evaluateCourseCatalogEnrollmentEligibility({ now, course });

  return {
    courseId: course.courseId,
    revision: course.revision,
    title: course.title,
    price: course.price,
    capacity: {
      totalSeats: course.capacity.totalSeats,
      availableSeats: course.capacity.availableSeats,
      isCapacityFrozen: isFrozen,
      isEnrollmentEligible: isEligible,
      isFull: course.capacity.availableSeats <= 0,
    },
    scheduleSummary: {
      startAt: course.startAt,
      finalCourseDayEndsAt: course.scheduleProjection.finalCourseDayEndsAt,
      courseDayCount: course.scheduleProjection.courseDayCount,
    },
    courseSchedule: buildCourseScheduleProjectionReadModel(course, courseDays),
    updatedAt: course.updatedAt,
  };
}

export async function queryCourseCatalogReadModels(
  firestore: Firestore,
  input: QueryCourseCatalogReadModelsInput,
  options: {
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryCourseCatalogReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });
  const includePresentation = input.scope === 'product';

  if (input.scope === 'authenticated' || input.courseId) {
    const courseSnap = await readContext.course(input.courseId!);
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [] };
    }
    const item = await buildCourseCatalogReadModel(firestore, course, now, readScope);
    if (!item) {
      return { scope: input.scope, items: [] };
    }
    if (!includePresentation) {
      return { scope: input.scope, items: [item] };
    }
    const presentation = await readCatalogPresentation(firestore, course.courseId, readScope);
    return {
      scope: input.scope,
      items: [presentation ? { ...item, presentation } : item],
    };
  }

  const snapshot = await firestore.collection('courses').limit(50).get();
  const items: CourseCatalogReadModel[] = [];
  for (const doc of snapshot.docs) {
    const course = parseIfVisibleInReadScope(doc.data(), parseCourse, readScope);
    if (!course) {
      continue;
    }
    const item = await buildCourseCatalogReadModel(firestore, course, now, readScope);
    if (!item) {
      continue;
    }
    if (!includePresentation) {
      items.push(item);
      continue;
    }
    const presentation = await readCatalogPresentation(firestore, course.courseId, readScope);
    items.push(presentation ? { ...item, presentation } : item);
  }
  items.sort((left, right) => left.title.localeCompare(right.title));
  return { scope: input.scope, items };
}
