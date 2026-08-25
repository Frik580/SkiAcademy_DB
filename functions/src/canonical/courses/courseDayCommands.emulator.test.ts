import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  initialCourseDayOccurrenceId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { courseDayInstructorClaimIdentity } from './courseDayClaimOperations';

const PROJECT_ID = 'ski-academy-course-day-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_day_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_course_day_admin_01');
const accountId = AccountIdSchema.parse('account_course_day_owner_01');
const participantId = ParticipantIdSchema.parse('participant_course_day_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_day_01');
const instructorId = InstructorIdSchema.parse('instructor_course_day_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_course_day_02');
const courseId = CourseIdSchema.parse('course_course_day_emulator_01');
const courseDayId = CourseDayIdSchema.parse('course_day_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_emulator_02');
const bookingId = BookingIdSchema.parse('booking_course_day_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructors',
  'courses',
  'bookings',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
] as const;

let app: App;
let firestore: Firestore;

type CalendarInput = {
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
};

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
}

function adminContext(
  idempotencyKey: string,
  calendarInput: CalendarInput = {
    localDate: '2026-02-01',
    localTime: '09:00',
    durationMinutes: 120,
  },
  expectedRevision?: number
) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    calendarInput,
    timezone: 'Asia/Almaty' as const,
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
  };
}

async function clearCollections(database: Firestore) {
  const coursesSnap = await database.collection('courses').get();
  for (const courseDoc of coursesSnap.docs) {
    const daysSnap = await courseDoc.ref.collection('days').get();
    if (!daysSnap.empty) {
      const batch = database.batch();
      daysSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  for (const collection of COLLECTIONS_TO_CLEAR) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedBase() {
  await firestore.doc(`users/${adminAccountId}`).set(
    AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    })
  );
  await firestore.doc(`users/${accountId}`).set(
    AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    })
  );
  await firestore.doc(`participants/${participantId}`).set({
    participantId,
    displayName: 'Course Day Participant',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`participant_management/${managementId}`).set({
    participantManagementId: managementId,
    participantId,
    accountId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 50_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  for (const [id, price] of [
    [instructorId, 12_000],
    [instructorTwoId, 15_000],
  ] as const) {
    await firestore.doc(`instructors/${id}`).set({
      id,
      name: `Instructor ${id}`,
      pricePerHourKZT: price,
      isAvailable: true,
    });
  }
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Course Day Emulator Course',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId, instructorTwoId],
    startAt: timestampFromDate(new Date('2026-02-01T03:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-01T03:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
}

function createCourseDayEnvelope(
  targetCourseDayId: typeof courseDayId,
  targetInstructorId: typeof instructorId,
  idempotencyKey: string,
  expectedRevision = 1,
  calendarInput: CalendarInput = {
    localDate: '2026-02-01',
    localTime: '09:00',
    durationMinutes: 120,
  }
): CommandEnvelope<'create_course_day'> {
  return {
    kind: 'create_course_day',
    context: adminContext(idempotencyKey, calendarInput, expectedRevision),
    intent: {
      courseDayId: targetCourseDayId,
      courseId,
      instructorId: targetInstructorId,
    },
  };
}

function reassignEnvelope(
  targetCourseDayId: typeof courseDayId,
  targetInstructorId: typeof instructorTwoId,
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'reassign_course_day_instructor'> {
  return {
    kind: 'reassign_course_day_instructor',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      courseId,
      courseDayId: targetCourseDayId,
      instructorId: targetInstructorId,
      reasonExplanation: 'Instructor reassignment for emulator test',
    },
  };
}

function createConfirmedBookingEnvelope(idempotencyKey: string): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId: CorrelationIdSchema.parse('correlation_course_day_booking_01'),
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-02-01',
        localTime: '10:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId,
      instructorId,
      participantIds: [participantId],
    },
  };
}

describe.sequential.runIf(runsOnFirestoreEmulator)('course day commands emulator', () => {
  beforeAll(() => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    await clearCollections(firestore);
    await seedBase();
  });

  it('A creates CourseDay and one instructor claim atomically', async () => {
    const commands = createCommands();
    const envelope = createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-a');
    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');

    const courseDaySnap = await firestore.doc(`courses/${courseId}/days/${courseDayId}`).get();
    expect(courseDaySnap.exists).toBe(true);
    expect(courseDaySnap.data()?.actualInstructorIds).toEqual([instructorId]);

    const occurrenceId = initialCourseDayOccurrenceId(courseDayId);
    const claimId = courseDayInstructorClaimIdentity({
      courseDayId,
      instructorId,
      occurrenceRevision: 1,
    }).instructorClaimId;
    const claimSnap = await firestore.doc(`resource_claims/${claimId}`).get();
    expect(claimSnap.exists).toBe(true);
    expect(claimSnap.data()?.lifecycle?.status).toBe('active');
    expect(claimSnap.data()?.occurrenceId).toBe(occurrenceId);

    const paymentSnap = await firestore.collection('payments').get();
    expect(paymentSnap.empty).toBe(true);
    const monetarySnap = await firestore.collection('monetary_events').get();
    expect(monetarySnap.empty).toBe(true);
    const walletSnap = await firestore.doc(`users/${accountId}/wallet/state`).get();
    expect(walletSnap.data()?.balance).toBe(50_000);

    const identity = resolveCommandIdempotencyIdentity(envelope);
    const activityLogSnap = await firestore
      .doc(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
      .get();
    expect(activityLogSnap.exists).toBe(true);
  });

  it('B rejects overlapping CourseDay when Booking instructor claim exists', async () => {
    const commands = createCommands('2026-01-01T00:00:00.000Z');
    const bookingResult = await commands.execute(
      createConfirmedBookingEnvelope('idem-course-day-booking-b')
    );
    expect(bookingResult.status).toBe('success');

    const courseDayResult = await commands.execute(
      createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-b')
    );
    expect(courseDayResult.status).toBe('error');
    if (courseDayResult.status === 'error') {
      expect(courseDayResult.error.code).toBe('instructor_conflict');
    }

    const courseDaySnap = await firestore.doc(`courses/${courseId}/days/${courseDayId}`).get();
    expect(courseDaySnap.exists).toBe(false);
  });

  it('C rejects overlapping Booking when CourseDay instructor claim exists', async () => {
    const commands = createCommands();
    const courseDayResult = await commands.execute(
      createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-c')
    );
    expect(courseDayResult.status).toBe('success');

    const bookingResult = await commands.execute(
      createConfirmedBookingEnvelope('idem-course-day-booking-c')
    );
    expect(bookingResult.status).toBe('error');
    if (bookingResult.status === 'error') {
      expect(bookingResult.error.code).toBe('instructor_conflict');
    }
  });

  it('D allows only one overlapping CourseDay for the same instructor', async () => {
    const commands = createCommands();
    const courseTwoId = CourseIdSchema.parse('course_course_day_emulator_02');
    await firestore.doc(`courses/${courseTwoId}`).set({
      courseId: courseTwoId,
      title: 'Second Course',
      price: 40_000,
      capacity: { totalSeats: 8, availableSeats: 8 },
      instructorRosterIds: [instructorId],
      startAt: timestampFromDate(new Date('2026-02-01T03:00:00.000Z')),
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-01T03:00:00.000Z')),
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    });

    const first = await commands.execute(
      createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-d1')
    );
    expect(first.status).toBe('success');

    const secondEnvelope: CommandEnvelope<'create_course_day'> = {
      kind: 'create_course_day',
      context: adminContext('idem-course-day-create-d2', {
        localDate: '2026-02-01',
        localTime: '09:00',
        durationMinutes: 120,
      }, 1),
      intent: {
        courseDayId: courseDayTwoId,
        courseId: courseTwoId,
        instructorId,
      },
    };
    const second = await commands.execute(secondEnvelope);
    expect(second.status).toBe('error');
  });

  it('E allows adjacent CourseDay and Booking intervals', async () => {
    const commands = createCommands();
    const adjacentCourseDay = await commands.execute(
      createCourseDayEnvelope(
        courseDayId,
        instructorId,
        'idem-course-day-create-e',
        1,
        {
          localDate: '2026-02-01',
          localTime: '09:00',
          durationMinutes: 60,
        }
      )
    );
    expect(adjacentCourseDay.status).toBe('success');

    const adjacentBookingEnvelope: CommandEnvelope<'create_confirmed_booking'> = {
      kind: 'create_confirmed_booking',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'idem-course-day-booking-e',
        correlationId: CorrelationIdSchema.parse('correlation_course_day_booking_e'),
        source: 'client_callable',
        calendarInput: {
          localDate: '2026-02-01',
          localTime: '10:00',
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
      },
      intent: {
        bookingId: BookingIdSchema.parse('booking_course_day_emulator_e'),
        instructorId,
        participantIds: [participantId],
      },
    };
    const bookingResult = await commands.execute(adjacentBookingEnvelope);
    expect(bookingResult.status).toBe('success');
  });

  it('G reassigns instructor with atomic claim swap', async () => {
    const commands = createCommands();
    await commands.execute(createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-g'));

    const result = await commands.execute(
      reassignEnvelope(courseDayId, instructorTwoId, 'idem-course-day-reassign-g')
    );
    expect(result.status).toBe('success');

    const courseDaySnap = await firestore.doc(`courses/${courseId}/days/${courseDayId}`).get();
    expect(courseDaySnap.data()?.actualInstructorIds).toEqual([instructorTwoId]);
    expect(courseDaySnap.data()?.revision).toBe(2);

    const oldClaimId = courseDayInstructorClaimIdentity({
      courseDayId,
      instructorId,
      occurrenceRevision: 1,
    }).instructorClaimId;
    const newClaimId = courseDayInstructorClaimIdentity({
      courseDayId,
      instructorId: instructorTwoId,
      occurrenceRevision: 2,
    }).instructorClaimId;
    const oldClaim = await firestore.doc(`resource_claims/${oldClaimId}`).get();
    const newClaim = await firestore.doc(`resource_claims/${newClaimId}`).get();
    expect(oldClaim.data()?.lifecycle?.status).toBe('released');
    expect(newClaim.data()?.lifecycle?.status).toBe('active');
  });

  it('H preserves old claim when reassignment target instructor conflicts', async () => {
    const commands = createCommands();
    await commands.execute(createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-create-h1'));
    await commands.execute(
      createCourseDayEnvelope(
        courseDayTwoId,
        instructorTwoId,
        'idem-course-day-create-h2',
        2,
        {
          localDate: '2026-02-01',
          localTime: '10:00',
          durationMinutes: 120,
        }
      )
    );

    const result = await commands.execute(
      reassignEnvelope(courseDayId, instructorTwoId, 'idem-course-day-reassign-h')
    );
    expect(result.status).toBe('error');

    const courseDaySnap = await firestore.doc(`courses/${courseId}/days/${courseDayId}`).get();
    expect(courseDaySnap.data()?.actualInstructorIds).toEqual([instructorId]);
    const oldClaimId = courseDayInstructorClaimIdentity({
      courseDayId,
      instructorId,
      occurrenceRevision: 1,
    }).instructorClaimId;
    const oldClaim = await firestore.doc(`resource_claims/${oldClaimId}`).get();
    expect(oldClaim.data()?.lifecycle?.status).toBe('active');
  });

  it('J replays create without duplicate writes', async () => {
    const commands = createCommands();
    const envelope = createCourseDayEnvelope(courseDayId, instructorId, 'idem-course-day-replay-j');
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');

    const claims = await firestore.collection('resource_claims').get();
    const courseDayClaims = claims.docs.filter(
      (doc) => doc.data()?.claimKind === 'instructor_course_day'
    );
    expect(courseDayClaims.length).toBe(1);
  });

  it('K rejects stale course revision on create', async () => {
    const commands = createCommands();
    const staleEnvelope = createCourseDayEnvelope(
      courseDayId,
      instructorId,
      'idem-course-day-stale-k',
      99
    );
    const result = await commands.execute(staleEnvelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
    }
  });
});
