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
import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { scopedReadCursor } from '../../security/scopedReadCursor';
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
  readScope: CanonicalReadScope,
  readDays = (courseId: Course['courseId']) =>
    firestore.collection(courseDaysCollectionPath(courseId)).get()
): Promise<CourseCatalogReadModel | undefined> {
  const dayDocuments = await readDays(course.courseId);
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

const CATALOG_PAGE_SIZE = 50;

async function queryCatalogPage(
  firestore: Firestore,
  input: QueryCourseCatalogReadModelsInput,
  page: NonNullable<QueryCourseCatalogReadModelsInput['page']>,
  now: ReturnType<typeof timestampFromDate>,
  readScope: CanonicalReadScope,
  secret: string,
  principalId: string | undefined
): Promise<QueryCourseCatalogReadModelsResult> {
  const scopeKey =
    readScope.dataScope === 'live' ? 'live' : `test/sessions/${readScope.testSessionId}`;
  const codec = scopedReadCursor(
    secret,
    JSON.stringify(['course_catalog', input.scope, scopeKey, principalId ?? ''])
  );
  let values: unknown[] = [];
  if (page.cursor) {
    try {
      values = codec.decode(page.cursor);
    } catch {
      throw new HttpsError('failed-precondition', 'Catalog continuation is no longer valid.');
    }
  }
  const [after, readTime] = values;
  if (page.cursor && (typeof after !== 'string' || !(readTime instanceof Timestamp))) {
    throw new HttpsError('invalid-argument', 'Invalid catalog cursor.');
  }
  if (readTime instanceof Timestamp && Date.now() - readTime.toMillis() >= 55_000) {
    throw new HttpsError('aborted', 'Catalog snapshot expired.');
  }
  let query = firestore.collection('courses').orderBy(FieldPath.documentId());
  if (readScope.dataScope === 'test') {
    query = query
      .where('dataScope', '==', 'test')
      .where('testSessionId', '==', readScope.testSessionId);
  }
  if (typeof after === 'string') query = query.startAfter(after);
  return firestore.runTransaction(
    async (tx) => {
      const [snapshot, courseSignal, contentSignal] = await Promise.all([
        tx.get(query.limit(CATALOG_PAGE_SIZE + 1)),
        tx.get(firestore.doc(`client_read_runtime/${scopeKey}/collections/courses`)),
        tx.get(firestore.doc(`client_read_runtime/${scopeKey}/collections/course_catalog_content`)),
      ]);
      const scanned = snapshot.docs.slice(0, CATALOG_PAGE_SIZE);
      const courses = scanned.flatMap((doc) => {
        const course = parseIfVisibleInReadScope(doc.data(), parseCourse, readScope);
        return course?.courseId === doc.id && course.lifecycle === 'active' ? [course] : [];
      });
      const contents = courses.length
        ? await tx.getAll(
            ...courses.map((course) => firestore.doc(`course_catalog_content/${course.courseId}`))
          )
        : [];
      const items = await Promise.all(
        courses.map(async (course, index) => {
          const content = parseIfVisibleInReadScope(
            contents[index]?.data(),
            parseCourseCatalogContent,
            readScope
          );
          if (!content || content.courseId !== course.courseId || content.isHidden)
            return undefined;
          const item = await buildCourseCatalogReadModel(
            firestore,
            course,
            now,
            readScope,
            (courseId) => tx.get(firestore.collection(courseDaysCollectionPath(courseId)).limit(65))
          );
          return item && { ...item, presentation: catalogPresentation(content) };
        })
      );
      const snapshotTime = readTime instanceof Timestamp ? readTime : snapshot.readTime;
      return {
        scope: input.scope,
        items: items.filter((item): item is NonNullable<typeof item> => Boolean(item)),
        page: {
          next:
            snapshot.size > CATALOG_PAGE_SIZE
              ? codec.encode([
                  scanned.at(-1)!.id,
                  { timestamp: [snapshotTime.seconds, snapshotTime.nanoseconds] },
                ])
              : null,
          scopeKey,
          revisions: [courseSignal.get('revision') ?? null, contentSignal.get('revision') ?? null],
        },
      };
    },
    { readOnly: true, ...(readTime instanceof Timestamp ? { readTime } : {}) }
  );
}

export async function queryCourseCatalogReadModels(
  firestore: Firestore,
  input: QueryCourseCatalogReadModelsInput,
  options: {
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
    readonly pageSecret?: string;
    readonly principalId?: string;
  } = {}
): Promise<QueryCourseCatalogReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());
  const readScope =
    options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  if (input.page) {
    if (!options.pageSecret) throw new HttpsError('internal', 'Catalog pagination is unavailable.');
    return queryCatalogPage(
      firestore,
      input,
      input.page,
      now,
      readScope,
      options.pageSecret,
      options.principalId
    );
  }
  const readContext =
    options.readContext ?? createReadModelRequestContext(firestore, { readScope });
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
