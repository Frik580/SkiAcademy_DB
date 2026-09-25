import {
  legacyCourseDocumentFailsCanonicalParse,
  resolveInstructorCourseAssignmentProjection,
  type InstructorCourseAssignmentReadModel,
  type InstructorId,
  type CourseId,
  type QueryInstructorCourseAssignmentReadModelsInput,
  type QueryInstructorCourseAssignmentReadModelsResult,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
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

const INSTRUCTOR_COURSE_ASSIGNMENT_QUERY_LIMIT = 50;
const INSTRUCTOR_COURSE_DAY_ASSIGNMENT_QUERY_LIMIT = 200;

export async function discoverInstructorAssignedCourseIds(
  firestore: Firestore,
  instructorId: InstructorId,
  readScope: CanonicalReadScope = LIVE_CANONICAL_READ_SCOPE
): Promise<Set<CourseId>> {
  const courseIds = new Set<CourseId>();

  const rosterCoursesSnap = await firestore
    .collection('courses')
    .where('instructorRosterIds', 'array-contains', instructorId)
    .limit(INSTRUCTOR_COURSE_ASSIGNMENT_QUERY_LIMIT)
    .get();

  for (const doc of rosterCoursesSnap.docs) {
    if (legacyCourseDocumentFailsCanonicalParse(doc.data() as Record<string, unknown>)) {
      continue;
    }
    const course = parseIfVisibleInReadScope(doc.data(), parseCourse, readScope);
    if (course && course.lifecycle !== 'archived') {
      courseIds.add(course.courseId);
    }
  }

  const assignedDaysSnap = await firestore
    .collectionGroup('days')
    .where('actualInstructorIds', 'array-contains', instructorId)
    .limit(INSTRUCTOR_COURSE_DAY_ASSIGNMENT_QUERY_LIMIT)
    .get();

  for (const doc of assignedDaysSnap.docs) {
    const courseDay = parseIfVisibleInReadScope(doc.data(), parseCourseDay, readScope);
    if (courseDay) {
      courseIds.add(courseDay.courseId);
    }
  }

  return courseIds;
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
    return { scope: input.scope, items: [] };
  }
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });

  const discoveredCourseIds = await discoverInstructorAssignedCourseIds(
    firestore,
    instructorId,
    readScope
  );
  const items: InstructorCourseAssignmentReadModel[] = [];

  for (const courseId of discoveredCourseIds) {
    const item = await buildInstructorCourseAssignmentReadModel(
      firestore,
      instructorId,
      courseId,
      readContext,
      readScope
    );
    if (item) {
      items.push(item);
    }
  }

  items.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  return { scope: input.scope, items };
}
