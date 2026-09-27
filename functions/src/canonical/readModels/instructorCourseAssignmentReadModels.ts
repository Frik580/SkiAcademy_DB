import {
  compareInstructorCourseAssignmentSortKeys,
  decodeInstructorCourseAssignmentReadModelCursor,
  encodeInstructorCourseAssignmentReadModelCursor,
  INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING,
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_DEFAULT,
  INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX,
  legacyCourseDocumentFailsCanonicalParse,
  QueryInstructorCourseAssignmentReadModelsResultSchema,
  resolveInstructorCourseAssignmentProjection,
  type InstructorCourseAssignmentReadModel,
  type InstructorCourseAssignmentReadModelCursor,
  type InstructorCourseAssignmentReadModelCursorReadScope,
  type InstructorId,
  type CourseId,
  type QueryInstructorCourseAssignmentReadModelsInput,
  type QueryInstructorCourseAssignmentReadModelsResult,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import {
  parseCourse,
  parseCourseDay,
  parseCourseDays,
  courseDaysCollectionPath,
} from '../courses/courseStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';
import { parseIfVisibleInReadScope, queryDocsMatchingReadScope } from './readModelScope';

type AssignmentSortKey = Readonly<{ title: string; courseId: CourseId }>;

type StreamCandidate = Readonly<{
  source: 'roster' | 'days';
  sortKey: AssignmentSortKey;
}>;

function readScopeToCursorScope(
  readScope: CanonicalReadScope
): InstructorCourseAssignmentReadModelCursorReadScope {
  if (readScope.dataScope === 'test') {
    return { dataScope: 'test', testSessionId: readScope.testSessionId };
  }
  return { dataScope: 'live' };
}

function cursorScopeMatchesReadScope(
  cursorScope: InstructorCourseAssignmentReadModelCursorReadScope,
  readScope: CanonicalReadScope
): boolean {
  if (cursorScope.dataScope !== readScope.dataScope) {
    return false;
  }
  if (cursorScope.dataScope === 'test') {
    return readScope.dataScope === 'test' && cursorScope.testSessionId === readScope.testSessionId;
  }
  return readScope.dataScope === 'live';
}

function createInitialDiscoveryCursor(
  instructorId: InstructorId,
  readScope: CanonicalReadScope
): InstructorCourseAssignmentReadModelCursor {
  return {
    instructorId,
    readScope: readScopeToCursorScope(readScope),
    roster: { exhausted: false },
    days: { exhausted: false },
  };
}

function isAfterLastEmitted(
  sortKey: AssignmentSortKey,
  lastEmitted: AssignmentSortKey | undefined
): boolean {
  if (!lastEmitted) {
    return true;
  }
  return compareInstructorCourseAssignmentSortKeys(sortKey, lastEmitted) > 0;
}

async function buildInstructorCourseAssignmentReadModel(
  firestore: Firestore,
  instructorId: InstructorId,
  courseId: CourseId,
  readContext: ReadModelRequestContext,
  readScope: CanonicalReadScope
): Promise<InstructorCourseAssignmentReadModel | undefined> {
  const courseSnap = await readContext.course(courseId);
  if (
    legacyCourseDocumentFailsCanonicalParse(courseSnap.data() as Record<string, unknown> | undefined)
  ) {
    return undefined;
  }
  const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
  if (!course) {
    return undefined;
  }

  const courseDays = parseCourseDays(
    queryDocsMatchingReadScope(
      (await firestore.collection(courseDaysCollectionPath(course.courseId)).get()).docs,
      readScope
    ).map((doc) => ({
      data: doc.data() as Record<string, unknown>,
    }))
  );
  const assignment = resolveInstructorCourseAssignmentProjection({
    instructorId,
    course,
    courseDays,
  });
  if (!assignment.allowed || assignment.assignedCourseDayIds.length === 0) {
    return undefined;
  }

  return {
    courseId: course.courseId,
    revision: course.revision,
    title: course.title,
    courseSchedule: buildCourseScheduleProjectionReadModel(course, courseDays),
    assignedCourseDayIds: [...assignment.assignedCourseDayIds],
    updatedAt: course.updatedAt,
  };
}

class RosterDiscoveryStream {
  private scans = 0;

  constructor(
    private readonly firestore: Firestore,
    private readonly instructorId: InstructorId,
    private readonly readScope: CanonicalReadScope,
    private rosterState: InstructorCourseAssignmentReadModelCursor['roster']
  ) {}

  get exhausted(): boolean {
    return this.rosterState.exhausted;
  }

  get scanCount(): number {
    return this.scans;
  }

  async nextCandidate(): Promise<AssignmentSortKey | undefined> {
    if (this.rosterState.exhausted) {
      return undefined;
    }
    let query: Query = this.firestore
      .collection('courses')
      .where('instructorRosterIds', 'array-contains', this.instructorId)
      .where('lifecycle', '==', 'active')
      .orderBy('title', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');
    if (this.rosterState.title !== undefined && this.rosterState.documentId !== undefined) {
      query = query.startAfter(this.rosterState.title, this.rosterState.documentId);
    }
    const snapshot = await query.limit(1).get();
    this.scans += snapshot.docs.length;
    if (snapshot.docs.length === 0) {
      this.rosterState = { exhausted: true };
      return undefined;
    }
    const document = snapshot.docs[0]!;
    this.rosterState = {
      exhausted: false,
      title: String(document.get('title')),
      documentId: document.id as CourseId,
    };
    if (legacyCourseDocumentFailsCanonicalParse(document.data() as Record<string, unknown>)) {
      return this.nextCandidate();
    }
    const course = parseIfVisibleInReadScope(document.data(), parseCourse, this.readScope);
    if (!course || course.lifecycle !== 'active') {
      return this.nextCandidate();
    }
    return { title: course.title, courseId: course.courseId };
  }

  snapshotState(): InstructorCourseAssignmentReadModelCursor['roster'] {
    return this.rosterState;
  }
}

class DayDiscoveryStream {
  private scans = 0;
  private readonly dayUniqueCourseIds = new Set<CourseId>();

  constructor(
    private readonly firestore: Firestore,
    private readonly instructorId: InstructorId,
    private readonly readScope: CanonicalReadScope,
    private readonly readContext: ReadModelRequestContext,
    private daysState: InstructorCourseAssignmentReadModelCursor['days']
  ) {}

  get exhausted(): boolean {
    return this.daysState.exhausted;
  }

  get scanCount(): number {
    return this.scans;
  }

  async nextCandidate(): Promise<AssignmentSortKey | undefined> {
    while (!this.daysState.exhausted) {
      let query: Query = this.firestore
        .collectionGroup('days')
        .where('actualInstructorIds', 'array-contains', this.instructorId)
        .orderBy('interval.startsAt.seconds', 'asc')
        .orderBy('interval.startsAt.nanoseconds', 'asc')
        .orderBy(FieldPath.documentId(), 'asc');
      if (
        this.daysState.startsAtSeconds !== undefined &&
        this.daysState.startsAtNanoseconds !== undefined &&
        this.daysState.courseDayId !== undefined
      ) {
        query = query.startAfter(
          this.daysState.startsAtSeconds,
          this.daysState.startsAtNanoseconds,
          this.daysState.courseDayId
        );
      }
      const snapshot = await query.limit(1).get();
      this.scans += snapshot.docs.length;
      if (snapshot.docs.length === 0) {
        this.daysState = { exhausted: true };
        return undefined;
      }
      const document = snapshot.docs[0]!;
      const courseDay = parseIfVisibleInReadScope(
        document.data() as Record<string, unknown>,
        parseCourseDay,
        this.readScope
      );
      const parsedDay = courseDay ?? parseCourseDay(document.data() as Record<string, unknown>);
      const startsAt = parsedDay?.interval.startsAt;
      this.daysState = {
        exhausted: false,
        ...(startsAt && parsedDay
          ? {
              startsAtSeconds: startsAt.seconds,
              startsAtNanoseconds: startsAt.nanoseconds,
              courseDayId: parsedDay.courseDayId,
            }
          : {}),
      };
      if (!courseDay) {
        continue;
      }
      if (this.dayUniqueCourseIds.has(courseDay.courseId)) {
        continue;
      }
      this.dayUniqueCourseIds.add(courseDay.courseId);
      const courseSnap = await this.readContext.course(courseDay.courseId);
      if (
        legacyCourseDocumentFailsCanonicalParse(
          courseSnap.data() as Record<string, unknown> | undefined
        )
      ) {
        continue;
      }
      const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
      if (!course || course.lifecycle === 'archived') {
        continue;
      }
      return { title: course.title, courseId: course.courseId };
    }
    return undefined;
  }

  snapshotState(): InstructorCourseAssignmentReadModelCursor['days'] {
    return this.daysState;
  }
}

async function pickNextCandidate(
  rosterStream: RosterDiscoveryStream,
  dayStream: DayDiscoveryStream,
  lastEmitted: AssignmentSortKey | undefined,
  processedCourseIds: Set<CourseId>
): Promise<StreamCandidate | undefined> {
  let rosterPeek = await rosterStream.nextCandidate();
  let rosterGuard = 0;
  while (
    rosterPeek &&
    (!isAfterLastEmitted(rosterPeek, lastEmitted) || processedCourseIds.has(rosterPeek.courseId)) &&
    rosterGuard++ < INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING
  ) {
    rosterPeek = await rosterStream.nextCandidate();
  }
  let dayPeek = await dayStream.nextCandidate();
  let dayGuard = 0;
  while (
    dayPeek &&
    (!isAfterLastEmitted(dayPeek, lastEmitted) || processedCourseIds.has(dayPeek.courseId)) &&
    dayGuard++ < INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING
  ) {
    dayPeek = await dayStream.nextCandidate();
  }

  if (!rosterPeek && !dayPeek) {
    return undefined;
  }
  if (!rosterPeek) {
    return dayPeek ? { source: 'days', sortKey: dayPeek } : undefined;
  }
  if (!dayPeek) {
    return { source: 'roster', sortKey: rosterPeek };
  }
  if (rosterPeek.courseId === dayPeek.courseId) {
    return { source: 'roster', sortKey: rosterPeek };
  }
  return compareInstructorCourseAssignmentSortKeys(rosterPeek, dayPeek) <= 0
    ? { source: 'roster', sortKey: rosterPeek }
    : { source: 'days', sortKey: dayPeek };
}

export async function queryInstructorCourseAssignmentReadModels(
  firestore: Firestore,
  input: QueryInstructorCourseAssignmentReadModelsInput,
  options: {
    readonly instructorId?: InstructorId;
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryInstructorCourseAssignmentReadModelsResult> {
  const instructorId = options.instructorId;
  if (!instructorId) {
    return QueryInstructorCourseAssignmentReadModelsResultSchema.parse({
      scope: input.scope,
      items: [],
      hasMore: false,
    });
  }
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });

  const pageSize = Math.min(
    input.pageSize ?? INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_DEFAULT,
    INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX
  );

  let discoveryCursor = createInitialDiscoveryCursor(instructorId, readScope);
  if (input.cursor) {
    const decoded = decodeInstructorCourseAssignmentReadModelCursor(input.cursor);
    if (
      !decoded ||
      decoded.instructorId !== instructorId ||
      !cursorScopeMatchesReadScope(decoded.readScope, readScope)
    ) {
      throw new Error('invalid_cursor');
    }
    discoveryCursor = decoded;
  }

  const rosterStream = new RosterDiscoveryStream(
    firestore,
    instructorId,
    readScope,
    discoveryCursor.roster
  );
  const dayStream = new DayDiscoveryStream(
    firestore,
    instructorId,
    readScope,
    readContext,
    discoveryCursor.days
  );

  const items: InstructorCourseAssignmentReadModel[] = [];
  const processedCourseIds = new Set<CourseId>();
  let lastEmitted = discoveryCursor.lastEmitted;
  let totalScans = 0;

  while (items.length < pageSize && totalScans < INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING) {
    const beforeScans = rosterStream.scanCount + dayStream.scanCount;
    const candidate = await pickNextCandidate(
      rosterStream,
      dayStream,
      lastEmitted,
      processedCourseIds
    );
    totalScans += rosterStream.scanCount + dayStream.scanCount - beforeScans;
    if (!candidate) {
      break;
    }
    processedCourseIds.add(candidate.sortKey.courseId);
    const item = await buildInstructorCourseAssignmentReadModel(
      firestore,
      instructorId,
      candidate.sortKey.courseId,
      readContext,
      readScope
    );
    if (item) {
      items.push(item);
      lastEmitted = { title: item.title, courseId: item.courseId };
    }
  }

  const streamsExhausted = rosterStream.exhausted && dayStream.exhausted;
  const scanCeilingReached =
    !streamsExhausted && totalScans >= INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING;
  const hasMore = !streamsExhausted || scanCeilingReached;

  const nextCursorState: InstructorCourseAssignmentReadModelCursor = {
    instructorId,
    readScope: readScopeToCursorScope(readScope),
    roster: rosterStream.snapshotState(),
    days: dayStream.snapshotState(),
    ...(lastEmitted ? { lastEmitted } : {}),
  };

  return QueryInstructorCourseAssignmentReadModelsResultSchema.parse({
    scope: input.scope,
    items,
    hasMore,
    ...(hasMore
      ? { nextCursor: encodeInstructorCourseAssignmentReadModelCursor(nextCursorState) }
      : {}),
    ...(scanCeilingReached ? { discoveryScanIncomplete: true } : {}),
  });
}

/** @deprecated Use paginated queryInstructorCourseAssignmentReadModels instead. */
export async function discoverInstructorAssignedCourseIds(
  firestore: Firestore,
  instructorId: InstructorId,
  readScope: CanonicalReadScope = LIVE_CANONICAL_READ_SCOPE
): Promise<Set<CourseId>> {
  const courseIds = new Set<CourseId>();
  let cursor: string | undefined;
  do {
    const page = await queryInstructorCourseAssignmentReadModels(
      firestore,
      {
        scope: 'instructor_assigned',
        pageSize: INSTRUCTOR_COURSE_ASSIGNMENT_READ_MODEL_PAGE_SIZE_MAX,
        ...(cursor ? { cursor } : {}),
      },
      { instructorId, readScope }
    );
    for (const item of page.items) {
      courseIds.add(item.courseId);
    }
    cursor = page.hasMore ? page.nextCursor : undefined;
  } while (cursor);
  return courseIds;
}
