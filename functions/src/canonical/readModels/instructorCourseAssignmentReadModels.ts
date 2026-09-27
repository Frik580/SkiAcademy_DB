import {
  compareInstructorCourseAssignmentSortKeys,
  decodeInstructorCourseAssignmentReadModelCursor,
  encodeInstructorCourseAssignmentReadModelCursor,
  instructorCourseAssignmentDayDocumentPath,
  parseInstructorCourseAssignmentDayDocumentPath,
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
import {
  FieldPath,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
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

type BufferedCandidate = Readonly<{
  sortKey: AssignmentSortKey;
  boundary: InstructorCourseAssignmentReadModelCursor['roster'] | InstructorCourseAssignmentReadModelCursor['days'];
}>;

function dayBoundaryFromDocument(
  document: QueryDocumentSnapshot
): InstructorCourseAssignmentReadModelCursor['days'] | undefined {
  const seconds = readOrderNumber(document, 'interval.startsAt.seconds');
  const nanoseconds = readOrderNumber(document, 'interval.startsAt.nanoseconds');
  const identity = parseInstructorCourseAssignmentDayDocumentPath(document.ref.path);
  if (
    seconds === undefined ||
    nanoseconds === undefined ||
    seconds < 0 ||
    nanoseconds < 0 ||
    nanoseconds > 999_999_999 ||
    !identity
  ) {
    return undefined;
  }
  return {
    exhausted: false,
    startsAtSeconds: seconds,
    startsAtNanoseconds: nanoseconds,
    documentPath: instructorCourseAssignmentDayDocumentPath(identity.courseId, identity.courseDayId),
  };
}

function readOrderNumber(
  document: QueryDocumentSnapshot,
  field: string
): number | undefined {
  const direct = document.get(field);
  if (typeof direct === 'number' && Number.isInteger(direct)) {
    return direct;
  }
  let current: unknown = document.data();
  for (const key of field.split('.')) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isInteger(current) ? current : undefined;
}

class RosterDiscoveryStream {
  private scans = 0;
  private buffer: BufferedCandidate | undefined;
  private bufferLoaded = false;

  constructor(
    private readonly firestore: Firestore,
    private readonly instructorId: InstructorId,
    private readonly readScope: CanonicalReadScope,
    private committed: InstructorCourseAssignmentReadModelCursor['roster']
  ) {}

  get exhausted(): boolean {
    return this.committed.exhausted;
  }

  get scanCount(): number {
    return this.scans;
  }

  async peek(): Promise<AssignmentSortKey | undefined> {
    if (!this.bufferLoaded) {
      this.buffer = await this.pull();
      this.bufferLoaded = true;
    }
    return this.buffer?.sortKey;
  }

  commit(): void {
    if (this.buffer && 'documentId' in this.buffer.boundary) {
      this.committed = this.buffer.boundary;
    }
    this.buffer = undefined;
    this.bufferLoaded = false;
  }

  snapshotState(): InstructorCourseAssignmentReadModelCursor['roster'] {
    return this.committed;
  }

  private async pull(): Promise<BufferedCandidate | undefined> {
    while (!this.committed.exhausted) {
      if (this.scans >= INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING) {
        return undefined;
      }
      let query: Query = this.firestore
        .collection('courses')
        .where('instructorRosterIds', 'array-contains', this.instructorId)
        .where('lifecycle', '==', 'active')
        .orderBy('title', 'asc')
        .orderBy(FieldPath.documentId(), 'asc');
      if (this.committed.title !== undefined && this.committed.documentId !== undefined) {
        query = query.startAfter(this.committed.title, this.committed.documentId);
      }
      const snapshot = await query.limit(1).get();
      this.scans += snapshot.docs.length;
      if (snapshot.docs.length === 0) {
        this.committed = { exhausted: true };
        return undefined;
      }
      const document = snapshot.docs[0]!;
      const boundary: InstructorCourseAssignmentReadModelCursor['roster'] = {
        exhausted: false,
        title: String(document.get('title')),
        documentId: document.id as CourseId,
      };
      if (legacyCourseDocumentFailsCanonicalParse(document.data() as Record<string, unknown>)) {
        this.committed = boundary;
        continue;
      }
      const course = parseIfVisibleInReadScope(document.data(), parseCourse, this.readScope);
      if (!course || course.lifecycle !== 'active') {
        this.committed = boundary;
        continue;
      }
      return {
        sortKey: { title: course.title, courseId: course.courseId },
        boundary,
      };
    }
    return undefined;
  }
}

class DayDiscoveryStream {
  private scans = 0;
  private readonly seenCourseIds = new Set<CourseId>();
  private buffer: BufferedCandidate | undefined;
  private bufferLoaded = false;

  constructor(
    private readonly firestore: Firestore,
    private readonly instructorId: InstructorId,
    private readonly readScope: CanonicalReadScope,
    private readonly readContext: ReadModelRequestContext,
    private committed: InstructorCourseAssignmentReadModelCursor['days']
  ) {}

  get exhausted(): boolean {
    return this.committed.exhausted;
  }

  get scanCount(): number {
    return this.scans;
  }

  async peek(): Promise<AssignmentSortKey | undefined> {
    if (!this.bufferLoaded) {
      this.buffer = await this.pull();
      this.bufferLoaded = true;
    }
    return this.buffer?.sortKey;
  }

  commit(): void {
    if (this.buffer && 'documentPath' in this.buffer.boundary) {
      this.committed = this.buffer.boundary;
    }
    this.buffer = undefined;
    this.bufferLoaded = false;
  }

  snapshotState(): InstructorCourseAssignmentReadModelCursor['days'] {
    return this.committed;
  }

  private async pull(): Promise<BufferedCandidate | undefined> {
    while (!this.committed.exhausted) {
      if (this.scans >= INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING) {
        return undefined;
      }
      let query: Query = this.firestore
        .collectionGroup('days')
        .where('actualInstructorIds', 'array-contains', this.instructorId)
        .orderBy('interval.startsAt.seconds', 'asc')
        .orderBy('interval.startsAt.nanoseconds', 'asc')
        .orderBy(FieldPath.documentId(), 'asc');
      if (
        this.committed.startsAtSeconds !== undefined &&
        this.committed.startsAtNanoseconds !== undefined &&
        this.committed.documentPath !== undefined
      ) {
        const identity = parseInstructorCourseAssignmentDayDocumentPath(this.committed.documentPath);
        if (!identity) {
          throw new Error('invalid_cursor');
        }
        query = query.startAfter(
          this.committed.startsAtSeconds,
          this.committed.startsAtNanoseconds,
          this.firestore.doc(
            instructorCourseAssignmentDayDocumentPath(identity.courseId, identity.courseDayId)
          )
        );
      }
      const snapshot = await query.limit(1).get();
      this.scans += snapshot.docs.length;
      if (snapshot.docs.length === 0) {
        this.committed = { exhausted: true };
        return undefined;
      }
      const document = snapshot.docs[0]!;
      const boundary = dayBoundaryFromDocument(document);
      if (!boundary) {
        this.committed = { exhausted: true };
        return undefined;
      }
      const courseDay = parseIfVisibleInReadScope(
        document.data() as Record<string, unknown>,
        parseCourseDay,
        this.readScope
      );
      if (!courseDay || this.seenCourseIds.has(courseDay.courseId)) {
        this.committed = boundary;
        continue;
      }
      const courseSnap = await this.readContext.course(courseDay.courseId);
      if (
        legacyCourseDocumentFailsCanonicalParse(
          courseSnap.data() as Record<string, unknown> | undefined
        )
      ) {
        this.committed = boundary;
        continue;
      }
      const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
      if (!course || course.lifecycle === 'archived') {
        this.committed = boundary;
        continue;
      }
      this.seenCourseIds.add(courseDay.courseId);
      return {
        sortKey: { title: course.title, courseId: course.courseId },
        boundary,
      };
    }
    return undefined;
  }
}

async function skipIneligible(
  stream: RosterDiscoveryStream | DayDiscoveryStream,
  lastEmitted: AssignmentSortKey | undefined,
  processedCourseIds: Set<CourseId>
): Promise<void> {
  let guard = 0;
  while (guard++ < INSTRUCTOR_COURSE_ASSIGNMENT_DISCOVERY_SCAN_CEILING) {
    const peeked = await stream.peek();
    if (!peeked) {
      return;
    }
    if (isAfterLastEmitted(peeked, lastEmitted) && !processedCourseIds.has(peeked.courseId)) {
      return;
    }
    stream.commit();
  }
}

async function pickNextCandidate(
  rosterStream: RosterDiscoveryStream,
  dayStream: DayDiscoveryStream,
  lastEmitted: AssignmentSortKey | undefined,
  processedCourseIds: Set<CourseId>
): Promise<StreamCandidate | undefined> {
  await skipIneligible(rosterStream, lastEmitted, processedCourseIds);
  await skipIneligible(dayStream, lastEmitted, processedCourseIds);
  const rosterPeek = await rosterStream.peek();
  const dayPeek = await dayStream.peek();
  if (!rosterPeek && !dayPeek) {
    return undefined;
  }
  if (!dayPeek && rosterPeek) {
    rosterStream.commit();
    return { source: 'roster', sortKey: rosterPeek };
  }
  if (!rosterPeek && dayPeek) {
    dayStream.commit();
    return { source: 'days', sortKey: dayPeek };
  }
  if (!rosterPeek || !dayPeek) {
    return undefined;
  }
  if (rosterPeek.courseId === dayPeek.courseId) {
    rosterStream.commit();
    dayStream.commit();
    return { source: 'roster', sortKey: rosterPeek };
  }
  if (compareInstructorCourseAssignmentSortKeys(rosterPeek, dayPeek) <= 0) {
    rosterStream.commit();
    return { source: 'roster', sortKey: rosterPeek };
  }
  dayStream.commit();
  return { source: 'days', sortKey: dayPeek };
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

  const nextCursor = hasMore
    ? encodeInstructorCourseAssignmentReadModelCursor(nextCursorState)
    : undefined;
  if (hasMore && input.cursor && nextCursor === input.cursor) {
    throw new Error('cursor_did_not_advance');
  }

  return QueryInstructorCourseAssignmentReadModelsResultSchema.parse({
    scope: input.scope,
    items,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
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
