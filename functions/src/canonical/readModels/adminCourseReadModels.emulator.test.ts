import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryAdminCourseReadModels } from './adminCourseReadModels';

const PROJECT_ID = 'ski-academy-admin-course-read-model-test';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const adminAccountId = AccountIdSchema.parse('account_admin_course_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_course_emulator_01');
const activeCourseId = CourseIdSchema.parse('course_admin_emulator_active_01');
const archivedCourseId = CourseIdSchema.parse('course_admin_emulator_archived_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

function course(courseId: typeof activeCourseId, lifecycle: 'active' | 'archived') {
  return CourseSchema.parse({
    courseId,
    title: lifecycle === 'active' ? 'Active Course' : 'Archived Course',
    lifecycle,
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId],
    startAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_admin_course_emulator_seed',
      lastChangedByCommandId: 'command_admin_course_emulator_seed',
      correlationId: 'correlation_admin_course_emulator_seed',
    },
  });
}

describeEmulator('admin Course read models', () => {
  beforeAll(async () => {
    app =
      getApps().find((candidate) => candidate.name === PROJECT_ID) ??
      initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    const snapshot = await firestore.collection('courses').get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('returns only active Courses from the bounded v2 list query', async () => {
    await Promise.all([
      firestore.collection('courses').doc(activeCourseId).set(course(activeCourseId, 'active')),
      firestore
        .collection('courses')
        .doc(archivedCourseId)
        .set(course(archivedCourseId, 'archived')),
      firestore.collection('instructors').doc(instructorId).set({
        id: instructorId,
        name: 'Course Coach',
        isAvailable: true,
      }),
    ]);

    const result = await queryAdminCourseReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_course_list', pageSize: 50, readModelVersion: 2 }
    );

    expect(result.scope).toBe('admin_course_list');
    if (result.scope === 'admin_course_list') {
      expect(result.items.map((item) => item.courseId)).toEqual([activeCourseId]);
    }
  });
});
