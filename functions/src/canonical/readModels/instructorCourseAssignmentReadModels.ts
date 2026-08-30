import {
  legacyCourseDocumentFailsCanonicalParse,
  resolveInstructorCourseAssignmentProjection,
  type InstructorCourseAssignmentReadModel,
  type InstructorId,
  type QueryInstructorCourseAssignmentReadModelsInput,
  type QueryInstructorCourseAssignmentReadModelsResult,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import {
  parseCourse,
  parseCourseDay,
  parseCourseDays,
  courseDaysCollectionPath,
} from '../courses/courseStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';

const INSTRUCTOR_COURSE_ASSIGNMENT_QUERY_LIMIT = 50;
const INSTRUCTOR_COURSE_DAY_ASSIGNMENT_QUERY_LIMIT = 200;

export async function discoverInstructorAssignedCourseIds(
  firestore: Firestore,
  instructorId: InstructorId
): Promise<Set<string>> {
  const courseIds = new Set<string>();

  const rosterCoursesSnap = await firestore
    .collection('courses')
    .where('instructorRosterIds', 'array-contains', instructorId)
    .limit(INSTRUCTOR_COURSE_ASSIGNMENT_QUERY_LIMIT)
    .get();

  for (const doc of rosterCoursesSnap.docs) {
    if (legacyCourseDocumentFailsCanonicalParse(doc.data() as Record<string, unknown>)) {
      continue;
    }
    const course = parseCourse(doc.data() as Record<string, unknown>);
    if (course) {
      courseIds.add(course.courseId);
    }
  }

  const assignedDaysSnap = await firestore
    .collectionGroup('days')
    .where('actualInstructorIds', 'array-contains', instructorId)
    .limit(INSTRUCTOR_COURSE_DAY_ASSIGNMENT_QUERY_LIMIT)
    .get();

  for (const doc of assignedDaysSnap.docs) {
    const courseDay = parseCourseDay(doc.data() as Record<string, unknown>);
    if (courseDay) {
      courseIds.add(courseDay.courseId);
    }
  }

  return courseIds;
}

async function buildInstructorCourseAssignmentReadModel(
  firestore: Firestore,
  instructorId: InstructorId,
  courseId: string
): Promise<InstructorCourseAssignmentReadModel | undefined> {
  const courseSnap = await firestore.collection('courses').doc(courseId).get();
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
    (await firestore.collection(courseDaysCollectionPath(course.courseId)).get()).docs.map((doc) => ({
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
  options: { readonly instructorId?: InstructorId } = {}
): Promise<QueryInstructorCourseAssignmentReadModelsResult> {
  const instructorId = options.instructorId;
  if (!instructorId) {
    return { scope: input.scope, items: [] };
  }

  const discoveredCourseIds = await discoverInstructorAssignedCourseIds(firestore, instructorId);
  const items: InstructorCourseAssignmentReadModel[] = [];

  for (const courseId of discoveredCourseIds) {
    const item = await buildInstructorCourseAssignmentReadModel(firestore, instructorId, courseId);
    if (item) {
      items.push(item);
    }
  }

  items.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  return { scope: input.scope, items };
}
