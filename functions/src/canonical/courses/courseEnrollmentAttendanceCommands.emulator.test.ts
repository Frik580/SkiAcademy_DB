import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-course-attendance-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_attendance_emulator_01');
const accountId = AccountIdSchema.parse('account_course_attendance_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_course_attendance_emulator_admin');
const instructorAccountId = AccountIdSchema.parse('account_course_attendance_emulator_instructor');
const participantId = ParticipantIdSchema.parse('participant_course_attendance_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_attendance_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_course_attendance_emulator_01');
const courseId = CourseIdSchema.parse('course_course_attendance_emulator_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_attendance_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_attendance_emulator_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_attendance_emulator_03');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_course_attendance_emulator_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));
const dayThreeStart = timestampFromDate(new Date('2026-02-03T03:00:00.000Z'));
const dayThreeEnd = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));
const COURSE_PRICE_KZT = 50_000;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'instructors',
  'courses',
  'course_enrollments',
  'payments',
  'monetary_events',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
  'admin_issues',
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at: string) {
  return createProductionCanonicalCommands(environment(at), createFirestoreCanonicalTransactionExecutor(firestore));
}

function instructorContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(instructorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: instructorId },
  };
}

function recordEnvelope(
  courseDayId: typeof courseDayOneId,
  attendanceStatus: 'present' | 'absent',
  idempotencyKey: string
): CommandEnvelope<'record_course_day_attendance'> {
  return {
    kind: 'record_course_day_attendance',
    context: instructorContext(idempotencyKey),
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus,
    },
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

async function seedCourseAttendanceFixture(database: Firestore) {
  await database.doc(`users/${accountId}`).set(
    AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    })
  );
  await database.doc(`users/${instructorAccountId}`).set(
    AccountSchema.parse({
      accountId: instructorAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    })
  );
  await database.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Emulator Attendance Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: 3,
      finalCourseDayEndsAt: dayThreeEnd,
      courseScheduleRevision: 1,
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  const daySpecs = [
    { courseDayId: courseDayOneId, dayOrder: 1, interval: { startsAt: dayOneStart, endsAt: dayOneEnd } },
    { courseDayId: courseDayTwoId, dayOrder: 2, interval: { startsAt: dayTwoStart, endsAt: dayTwoEnd } },
    { courseDayId: courseDayThreeId, dayOrder: 3, interval: { startsAt: dayThreeStart, endsAt: dayThreeEnd } },
  ];
  for (const day of daySpecs) {
    await database.doc(`courses/${courseId}/days/${day.courseDayId}`).set({
      courseId,
      courseDayId: day.courseDayId,
      dayOrder: day.dayOrder,
      interval: day.interval,
      timeZone: 'Asia/Almaty',
      actualInstructorIds: [instructorId],
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    });
  }
  await database.doc(`course_enrollments/${enrollmentId}`).set({
    enrollmentId,
    participantId,
    courseId,
    originalCourseId: courseId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId },
    },
    lifecycle: { status: 'confirmed' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  await database.doc(`payments/${paymentIdFromCourseEnrollmentId(enrollmentId)}`).set({
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    subject: { subjectType: 'course_enrollment', subjectId: enrollmentId },
    price: COURSE_PRICE_KZT,
    paidAmount: COURSE_PRICE_KZT,
    refundedAmount: 0,
    settledAmount: COURSE_PRICE_KZT,
    outstandingAmount: 0,
    payerAccountId: accountId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

describeEmulator('courseEnrollmentAttendanceCommands emulator', () => {
  beforeAll(async () => {
    if (!runsOnFirestoreEmulator) return;
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (!runsOnFirestoreEmulator) return;
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    if (!runsOnFirestoreEmulator) return;
    await clearCollections(firestore);
    await seedCourseAttendanceFixture(firestore);
  });

  it('A. records durable instructor attendance with deterministic identity', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'idem-emulator-attendance-a')
    );
    expect(result.status).toBe('success');
    const attendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseDayId: courseDayOneId,
    });
    const attendance = await firestore.doc(`attendance/${attendanceId}`).get();
    expect(attendance.exists).toBe(true);
    expect(attendance.data()?.attendanceStatus).toBe('present');
    const payment = await firestore.doc(`payments/${paymentIdFromCourseEnrollmentId(enrollmentId)}`).get();
    expect(payment.data()?.paidAmount).toBe(COURSE_PRICE_KZT);
  }, 30_000);
});
