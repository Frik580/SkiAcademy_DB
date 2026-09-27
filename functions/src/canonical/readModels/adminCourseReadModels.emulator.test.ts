import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  TestSessionIdSchema,
  testCanonicalReadScope,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
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

  it('uses exact enrollment counts and a bounded Attendance existence query for Course detail', async () => {
    const dayId = CourseDayIdSchema.parse('course_day_admin_emulator_bound_01');
    const day = CourseDaySchema.parse({
      ...canonicalCourseDeliveryFixtures.courseDays[0],
      courseId: activeCourseId,
      courseDayId: dayId,
      dayOrder: 1,
      interval: {
        startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
      },
      actualInstructorIds: [instructorId],
    });
    await Promise.all([
      firestore.collection('courses').doc(activeCourseId).set(course(activeCourseId, 'active')),
      firestore.doc(`courses/${activeCourseId}/days/${dayId}`).set(day),
      firestore.collection('instructors').doc(instructorId).set({
        id: instructorId,
        name: 'Course Coach',
        isAvailable: true,
      }),
    ]);
    await Promise.all(
      Array.from({ length: 63 }, (_, index) => {
        const status = index < 40 ? 'confirmed' : index < 50 ? 'pending' : 'cancelled';
        return firestore
          .collection('course_enrollments')
          .doc(`course_enrollment_admin_emulator_bound_${String(index).padStart(2, '0')}`)
          .set({
            courseId: activeCourseId,
            lifecycle: { status },
            dataScope: 'live',
          });
      })
    );
    const testSessionId = TestSessionIdSchema.parse('test_admin_course_emulator_count_hidden_01');
    await Promise.all([
      firestore
        .collection('course_enrollments')
        .doc('course_enrollment_admin_hidden_test_active')
        .set({
          courseId: activeCourseId,
          lifecycle: { status: 'confirmed' },
          dataScope: 'test',
          testSessionId,
        }),
      firestore
        .collection('course_enrollments')
        .doc('course_enrollment_admin_hidden_test_history')
        .set({
          courseId: activeCourseId,
          lifecycle: { status: 'cancelled' },
          dataScope: 'test',
          testSessionId,
        }),
    ]);
    await Promise.all(
      Array.from({ length: 99 }, (_, index) =>
        firestore
          .collection('attendance')
          .doc(`attendance_admin_course_emulator_test_${String(index).padStart(3, '0')}`)
          .set({
            subject: { courseId: activeCourseId },
            dataScope: 'test',
            testSessionId,
          })
      )
    );
    await firestore
      .collection('attendance')
      .doc('attendance_admin_course_emulator_live_z')
      .set({ subject: { courseId: activeCourseId }, dataScope: 'live' });

    const result = await queryAdminCourseReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_course_detail', courseId: activeCourseId }
    );

    expect(result.scope).toBe('admin_course_detail');
    if (result.scope !== 'admin_course_detail') return;
    expect(result.item).toMatchObject({ activeEnrollmentCount: 50, totalEnrollmentCount: 63 });
    expect(result.item?.authorizedActions.map((action) => action.kind)).not.toContain(
      'remove_course_day'
    );
  });

  it('keeps aggregate counts and the Attendance guard inside the Test Session scope', async () => {
    const testSessionId = TestSessionIdSchema.parse('test_admin_course_emulator_scope_01');
    const otherSessionId = TestSessionIdSchema.parse('test_admin_course_emulator_scope_02');
    const scopedCourse = CourseSchema.parse({
      ...course(activeCourseId, 'active'),
      dataScope: 'test',
      testSessionId,
    });
    const dayId = CourseDayIdSchema.parse('course_day_admin_emulator_test_scope_01');
    const day = CourseDaySchema.parse({
      ...canonicalCourseDeliveryFixtures.courseDays[0],
      courseId: activeCourseId,
      dataScope: 'test',
      testSessionId,
      courseDayId: dayId,
      dayOrder: 1,
      interval: {
        startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
      },
      actualInstructorIds: [instructorId],
    });
    await Promise.all([
      firestore.collection('courses').doc(activeCourseId).set(scopedCourse),
      firestore.doc(`courses/${activeCourseId}/days/${dayId}`).set(day),
      firestore.collection('instructors').doc(instructorId).set({
        id: instructorId,
        name: 'Course Coach',
        isAvailable: true,
      }),
      firestore
        .collection('course_enrollments')
        .doc('course_enrollment_admin_emulator_other_session')
        .set({
          courseId: activeCourseId,
          lifecycle: { status: 'confirmed' },
          dataScope: 'test',
          testSessionId: otherSessionId,
        }),
      firestore
        .collection('course_enrollments')
        .doc('course_enrollment_admin_emulator_live_scope')
        .set({
          courseId: activeCourseId,
          lifecycle: { status: 'confirmed' },
          dataScope: 'live',
        }),
      firestore
        .collection('attendance')
        .doc('attendance_admin_course_emulator_other_session')
        .set({
          subject: { courseId: activeCourseId },
          dataScope: 'test',
          testSessionId: otherSessionId,
        }),
      firestore
        .collection('attendance')
        .doc('attendance_admin_course_emulator_live_scope')
        .set({
          subject: { courseId: activeCourseId },
          dataScope: 'live',
        }),
    ]);

    const result = await queryAdminCourseReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_course_detail', courseId: activeCourseId },
      { readScope: testCanonicalReadScope(testSessionId) }
    );

    expect(result.scope).toBe('admin_course_detail');
    if (result.scope !== 'admin_course_detail') return;
    expect(result.item).toMatchObject({ activeEnrollmentCount: 0, totalEnrollmentCount: 0 });
    expect(result.item?.authorizedActions.map((action) => action.kind)).toContain(
      'remove_course_day'
    );
  });
});
