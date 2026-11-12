import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  AccountIdSchema,
  AdministrativeAvailabilityBlockSchema,
  BookingSchema,
  BookingIdSchema,
  CourseDaySchema,
  CourseSchema,
  InstructorIdSchema,
  timestampFromDate,
  paymentIdFromBookingId,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import { queryInstructorOccupancyReadModels } from './instructorOccupancyReadModels';
import { queryAdminPlannerReadModels } from './adminPlannerReadModels';

const PROJECT_ID = 'demo-ski-school-e2e';
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
    for (const name of ['bookings', 'administrative_availability_blocks']) {
      const snapshot = await firestore.collection(name).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
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
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('queries Course Days by instructor before assembling public occupancy', async () => {
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

  it.each([
    ['Europe/Paris', '2026-03-29', 'day', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
    ['Europe/Paris', '2026-10-25', 'day', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
    ['America/New_York', '2026-03-08', 'day', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
    ['America/New_York', '2026-11-01', 'day', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
    ['Asia/Almaty', '2026-09-10', 'day', '2026-09-09T19:00:00Z', '2026-09-10T19:00:00Z'],
    ['Europe/Paris', '2026-03-23', 'week', '2026-03-22T23:00:00Z', '2026-03-29T22:00:00Z'],
    ['Europe/Paris', '2026-10-19', 'week', '2026-10-18T22:00:00Z', '2026-10-25T23:00:00Z'],
    ['Asia/Almaty', '2026-09-07', 'week', '2026-09-06T19:00:00Z', '2026-09-13T19:00:00Z'],
    ['Europe/Paris', '2026-12-28', 'week', '2026-12-27T23:00:00Z', '2027-01-03T23:00:00Z'],
  ] as const)('reads actual half-open %s %s %s occupancy', async (zone, date, view, start, end) => {
    const from = Date.parse(start) / 1_000;
    const to = Date.parse(end) / 1_000;
    const window: TimeInterval = {
      startsAt: { seconds: from, nanoseconds: 0 },
      endsAt: { seconds: to, nanoseconds: 0 },
    };
    const scenarios = [
      ['last_minute', to - 60, to, true],
      ['next_midnight', to, to + 60, false],
      ['ends_at_start', from - 60, from, false],
      ['crosses_start', from - 60, from + 60, true],
      ['crosses_end', to - 60, to + 60, true],
    ] as const;
    const expected: string[] = [];
    const originals = new Map<string, TimeInterval>();
    const batch = firestore.batch();
    for (const instructor of [instructorA, instructorB]) {
      const courseId = `course_dst_${instructor}`;
      batch.set(firestore.doc(`courses/${courseId}`), courseRecord(courseId, instructor));
      for (const [label, begins, ends, included] of scenarios) {
        const suffix = `${instructor}_${label}`;
        const interval: TimeInterval = {
          startsAt: { seconds: begins, nanoseconds: 0 },
          endsAt: { seconds: ends, nanoseconds: 0 },
        };
        const booking = BookingSchema.parse({
          bookingId: `booking_${suffix}`,
          attribution: {
            bookingOrigin: 'account',
            bookedBy: { kind: 'account', accountId: 'account_dst' },
          },
          party: { kind: 'individual', participantIds: ['participant_dst'] },
          occurrence: {
            occurrenceId: `occurrence_${suffix}`,
            instructorId: instructor,
            interval,
            timeZone: zone,
            scheduleRevision: 1,
            serviceParty: { participantIds: ['participant_dst'] },
          },
          lifecycle: { status: 'confirmed' },
          paymentId: paymentIdFromBookingId(BookingIdSchema.parse(`booking_${suffix}`)),
          payerAccountId: 'account_dst',
          revision: 1,
          createdAt,
          updatedAt: createdAt,
          audit: courseRecord(courseId, instructor).audit,
        });
        const block = AdministrativeAvailabilityBlockSchema.parse({
          blockId: `block_${suffix}`,
          instructorId: instructor,
          kind: 'break',
          interval,
          timeZone: zone,
          notes: 'Private note',
          lifecycle: 'active',
          scheduleRevision: 1,
          revision: 1,
          createdAt,
          updatedAt: createdAt,
        });
        const day = CourseDaySchema.parse({
          ...dayRecord(courseId, `day_${suffix}`, instructor),
          interval,
          timeZone: zone,
        });
        batch.set(firestore.doc(`bookings/${booking.bookingId}`), booking);
        batch.set(firestore.doc(`administrative_availability_blocks/${block.blockId}`), block);
        batch.set(firestore.doc(`courses/${courseId}/days/${day.courseDayId}`), day);
        if (included) {
          for (const id of [booking.bookingId, block.blockId, `${day.courseDayId}:${instructor}`]) {
            expected.push(id);
            originals.set(id, interval);
          }
        }
      }
    }
    await batch.commit();
    const admin = await queryAdminPlannerReadModels(
      firestore,
      {
        kind: 'administrator',
        accountId: AccountIdSchema.parse('account_dst_admin'),
      },
      { scope: 'admin_planner', localDate: date, timeZone: zone, view }
    );
    expect(admin.item.window).toEqual(window);
    expect(admin.item.truncated).toBe(false);
    expect(admin.item.occupancy.map((item) => item.occupancyId).sort()).toEqual(expected.sort());
    for (const item of admin.item.occupancy)
      expect(item.interval).toEqual(originals.get(item.occupancyId));
    if (view === 'day') {
      const result = await queryInstructorOccupancyReadModels(firestore, {
        scope: 'public_instructor_day',
        instructorId: instructorA,
        localDate: date,
        timeZone: zone,
      });
      expect(result.item.window).toEqual(window);
      expect(result.item.occupancy.map((item) => item.occupancyId).sort()).toEqual(
        expected.filter((id) => id.includes(instructorA)).sort()
      );
      for (const item of result.item.occupancy) {
        expect(item.instructorId).toBe(instructorA);
        expect(item.interval).toEqual(originals.get(item.occupancyId));
        expect(item.notes).toBeUndefined();
        expect(item.participantId).toBeUndefined();
        expect(item.payerAccountId).toBeUndefined();
        if (item.occupancyKind === 'lesson_booking') expect(item.displayTitle).toBe('Booked');
      }
    }
  });
});
