import {
  CourseEnrollmentIdSchema,
  courseEnrollmentRequiresOutcomeWork,
  courseScheduleIsComplete,
  sortedCourseDays,
  timestampFromDate,
  parsePersistedCanonicalScope,
  assertSameCanonicalScope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { parseCourse, parseCourseDays } from './courseStore';
import { parseCourseEnrollment } from './courseEnrollmentStore';
import {
  COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION,
  completePendingCourseEnrollmentOutcomeWork,
  parseCourseEnrollmentOutcomeWork,
  pendingCourseEnrollmentOutcomeWork,
} from './courseEnrollmentOutcomeWork';

export type CourseEnrollmentOutcomeWorkSyncOutcome =
  | 'pending_created'
  | 'pending_updated'
  | 'completed'
  | 'unchanged'
  | 'not_applicable'
  | 'invalid_enrollment'
  | 'invalid_schedule';

function semanticallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(
  firestore: Firestore,
  input: {
    readonly rawEnrollmentId: string;
    readonly afterData?: Record<string, unknown>;
    readonly now?: Date;
  }
): Promise<CourseEnrollmentOutcomeWorkSyncOutcome> {
  const parsedId = CourseEnrollmentIdSchema.safeParse(input.rawEnrollmentId);
  if (!parsedId.success) return 'invalid_enrollment';

  const enrollmentSnapshot = await firestore
    .collection('course_enrollments')
    .doc(parsedId.data)
    .get();
  const enrollment = parseCourseEnrollment(
    enrollmentSnapshot.exists
      ? (enrollmentSnapshot.data() as Record<string, unknown>)
      : input.afterData
  );
  if (!enrollment || enrollment.enrollmentId !== parsedId.data) {
    return enrollmentSnapshot.exists ? 'invalid_enrollment' : 'not_applicable';
  }
  let enrollmentScope;
  try {
    enrollmentScope = parsePersistedCanonicalScope(enrollment);
  } catch {
    return 'invalid_enrollment';
  }

  const workRef = firestore
    .collection(COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION)
    .doc(enrollment.enrollmentId);
  const existingSnapshot = await workRef.get();
  const existing = parseCourseEnrollmentOutcomeWork(
    existingSnapshot.exists ? (existingSnapshot.data() as Record<string, unknown>) : undefined
  );
  if (existing) {
    try {
      assertSameCanonicalScope(enrollmentScope, existing);
    } catch {
      return 'invalid_enrollment';
    }
  }
  const now = timestampFromDate(input.now ?? new Date());

  if (!courseEnrollmentRequiresOutcomeWork(enrollment)) {
    if (!existing || existing.status !== 'pending') return 'not_applicable';
    const completed = completePendingCourseEnrollmentOutcomeWork(existing, {
      completedReason: 'lifecycle_ineligible',
      updatedAt: now,
    });
    await workRef.set(completed as Record<string, unknown>);
    return 'completed';
  }

  const courseSnapshot = await firestore.collection('courses').doc(enrollment.courseId).get();
  const course = parseCourse(
    courseSnapshot.exists ? (courseSnapshot.data() as Record<string, unknown>) : undefined
  );
  if (!course) return 'invalid_schedule';
  const daysSnapshot = await firestore.collection(`courses/${course.courseId}/days`).get();
  const courseDays = sortedCourseDays(
    parseCourseDays(
      daysSnapshot.docs.map((document) => ({
        data: document.data() as Record<string, unknown>,
      }))
    )
  );
  if (!courseScheduleIsComplete(course, courseDays)) return 'invalid_schedule';
  const finalCourseDay = courseDays.at(-1);
  if (!finalCourseDay) return 'invalid_schedule';

  let desired: ReturnType<typeof pendingCourseEnrollmentOutcomeWork>;
  try {
    desired = pendingCourseEnrollmentOutcomeWork({
      enrollment,
      course,
      finalCourseDay,
      workRevision: existing ? existing.workRevision + 1 : 1,
      updatedAt: now,
    });
  } catch {
    return 'invalid_schedule';
  }
  if (existing) {
    const comparable = {
      ...desired,
      workRevision: existing.workRevision,
      updatedAt: existing.updatedAt,
    };
    if (semanticallyEqual(existing, comparable)) return 'unchanged';
  }
  await workRef.set(desired as Record<string, unknown>);
  return existing ? 'pending_updated' : 'pending_created';
}
