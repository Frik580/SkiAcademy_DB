import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  ResourceClaimSchema,
  accountCommandActor,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { courseDayInstructorClaimIdentity } from './courseDayClaimOperations';

const PROJECT_ID = 'ski-academy-course-admin-emulator-test';
const runsOnFirestoreEmulator = Boolean(process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST);
const adminId = AccountIdSchema.parse('account_course_admin_emulator_01');
const courseId = CourseIdSchema.parse('course_admin_emulator_01');
const dayId = CourseDayIdSchema.parse('course_day_admin_emulator_01');
const secondDayId = CourseDayIdSchema.parse('course_day_admin_emulator_02');
const instructorId = InstructorIdSchema.parse('instructor_course_admin_emulator_01');
const secondInstructorId = InstructorIdSchema.parse('instructor_course_admin_emulator_02');
const correlationId = CorrelationIdSchema.parse('correlation_course_admin_emulator_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
let app: App;
let firestore: Firestore;

async function clear() {
  await Promise.all([
    firestore.doc(`courses/${courseId}/days/${dayId}`).delete(),
    firestore.doc(`courses/${courseId}/days/${secondDayId}`).delete(),
  ]);
  for (const name of ['users', 'courses', 'course_enrollments', 'attendance', 'resource_claims', 'resource_claim_guards', 'activity_logs', 'domain_outbox', 'command_idempotency']) {
    const snapshot = await firestore.collection(name).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
}

beforeAll(async () => {
  if (!runsOnFirestoreEmulator) return;
  app = initializeApp({ projectId: PROJECT_ID }, `course-admin-${Date.now()}`);
  firestore = getFirestore(app);
  await clear();
});

beforeEach(async () => {
  if (!runsOnFirestoreEmulator) return;
  await clear();
  await firestore.doc(`users/${adminId}`).set(AccountSchema.parse({
    accountId: adminId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
  }));
  await firestore.doc(`courses/${courseId}`).set(CourseSchema.parse({
    courseId,
    title: 'Concurrent Course',
    lifecycle: 'active',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId, secondInstructorId],
    startAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    provisioningExpectedCourseDayIds: [dayId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
  }));
  await firestore.doc(`courses/${courseId}/days/${dayId}`).set(CourseDaySchema.parse({
    courseId,
    courseDayId: dayId,
    dayOrder: 1,
    interval: {
      startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: { createdByCommandId: 'command_seed', lastChangedByCommandId: 'command_seed', correlationId },
  }));
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Course Admin Emulator Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });
  await firestore.doc(`instructors/${secondInstructorId}`).set({
    id: secondInstructorId,
    name: 'Second Course Admin Emulator Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });
});

afterAll(async () => {
  if (!runsOnFirestoreEmulator) return;
  await clear();
  if (app && getApps().includes(app)) await deleteApp(app);
});

describe.skipIf(!runsOnFirestoreEmulator)('Course capacity concurrency', () => {
  it('preserves occupied-seat invariants when enrollment races capacity amendment', async () => {
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const capacityPromise = commands.execute({
      kind: 'change_course_capacity',
      context: {
        actor: accountCommandActor(adminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-course-capacity-race',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 1,
      },
      intent: { courseId, totalSeats: 9, reasonExplanation: 'Concurrent capacity test' },
    });
    const enrollmentSeatPromise = firestore.runTransaction(async (transaction) => {
      const ref = firestore.doc(`courses/${courseId}`);
      const snapshot = await transaction.get(ref);
      const course = CourseSchema.parse(snapshot.data());
      transaction.update(ref, {
        capacity: {
          totalSeats: course.capacity.totalSeats,
          availableSeats: course.capacity.availableSeats - 1,
        },
        revision: course.revision + 1,
      });
    });
    const [capacityResult] = await Promise.all([capacityPromise, enrollmentSeatPromise]);
    const finalCourse = CourseSchema.parse((await firestore.doc(`courses/${courseId}`).get()).data());
    const occupied = finalCourse.capacity.totalSeats - finalCourse.capacity.availableSeats;
    expect(occupied).toBe(1);
    expect(finalCourse.capacity.totalSeats).toBeGreaterThanOrEqual(occupied);
    if (capacityResult.status === 'success') {
      expect(finalCourse.capacity.totalSeats).toBe(9);
    } else {
      expect(capacityResult.error.code).toBe('stale_version');
      expect(finalCourse.capacity.totalSeats).toBe(8);
    }
  });

  it('rejects an overlapping reschedule, then reschedules and safely removes an unused day', async () => {
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const created = await commands.execute({
      kind: 'create_course_day',
      context: {
        actor: accountCommandActor(adminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-course-day-admin-create',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 1,
        calendarInput: { localDate: '2026-12-02', localTime: '11:00', durationMinutes: 120 },
        timezone: 'Asia/Almaty',
      },
      intent: { courseId, courseDayId: secondDayId, instructorId },
    });
    expect(created.status).toBe('success');
    const firstOldIdentity = courseDayInstructorClaimIdentity({
      courseDayId: secondDayId,
      instructorId,
      occurrenceRevision: 1,
    });
    const secondOldIdentity = courseDayInstructorClaimIdentity({
      courseDayId: secondDayId,
      instructorId: secondInstructorId,
      occurrenceRevision: 1,
    });
    const firstOldClaim = ResourceClaimSchema.parse(
      (await firestore.doc(`resource_claims/${firstOldIdentity.instructorClaimId}`).get()).data()
    );
    await firestore.doc(`resource_claims/${secondOldIdentity.instructorClaimId}`).set(
      ResourceClaimSchema.parse({
        ...firstOldClaim,
        claimId: secondOldIdentity.instructorClaimId,
        resourceId: secondInstructorId,
      })
    );
    await firestore.doc(`courses/${courseId}/days/${secondDayId}`).update({
      actualInstructorIds: [instructorId, secondInstructorId],
    });

    const conflict = await commands.execute({
      kind: 'reschedule_course_day',
      context: {
        actor: accountCommandActor(adminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-course-day-admin-reschedule-conflict',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 2,
        calendarInput: { localDate: '2026-12-01', localTime: '10:00', durationMinutes: 120 },
        timezone: 'Asia/Almaty',
      },
      intent: {
        courseId,
        courseDayId: secondDayId,
        expectedCourseDayRevision: 1,
        reasonExplanation: 'Conflict proof',
      },
    });
    expect(conflict.status).toBe('error');

    const rescheduled = await commands.execute({
      kind: 'reschedule_course_day',
      context: {
        actor: accountCommandActor(adminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-course-day-admin-reschedule-safe',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 2,
        calendarInput: { localDate: '2026-12-03', localTime: '11:00', durationMinutes: 120 },
        timezone: 'Asia/Almaty',
      },
      intent: {
        courseId,
        courseDayId: secondDayId,
        expectedCourseDayRevision: 1,
        reasonExplanation: 'Safe schedule move',
      },
    });
    expect(rescheduled.status).toBe('success');
    const firstNewIdentity = courseDayInstructorClaimIdentity({
      courseDayId: secondDayId,
      instructorId,
      occurrenceRevision: 2,
    });
    const secondNewIdentity = courseDayInstructorClaimIdentity({
      courseDayId: secondDayId,
      instructorId: secondInstructorId,
      occurrenceRevision: 2,
    });
    for (const claimId of [
      firstOldIdentity.instructorClaimId,
      secondOldIdentity.instructorClaimId,
    ]) {
      const claim = ResourceClaimSchema.parse(
        (await firestore.doc(`resource_claims/${claimId}`).get()).data()
      );
      expect(claim.lifecycle.status).toBe('released');
    }
    for (const claimId of [
      firstNewIdentity.instructorClaimId,
      secondNewIdentity.instructorClaimId,
    ]) {
      const claim = ResourceClaimSchema.parse(
        (await firestore.doc(`resource_claims/${claimId}`).get()).data()
      );
      expect(claim.lifecycle.status).toBe('active');
    }

    const removed = await commands.execute({
      kind: 'remove_course_day',
      context: {
        actor: accountCommandActor(adminId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'idem-course-day-admin-remove-safe',
        correlationId,
        source: 'admin_callable',
        expectedRevision: 3,
      },
      intent: {
        courseId,
        courseDayId: secondDayId,
        expectedCourseDayRevision: 2,
        reasonExplanation: 'Remove unused future day',
      },
    });
    expect(removed.status).toBe('success');
    expect((await firestore.doc(`courses/${courseId}/days/${secondDayId}`).get()).exists).toBe(false);
    const finalCourse = CourseSchema.parse((await firestore.doc(`courses/${courseId}`).get()).data());
    expect(finalCourse.scheduleProjection.courseDayCount).toBe(1);
    expect(finalCourse.scheduleProjection.courseScheduleRevision).toBe(4);
    for (const claimId of [
      firstNewIdentity.instructorClaimId,
      secondNewIdentity.instructorClaimId,
    ]) {
      const claim = ResourceClaimSchema.parse(
        (await firestore.doc(`resource_claims/${claimId}`).get()).data()
      );
      expect(claim.lifecycle.status).toBe('released');
    }
    const guards = await firestore.collection('resource_claim_guards').get();
    const activeGuardClaimIds = guards.docs.flatMap((document) => {
      const entries = document.data().entries;
      return Array.isArray(entries)
        ? entries.map((entry) => (entry as { claimId?: unknown }).claimId)
        : [];
    });
    expect(activeGuardClaimIds).not.toContain(firstOldIdentity.instructorClaimId);
    expect(activeGuardClaimIds).not.toContain(secondOldIdentity.instructorClaimId);
    expect(activeGuardClaimIds).not.toContain(firstNewIdentity.instructorClaimId);
    expect(activeGuardClaimIds).not.toContain(secondNewIdentity.instructorClaimId);
  });
});
