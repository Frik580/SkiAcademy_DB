import {
  evaluateCourseCatalogEnrollmentEligibility,
  isCourseCapacityFrozen,
  courseScheduleIsComplete,
  sortedCourseDays,
  timestampFromDate,
  type Course,
  type CourseCatalogReadModel,
  type QueryCourseCatalogReadModelsInput,
  type QueryCourseCatalogReadModelsResult,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseCourse, parseCourseDays, courseDaysCollectionPath } from '../courses/courseStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';

async function buildCourseCatalogReadModel(
  firestore: Firestore,
  course: Course,
  now: ReturnType<typeof timestampFromDate>
): Promise<CourseCatalogReadModel | undefined> {
  const dayDocuments = await firestore.collection(courseDaysCollectionPath(course.courseId)).get();
  const courseDays = sortedCourseDays(
    parseCourseDays(dayDocuments.docs.map((doc) => ({ data: doc.data() as Record<string, unknown> })))
  );
  if (!courseScheduleIsComplete(course, courseDays)) {
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
  options: { readonly now?: Date } = {}
): Promise<QueryCourseCatalogReadModelsResult> {
  const now = timestampFromDate(options.now ?? new Date());

  if (input.scope === 'authenticated') {
    const courseSnap = await firestore.collection('courses').doc(input.courseId!).get();
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [] };
    }
    const item = await buildCourseCatalogReadModel(firestore, course, now);
    return { scope: input.scope, items: item ? [item] : [] };
  }

  const snapshot = await firestore.collection('courses').limit(50).get();
  const items: CourseCatalogReadModel[] = [];
  for (const doc of snapshot.docs) {
    const course = parseCourse(doc.data() as Record<string, unknown>);
    if (!course) {
      continue;
    }
    const item = await buildCourseCatalogReadModel(firestore, course, now);
    if (item) {
      items.push(item);
    }
  }
  items.sort((left, right) => left.title.localeCompare(right.title));
  return { scope: input.scope, items };
}
