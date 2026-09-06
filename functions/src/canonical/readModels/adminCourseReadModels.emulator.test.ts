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

function course(
  courseId: typeof activeCourseId,
  lifecycle: 'active' | 'archived',
  title = lifecycle === 'active' ? 'Active Course' : 'Archived Course'
) {
  return CourseSchema.parse({
    courseId,
    title,
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

  it('paginates both lifecycle scopes without duplicates, omissions, or cross-scope rows', async () => {
    const activeIds = [
      CourseIdSchema.parse('course_admin_emulator_active_a'),
      CourseIdSchema.parse('course_admin_emulator_active_b'),
      CourseIdSchema.parse('course_admin_emulator_active_c'),
    ];
    const archivedIds = [
      CourseIdSchema.parse('course_admin_emulator_archived_a'),
      CourseIdSchema.parse('course_admin_emulator_archived_b'),
      CourseIdSchema.parse('course_admin_emulator_archived_c'),
    ];
    await Promise.all([
      ...activeIds.map((id, index) =>
        firestore
          .collection('courses')
          .doc(id)
          .set(course(id, 'active', `Course ${index}`))
      ),
      ...archivedIds.map((id, index) =>
        firestore
          .collection('courses')
          .doc(id)
          .set(course(id, 'archived', `Course ${index}`))
      ),
      firestore.collection('instructors').doc(instructorId).set({
        id: instructorId,
        name: 'Course Coach',
        isAvailable: true,
      }),
    ]);

    const readScope = async (lifecycle: 'active' | 'archived') => {
      const first = await queryAdminCourseReadModels(
        firestore,
        { kind: 'administrator', accountId: adminAccountId },
        { scope: 'admin_course_list', pageSize: 2, readModelVersion: 2, lifecycle }
      );
      if (first.scope !== 'admin_course_list') throw new Error('unexpected scope');
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();
      const second = await queryAdminCourseReadModels(
        firestore,
        { kind: 'administrator', accountId: adminAccountId },
        {
          scope: 'admin_course_list',
          pageSize: 2,
          readModelVersion: 2,
          lifecycle,
          cursor: first.nextCursor,
        }
      );
      if (second.scope !== 'admin_course_list') throw new Error('unexpected scope');
      expect(second.hasMore).toBe(false);
      const items = [...first.items, ...second.items];
      expect(items).toHaveLength(3);
      expect(new Set(items.map((item) => item.courseId)).size).toBe(3);
      expect(items.every((item) => item.lifecycle === lifecycle)).toBe(true);
      return items.map((item) => item.courseId);
    };

    await expect(readScope('active')).resolves.toEqual(activeIds);
    await expect(readScope('archived')).resolves.toEqual(archivedIds);
  });
});
