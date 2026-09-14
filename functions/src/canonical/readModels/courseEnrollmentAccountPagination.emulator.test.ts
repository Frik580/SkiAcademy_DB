import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  CourseDaySchema,
  CourseEnrollmentSchema,
  CourseIdSchema,
  CourseSchema,
  ParticipantIdSchema,
  ParticipantManagementSchema,
  ParticipantSchema,
  accountActorRef,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  InvalidCourseEnrollmentReadCursorError,
  queryCourseEnrollmentReadModels,
} from './courseEnrollmentReadModels';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const PROJECT_ID = 'ski-academy-course-account-pagination-test';
const accountId = 'account_course_pagination_01';
const participantId = ParticipantIdSchema.parse('participant_course_pagination_01');
const siblingParticipantId = ParticipantIdSchema.parse('participant_course_pagination_sibling');
const endedParticipantId = ParticipantIdSchema.parse('participant_course_pagination_ended');
const unmanagedParticipantId = ParticipantIdSchema.parse('participant_course_pagination_unmanaged');
const managementId = 'management_course_pagination_01';
const siblingManagementId = 'management_course_pagination_sibling';
const endedManagementId = 'management_course_pagination_ended';
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const completedAt = timestampFromDate(new Date('2026-02-02T00:00:00.000Z'));
const endedAt = timestampFromDate(new Date('2026-02-15T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T04:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T08:00:00.000Z'));
const futureDayStart = timestampFromDate(new Date('2026-06-01T04:00:00.000Z'));
const futureDayEnd = timestampFromDate(new Date('2026-06-01T08:00:00.000Z'));
const HOT_ENROLLMENT_IDS = [
  'course_enrollment_pagination_010_hot',
  'course_enrollment_pagination_040_hot',
  'course_enrollment_pagination_080_hot',
] as const;
const audit = {
  createdByCommandId: 'seed_course_pagination',
  lastChangedByCommandId: 'seed_course_pagination',
  correlationId: 'correlation_course_pagination',
};

let app: App;
let firestore: Firestore;

async function clear(database: Firestore) {
  for (const course of (await database.collection('courses').get()).docs) {
    for (const day of (await course.ref.collection('days').get()).docs) await day.ref.delete();
  }
  for (const name of [
    'course_enrollments',
    'participant_management',
    'participants',
    'users',
    'courses',
  ]) {
    for (const document of (await database.collection(name).get()).docs)
      await document.ref.delete();
  }
}

async function seed() {
  await clear(firestore);
  const batch = firestore.batch();
  batch.set(
    firestore.doc(`users/${accountId}`),
    AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    })
  );
  batch.set(
    firestore.doc(`participants/${participantId}`),
    ParticipantSchema.parse({
      participantId,
      displayName: 'Pagination Participant',
      age: { kind: 'age_years', years: 16 },
      skillLevel: 'intermediate',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    })
  );
  batch.set(
    firestore.doc(`participant_management/${managementId}`),
    ParticipantManagementSchema.parse({
      participantManagementId: managementId,
      accountId,
      participantId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    })
  );

  for (let courseIndex = 0; courseIndex < 2; courseIndex += 1) {
    const courseId = CourseIdSchema.parse(`course_pagination_${courseIndex}`);
    const courseDayId = `course_day_pagination_${courseIndex}`;
    batch.set(
      firestore.doc(`courses/${courseId}`),
      CourseSchema.parse({
        courseId,
        title: `Pagination Course ${courseIndex}`,
        price: 50_000,
        capacity: { totalSeats: 64, availableSeats: 0 },
        instructorRosterIds: ['instructor_course_pagination_01'],
        startAt: dayStart,
        scheduleProjection: {
          courseDayCount: 1,
          finalCourseDayEndsAt: dayEnd,
          courseScheduleRevision: 1,
        },
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit,
      })
    );
    batch.set(
      firestore.doc(`courses/${courseId}/days/${courseDayId}`),
      CourseDaySchema.parse({
        courseId,
        courseDayId,
        dayOrder: 1,
        interval: { startsAt: dayStart, endsAt: dayEnd },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: ['instructor_course_pagination_01'],
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit,
      })
    );
  }

  const hotCourseId = CourseIdSchema.parse('course_pagination_hot');
  batch.set(
    firestore.doc(`courses/${hotCourseId}`),
    CourseSchema.parse({
      courseId: hotCourseId,
      title: 'Pagination Hot Course',
      price: 50_000,
      capacity: { totalSeats: 64, availableSeats: 62 },
      instructorRosterIds: ['instructor_course_pagination_01'],
      startAt: futureDayStart,
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: futureDayEnd,
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    })
  );
  batch.set(
    firestore.doc(`courses/${hotCourseId}/days/course_day_pagination_hot`),
    CourseDaySchema.parse({
      courseId: hotCourseId,
      courseDayId: 'course_day_pagination_hot',
      dayOrder: 1,
      interval: { startsAt: futureDayStart, endsAt: futureDayEnd },
      timeZone: 'Asia/Almaty',
      actualInstructorIds: ['instructor_course_pagination_01'],
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    })
  );

  for (let index = 0; index < 105; index += 1) {
    const enrollmentId = `course_enrollment_pagination_${String(index).padStart(3, '0')}`;
    const courseId = CourseIdSchema.parse(`course_pagination_${index % 2}`);
    batch.set(
      firestore.doc(`course_enrollments/${enrollmentId}`),
      CourseEnrollmentSchema.parse({
        enrollmentId,
        participantId,
        courseId,
        originalCourseId: courseId,
        attribution: { bookingOrigin: 'account', bookedBy: accountActorRef(accountId) },
        lifecycle: { status: 'completed', completedAt },
        paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
        payerAccountId: accountId,
        revision: 1,
        createdAt,
        updatedAt: completedAt,
        audit,
      })
    );
  }
  for (const enrollmentId of HOT_ENROLLMENT_IDS) {
    batch.set(
      firestore.doc(`course_enrollments/${enrollmentId}`),
      CourseEnrollmentSchema.parse({
        enrollmentId,
        participantId,
        courseId: hotCourseId,
        originalCourseId: hotCourseId,
        attribution: { bookingOrigin: 'account', bookedBy: accountActorRef(accountId) },
        lifecycle: { status: 'confirmed' },
        paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
        payerAccountId: accountId,
        revision: 1,
        createdAt,
        updatedAt: completedAt,
        audit,
      })
    );
  }
  await batch.commit();
}

describeEmulator('T32.9A.9C.B account CourseEnrollment cursor pagination', () => {
  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT_ID }, 'course-account-pagination');
    firestore = getFirestore(app);
    await seed();
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('reaches all >100 same-timestamp Enrollment rows without duplicates or missing IDs', async () => {
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_history', pageSize: 25, ...(cursor ? { cursor } : {}) },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      );
      ids.push(...page.items.map((item) => item.enrollmentId));
      pages += 1;
      cursor = page.hasMore ? page.nextCursor : undefined;
      if (page.hasMore) expect(cursor).toBeTruthy();
    } while (cursor);
    expect(ids).toHaveLength(105);
    expect(pages).toBe(5);
    expect(new Set(ids).size).toBe(105);
    expect(ids).toEqual([...ids].sort());
    expect(HOT_ENROLLMENT_IDS.some((id) => ids.includes(id))).toBe(false);
    expect(ids).toContain('course_enrollment_pagination_010');
    expect(ids).toContain('course_enrollment_pagination_011');
    expect(ids).toContain('course_enrollment_pagination_040');
    expect(ids).toContain('course_enrollment_pagination_041');
  });

  it('advances the physical cursor past interleaved hot rows and terminates account_hot', async () => {
    const historyIds: string[] = [];
    const hotIds: string[] = [];
    const seenHistoryCursors = new Set<string>();
    const seenHotCursors = new Set<string>();
    let historyCursor: string | undefined;
    let hotCursor: string | undefined;
    let historyPages = 0;
    let hotPages = 0;

    do {
      const page = await queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_history', pageSize: 25, ...(historyCursor ? { cursor: historyCursor } : {}) },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      );
      historyIds.push(...page.items.map((item) => item.enrollmentId));
      historyPages += 1;
      expect(historyPages).toBeLessThanOrEqual(8);
      if (page.hasMore) {
        expect(page.nextCursor).toBeTruthy();
        expect(seenHistoryCursors.has(page.nextCursor!)).toBe(false);
        seenHistoryCursors.add(page.nextCursor!);
      }
      historyCursor = page.hasMore ? page.nextCursor : undefined;
    } while (historyCursor);

    do {
      const page = await queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_hot', pageSize: 25, ...(hotCursor ? { cursor: hotCursor } : {}) },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      );
      hotIds.push(...page.items.map((item) => item.enrollmentId));
      hotPages += 1;
      expect(hotPages).toBeLessThanOrEqual(8);
      if (page.hasMore) {
        expect(page.nextCursor).toBeTruthy();
        expect(seenHotCursors.has(page.nextCursor!)).toBe(false);
        seenHotCursors.add(page.nextCursor!);
      }
      hotCursor = page.hasMore ? page.nextCursor : undefined;
    } while (hotCursor);

    expect(historyIds).toHaveLength(105);
    expect(new Set(historyIds).size).toBe(105);
    expect([...hotIds].sort()).toEqual([...HOT_ENROLLMENT_IDS]);
    expect(new Set(hotIds).size).toBe(3);
  });

  it('rejects a stale cursor after account_hot / account_history scope switch', async () => {
    const page = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'account_history', pageSize: 25 },
      { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
    );
    expect(page.nextCursor).toBeTruthy();
    await expect(
      queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_hot', pageSize: 25, cursor: page.nextCursor },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      )
    ).rejects.toBeInstanceOf(InvalidCourseEnrollmentReadCursorError);
  });

  it('authorizes exact selected Participant and rejects an unmanaged selection', async () => {
    const page = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'account_history', selectedParticipantId: participantId, pageSize: 25 },
      { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
    );
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(25);
    expect(page.items.every((item) => item.participant.participantId === participantId)).toBe(true);
    await expect(
      queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_history', selectedParticipantId: unmanagedParticipantId },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      )
    ).rejects.toBeInstanceOf(ReadModelAccessDeniedError);
    await expect(
      queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_history', selectedParticipantId: participantId },
        {
          accountId: 'account_course_pagination_switched',
          now: new Date('2026-03-01T00:00:00.000Z'),
        }
      )
    ).rejects.toBeInstanceOf(ReadModelAccessDeniedError);
  });

  it('isolates a selected sibling and denies ended management', async () => {
    const siblingEnrollmentId = 'course_enrollment_pagination_sibling_001';
    const courseId = CourseIdSchema.parse('course_pagination_0');
    await firestore.doc(`participants/${siblingParticipantId}`).set(
      ParticipantSchema.parse({
        participantId: siblingParticipantId,
        displayName: 'Pagination Sibling',
        age: { kind: 'age_years', years: 12 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: siblingManagementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit,
      })
    );
    await firestore.doc(`participant_management/${siblingManagementId}`).set(
      ParticipantManagementSchema.parse({
        participantManagementId: siblingManagementId,
        accountId,
        participantId: siblingParticipantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit,
      })
    );
    await firestore.doc(`course_enrollments/${siblingEnrollmentId}`).set(
      CourseEnrollmentSchema.parse({
        enrollmentId: siblingEnrollmentId,
        participantId: siblingParticipantId,
        courseId,
        originalCourseId: courseId,
        attribution: { bookingOrigin: 'account', bookedBy: accountActorRef(accountId) },
        lifecycle: { status: 'completed', completedAt },
        paymentId: paymentIdFromCourseEnrollmentId(siblingEnrollmentId),
        payerAccountId: accountId,
        revision: 1,
        createdAt,
        updatedAt: completedAt,
        audit,
      })
    );
    await firestore.doc(`participants/${endedParticipantId}`).set(
      ParticipantSchema.parse({
        participantId: endedParticipantId,
        displayName: 'Pagination Ended',
        age: { kind: 'age_years', years: 14 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: endedManagementId },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit,
      })
    );
    await firestore.doc(`participant_management/${endedManagementId}`).set(
      ParticipantManagementSchema.parse({
        participantManagementId: endedManagementId,
        accountId,
        participantId: endedParticipantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'ended',
        endedAt,
        revision: 1,
        createdAt,
        updatedAt: endedAt,
        audit,
      })
    );

    const selected = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'account_history', selectedParticipantId: participantId, pageSize: 25 },
      { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
    );
    expect(selected.items.some((item) => item.enrollmentId === siblingEnrollmentId)).toBe(false);
    expect(
      selected.items.every((item) => item.participant.participantId === participantId)
    ).toBe(true);

    const siblingPage = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'account_history', selectedParticipantId: siblingParticipantId, pageSize: 25 },
      { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
    );
    expect(siblingPage.items.map((item) => item.enrollmentId)).toEqual([siblingEnrollmentId]);

    await expect(
      queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'account_history', selectedParticipantId: endedParticipantId },
        { accountId, now: new Date('2026-03-01T00:00:00.000Z') }
      )
    ).rejects.toBeInstanceOf(ReadModelAccessDeniedError);
  });
});
