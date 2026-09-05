import type { Firestore } from 'firebase-admin/firestore';
import {
  ADMIN_COURSE_READ_MODEL_PAGE_SIZE_DEFAULT,
  AdminCourseInstructorPresentationSchema,
  AdminCourseReadModelSchema,
  AggregateRevisionSchema,
  QueryAdminCourseReadModelsResultSchema,
  compareCanonicalTimestamps,
  courseScheduleIsComplete,
  timestampFromDate,
  type AdminCourseReadModel,
  type QueryAdminCourseReadModelsInput,
  type QueryAdminCourseReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import {
  parseCourse,
  parseCourseDays,
  parseInstructorCatalog,
} from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import {
  courseCatalogContentPath,
  parseCourseCatalogContent,
} from '../courses/courseCatalogContentStore';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';

const ACTIVE_ENROLLMENT_STATUSES = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
]);

async function buildAdminCourseReadModel(
  firestore: Firestore,
  course: NonNullable<ReturnType<typeof parseCourse>>,
  now = timestampFromDate(new Date()),
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore)
): Promise<AdminCourseReadModel | undefined> {
  const [daySnapshot, enrollmentSnapshot, catalogSnapshot, attendanceSnapshot] =
    await Promise.all([
      readContext.courseDays(course.courseId),
      firestore.collection('course_enrollments').where('courseId', '==', course.courseId).get(),
      firestore.doc(courseCatalogContentPath(course.courseId)).get(),
      readContext.courseAttendances(course.courseId),
    ]);

  const courseDays = parseCourseDays(
    daySnapshot.docs.map((document) => ({ data: document.data() as Record<string, unknown> }))
  ).sort((left, right) => left.dayOrder - right.dayOrder);
  const enrollments = enrollmentSnapshot.docs
    .map((document) => parseCourseEnrollment(document.data() as Record<string, unknown>))
    .filter((value): value is NonNullable<typeof value> => value !== undefined);
  const activeEnrollmentCount = enrollments.filter((enrollment) =>
    ACTIVE_ENROLLMENT_STATUSES.has(enrollment.lifecycle.status)
  ).length;
  const occupiedConfirmedSeats = course.capacity.totalSeats - course.capacity.availableSeats;
  const catalogContent = parseCourseCatalogContent(
    catalogSnapshot.data() as Record<string, unknown> | undefined,
    course.courseId
  );

  const instructors = (
    await Promise.all(
      course.instructorRosterIds.map(async (instructorId) => {
        const snapshot = await readContext.instructor(instructorId);
        const instructor = parseInstructorCatalog(
          instructorId,
          snapshot.data() as Record<string, unknown> | undefined
        );
        if (!instructor) return undefined;
        const presentation = AdminCourseInstructorPresentationSchema.safeParse({
          instructorId,
          name: instructor.name,
          ...(instructor.avatarUrl ? { avatarUrl: instructor.avatarUrl } : {}),
          ...(instructor.isAvailable === undefined
            ? {}
            : { isAvailable: instructor.isAvailable }),
        });
        return presentation.success ? presentation.data : undefined;
      })
    )
  ).filter((value): value is NonNullable<typeof value> => value !== undefined);

  const expectedRevision = course.revision;
  const actions: AdminCourseReadModel['authorizedActions'] = [
    {
      kind: 'update_course_catalog_content',
      expectedRevision: catalogContent?.revision ?? AggregateRevisionSchema.parse(0),
    },
  ];
  if (course.lifecycle === 'active') {
    actions.push(
      { kind: 'change_course_title', expectedRevision },
      { kind: 'change_course_price', expectedRevision },
      { kind: 'change_course_capacity', expectedRevision },
      { kind: 'archive_course', expectedRevision },
      { kind: 'add_course_roster_instructor', expectedRevision },
      { kind: 'remove_course_roster_instructor', expectedRevision },
      { kind: 'create_course_day', expectedRevision }
    );
    const hasFutureDay = courseDays.some(
      (day) => compareCanonicalTimestamps(day.interval.startsAt, now) > 0
    );
    if (hasFutureDay) {
      actions.push(
        { kind: 'reassign_course_day_instructor', expectedRevision },
        { kind: 'reschedule_course_day', expectedRevision }
      );
      if (enrollments.length === 0 && attendanceSnapshot.empty) {
        actions.push({ kind: 'remove_course_day', expectedRevision });
      }
    }
  } else {
    actions.push({ kind: 'reactivate_course', expectedRevision });
  }

  const scheduleComplete = courseScheduleIsComplete(course, courseDays);
  const provisioningStatus = course.provisioningManifestFingerprint
    ? scheduleComplete
      ? 'complete'
      : 'incomplete'
    : 'operationally_amended';

  const parsed = AdminCourseReadModelSchema.safeParse({
    courseId: course.courseId,
    title: course.title,
    lifecycle: course.lifecycle,
    price: course.price,
    capacity: {
      totalSeats: course.capacity.totalSeats,
      availableSeats: course.capacity.availableSeats,
      occupiedConfirmedSeats,
    },
    revision: course.revision,
    scheduleRevision: course.scheduleProjection.courseScheduleRevision,
    instructorRosterIds: course.instructorRosterIds,
    instructors,
    courseDays,
    activeEnrollmentCount,
    totalEnrollmentCount: enrollments.length,
    provisioning: {
      status: provisioningStatus,
      ...(course.provisioningManifestFingerprint
        ? { fingerprint: course.provisioningManifestFingerprint }
        : {}),
    },
    catalogContent: {
      status: catalogContent ? 'present' : 'missing',
      ...(catalogContent ? { content: catalogContent } : {}),
    },
    authorizedActions: actions,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  });
  return parsed.success ? parsed.data : undefined;
}

export async function queryAdminCourseReadModels(
  firestore: Firestore,
  _actor: ReadModelAdministratorActor,
  input: QueryAdminCourseReadModelsInput,
  options: { readonly readContext?: ReadModelRequestContext } = {}
): Promise<QueryAdminCourseReadModelsResult> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  if (input.scope === 'admin_course_detail') {
    const snapshot = await readContext.course(input.courseId);
    const course = parseCourse(snapshot.data() as Record<string, unknown> | undefined);
    const item = course
      ? await buildAdminCourseReadModel(firestore, course, undefined, readContext)
      : undefined;
    return QueryAdminCourseReadModelsResultSchema.parse({
      scope: input.scope,
      ...(item ? { item } : {}),
    });
  }

  const pageSize = input.pageSize ?? ADMIN_COURSE_READ_MODEL_PAGE_SIZE_DEFAULT;
  const snapshot = await firestore.collection('courses').limit(pageSize).get();
  const courses = snapshot.docs
    .map((document) => parseCourse(document.data() as Record<string, unknown>))
    .filter((value): value is NonNullable<typeof value> => value !== undefined);
  const items = (
    await Promise.all(
      courses.map((course) => buildAdminCourseReadModel(firestore, course, undefined, readContext))
    )
  )
    .filter((item): item is AdminCourseReadModel => item !== undefined)
    .sort((left, right) => left.title.localeCompare(right.title));
  return QueryAdminCourseReadModelsResultSchema.parse({ scope: input.scope, items });
}
