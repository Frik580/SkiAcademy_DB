import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  CourseDaySchema,
  CourseSchema,
  InstructorIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { queryInstructorOccupancyReadModels } from './instructorOccupancyReadModels';

const PROJECT_ID = 'ski-academy-instructor-occupancy-read-model-test';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const instructorA = InstructorIdSchema.parse('instructor_occupancy_emulator_a');
const instructorB = InstructorIdSchema.parse('instructor_occupancy_emulator_b');
const correlationId = CorrelationIdSchema.parse('correlation_occupancy_emulator_01');
const createdAt = timestampFromDate(new Date('2026-09-01T00:00:00.000Z'));

let app: App;
let firestore: Firestore;

function courseRecord(courseId: string, instructorId: typeof instructorA) {
  return CourseSchema.parse({
    courseId,
    title: `Course ${courseId}`,
    lifecycle: 'active',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId],
    startAt: timestampFromDate(new Date('2026-09-10T04:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-09-10T06:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_occupancy_emulator_seed',
      lastChangedByCommandId: 'command_occupancy_emulator_seed',
      correlationId,
    },
  });
}

function dayRecord(courseId: string, courseDayId: string, instructorId: typeof instructorA) {
  return CourseDaySchema.parse({
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: {
      startsAt: timestampFromDate(new Date('2026-09-10T04:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-09-10T06:00:00.000Z')),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_occupancy_emulator_seed',
      lastChangedByCommandId: 'command_occupancy_emulator_seed',
      correlationId,
    },
  });
}

describeEmulator('Instructor occupancy read models', () => {
  beforeAll(() => {
    app =
      getApps().find((candidate) => candidate.name === PROJECT_ID) ??
      initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    const courses = await firestore.collection('courses').get();
    for (const course of courses.docs) {
      const days = await course.ref.collection('days').get();
      await Promise.all(days.docs.map((day) => day.ref.delete()));
    }
    await Promise.all(courses.docs.map((course) => course.ref.delete()));
    const instructors = await firestore.collection('instructors').get();
    await Promise.all(instructors.docs.map((instructor) => instructor.ref.delete()));

    await Promise.all(
      [instructorA, instructorB].map((instructorId) =>
        firestore.collection('instructors').doc(instructorId).set({
          id: instructorId,
          instructorId,
          name: instructorId,
          pricePerHourKZT: 12_000,
          isAvailable: true,
          revision: 1,
        })
      )
    );
    const fixtures = [
      ['course_occupancy_emulator_a', 'course_day_occupancy_emulator_a', instructorA],
      ['course_occupancy_emulator_b', 'course_day_occupancy_emulator_b', instructorB],
    ] as const;
    for (const [courseId, courseDayId, instructorId] of fixtures) {
      await firestore.collection('courses').doc(courseId).set(courseRecord(courseId, instructorId));
      await firestore
        .collection('courses')
        .doc(courseId)
        .collection('days')
        .doc(courseDayId)
        .set(dayRecord(courseId, courseDayId, instructorId));
    }
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('queries Course Days by instructor before assembling public occupancy', async () => {
    const result = await queryInstructorOccupancyReadModels(firestore, {
      scope: 'public_instructor_day',
      instructorId: instructorA,
      localDate: '2026-09-10',
      timeZone: 'Asia/Almaty',
    });

    expect(result.item.occupancy).toHaveLength(1);
    expect(result.item.occupancy[0]).toMatchObject({
      occupancyKind: 'course_day',
      instructorId: instructorA,
      courseId: 'course_occupancy_emulator_a',
    });
  });
});
