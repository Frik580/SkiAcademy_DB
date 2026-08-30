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
  PaymentSchema,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { queryCourseAttendanceReadModels } from './courseAttendanceReadModels';
import {
  queryCourseEnrollmentReadModels,
} from './courseEnrollmentReadModels';
import { queryInstructorCourseAssignmentReadModels } from './instructorCourseAssignmentReadModels';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';

const PROJECT_ID = 'ski-academy-instructor-roster-read-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_instructor_roster_read_01');
const rosterInstructorAccountId = AccountIdSchema.parse('account_instructor_roster_read_roster');
const courseDayInstructorAccountId = AccountIdSchema.parse('account_instructor_roster_read_day');
const strangerAccountId = AccountIdSchema.parse('account_instructor_roster_read_stranger');
const rosterInstructorId = InstructorIdSchema.parse('instructor_instructor_roster_read_roster');
const courseDayInstructorId = InstructorIdSchema.parse('instructor_instructor_roster_read_day');
const strangerInstructorId = InstructorIdSchema.parse('instructor_instructor_roster_read_stranger');
const participantId = ParticipantIdSchema.parse('participant_instructor_roster_read_enrolled');
const unenrolledParticipantId = ParticipantIdSchema.parse(
  'participant_instructor_roster_read_unenrolled'
);
const enrolledParticipantManagementId = ParticipantManagementIdSchema.parse(
  'management_instructor_roster_read_enrolled'
);
const unenrolledParticipantManagementId = ParticipantManagementIdSchema.parse(
  'management_instructor_roster_read_unenrolled'
);
const cancelledEnrollmentId = CourseEnrollmentIdSchema.parse(
  'enrollment_instructor_roster_read_cancelled'
);
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_instructor_roster_read_active');
const courseId = CourseIdSchema.parse('course_instructor_roster_read_01');
const courseDayId = CourseDayIdSchema.parse('course_day_instructor_roster_read_01');
const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
const cancelledPaymentId = paymentIdFromCourseEnrollmentId(cancelledEnrollmentId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const COURSE_PRICE_KZT = 50_000;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

let app: App;
let firestore: Firestore;

const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at: string) {
  return createProductionCanonicalCommands(
    environment(at),
    createFirestoreCanonicalTransactionExecutor(firestore)
  );
}

function instructorContext(
  actorAccountId: typeof rosterInstructorAccountId,
  transportInstructorId: typeof rosterInstructorId,
  idempotencyKey: string
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: 'instructor' as const,
    idempotencyKey,
    correlationId,
    source: 'client_callable' as const,
    transportMetadata: { instructor_id: transportInstructorId },
  };
}

function recordPresentEnvelope(idempotencyKey: string): CommandEnvelope<'record_course_day_attendance'> {
  return {
    kind: 'record_course_day_attendance',
    context: instructorContext(rosterInstructorAccountId, rosterInstructorId, idempotencyKey),
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
    },
  };
}

function attendanceIdFor(targetEnrollmentId: typeof enrollmentId): string {
  return attendanceIdFromCourseDayIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId: targetEnrollmentId,
    courseDayId,
  });
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
  for (const collection of [
    'users',
    'participants',
    'instructors',
    'courses',
    'course_enrollments',
    'payments',
    'attendance',
    'admin_issues',
    'command_idempotency',
  ] as const) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedFixture(options: {
  readonly courseDayInstructorIds?: readonly (typeof rosterInstructorId)[];
  readonly underfunded?: boolean;
} = {}) {
  const courseDayInstructorIds = options.courseDayInstructorIds ?? [rosterInstructorId];
  const underfunded = options.underfunded ?? false;

  for (const [accountId, instructorId] of [
    [rosterInstructorAccountId, rosterInstructorId],
    [courseDayInstructorAccountId, courseDayInstructorId],
    [strangerAccountId, strangerInstructorId],
  ] as const) {
    await firestore.doc(`users/${accountId}`).set(
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
    await firestore.doc(`instructors/${instructorId}`).set({
      id: instructorId,
      name: `Coach ${instructorId}`,
      pricePerHourKZT: 10_000,
      isAvailable: true,
    });
  }

  for (const [id, displayName, participantManagementId] of [
    [participantId, 'Enrolled Participant', enrolledParticipantManagementId],
    [unenrolledParticipantId, 'Unenrolled Participant', unenrolledParticipantManagementId],
  ] as const) {
    await firestore.doc(`participants/${id}`).set({
      participantId: id,
      displayName,
      age: { kind: 'age_years', years: 20 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId },
      lifecycle: { status: 'active' },
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

  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Instructor Roster Read Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 6 },
    instructorRosterIds: [rosterInstructorId],
    startAt: dayStart,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: dayEnd,
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

  await firestore.doc(`courses/${courseId}/days/${courseDayId}`).set({
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayStart, endsAt: dayEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [...courseDayInstructorIds],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });

  const enrollmentBase = {
    courseId,
    originalCourseId: courseId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: rosterInstructorAccountId },
    },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  };

  await firestore.doc(`course_enrollments/${enrollmentId}`).set({
    ...enrollmentBase,
    enrollmentId,
    participantId,
    paymentId,
    lifecycle: { status: 'confirmed' },
  });

  await firestore.doc(`course_enrollments/${cancelledEnrollmentId}`).set({
    ...enrollmentBase,
    enrollmentId: cancelledEnrollmentId,
    participantId: unenrolledParticipantId,
    paymentId: cancelledPaymentId,
    lifecycle: {
      status: 'cancelled',
      cancelledAt: decidedAt,
      reasonCode: 'administrator_cancelled',
    },
  });

  const fundedPayment = PaymentSchema.parse({
    paymentId,
    subjectType: 'course_enrollment',
    subjectId: enrollmentId,
    currency: 'KZT',
    originalPrice: COURSE_PRICE_KZT,
    price: COURSE_PRICE_KZT,
    paidAmount: underfunded ? 0 : COURSE_PRICE_KZT,
    refundedAmount: 0,
    retainedAmount: underfunded ? 0 : COURSE_PRICE_KZT,
    settledAmount: underfunded ? 0 : COURSE_PRICE_KZT,
    writtenOffAmount: 0,
    outstandingAmount: underfunded ? COURSE_PRICE_KZT : 0,
    paymentStatus: underfunded ? 'unpaid' : 'paid',
    incrementalRequirements: [],
    revision: 1,
    eventRevision: 1,
    payerAccountId: rosterInstructorAccountId,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });

  await firestore.doc(`payments/${paymentId}`).set(fundedPayment);
  await firestore.doc(`payments/${cancelledPaymentId}`).set({
    ...fundedPayment,
    paymentId: cancelledPaymentId,
    subjectId: cancelledEnrollmentId,
  });
}

describeEmulator('instructor course roster read models emulator', () => {
  beforeAll(async () => {
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
    await seedFixture();
  });

  it('allows roster instructor to read enrollment and attendance rosters', async () => {
    const enrollmentResult = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: rosterInstructorAccountId, instructorId: rosterInstructorId }
    );
    const attendanceResult = await queryCourseAttendanceReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: rosterInstructorAccountId, instructorId: rosterInstructorId }
    );

    expect(enrollmentResult.items).toHaveLength(1);
    expect(enrollmentResult.items[0]?.enrollmentId).toBe(enrollmentId);
    expect(attendanceResult.items).toHaveLength(1);
    expect(attendanceResult.items[0]?.participantId).toBe(participantId);
    expect(attendanceResult.items[0]?.days[0]?.factualState).toBe('missing');
  });

  it('allows instructor assigned only through CourseDay to read roster data', async () => {
    await clearCollections(firestore);
    await seedFixture({ courseDayInstructorIds: [courseDayInstructorId] });

    const enrollmentResult = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: courseDayInstructorAccountId, instructorId: courseDayInstructorId }
    );
    const attendanceResult = await queryCourseAttendanceReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: courseDayInstructorAccountId, instructorId: courseDayInstructorId }
    );

    expect(enrollmentResult.items).toHaveLength(1);
    expect(attendanceResult.items).toHaveLength(1);
  });

  it('discovers assigned courses for roster instructor via instructor_assigned scope', async () => {
    const result = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned' },
      { instructorId: rosterInstructorId }
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        courseId,
        title: 'Instructor Roster Read Course',
        assignedCourseDayIds: [courseDayId],
      }),
    ]);
  });

  it('discovers assigned courses for course-day-only instructor via instructor_assigned scope', async () => {
    await clearCollections(firestore);
    await seedFixture({ courseDayInstructorIds: [courseDayInstructorId] });

    const result = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned' },
      { instructorId: courseDayInstructorId }
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        courseId,
        assignedCourseDayIds: [courseDayId],
      }),
    ]);
  });

  it('returns empty instructor_assigned discovery for stranger instructor', async () => {
    const result = await queryInstructorCourseAssignmentReadModels(
      firestore,
      { scope: 'instructor_assigned' },
      { instructorId: strangerInstructorId }
    );

    expect(result.items).toEqual([]);
  });

  it('denies stranger instructor for both enrollment and attendance rosters', async () => {
    await expect(
      queryCourseEnrollmentReadModels(
        firestore,
        { scope: 'instructor_roster', courseId },
        { accountId: strangerAccountId, instructorId: strangerInstructorId }
      )
    ).rejects.toBeInstanceOf(ReadModelAccessDeniedError);

    await expect(
      queryCourseAttendanceReadModels(
        firestore,
        { scope: 'instructor_roster', courseId },
        { accountId: strangerAccountId, instructorId: strangerInstructorId }
      )
    ).rejects.toBeInstanceOf(ReadModelAccessDeniedError);
  });

  it('includes enrolled participant and excludes unenrolled participant', async () => {
    const result = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: rosterInstructorAccountId, instructorId: rosterInstructorId }
    );

    const participantIds = result.items.map((item) => item.participant.participantId);
    expect(participantIds).toContain(participantId);
    expect(participantIds).not.toContain(unenrolledParticipantId);
  });

  it('excludes terminal cancelled enrollment from active roster', async () => {
    const result = await queryCourseEnrollmentReadModels(
      firestore,
      { scope: 'instructor_roster', courseId },
      { accountId: rosterInstructorAccountId, instructorId: rosterInstructorId }
    );

    expect(result.items.map((item) => item.enrollmentId)).not.toContain(cancelledEnrollmentId);
  });

  it('persists underfunded present attendance and creates exactly one attendance_payment_conflict', async () => {
    await clearCollections(firestore);
    await seedFixture({ underfunded: true });

    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordPresentEnvelope('underfunded-present');
    expect((await commands.execute(envelope)).status).toBe('success');

    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(enrollmentId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');

    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
    expect(conflictIssues[0]?.id).toBe(
      adminIssueIdFromDedupeKey(
        adminIssueDedupeKeyFromIdentity(
          courseEnrollmentAttendancePaymentConflictIdentity({
            enrollmentId,
            occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
            participantId,
          })
        )
      )
    );
  });

  it('does not duplicate attendance payment conflict on idempotent replay', async () => {
    await clearCollections(firestore);
    await seedFixture({ underfunded: true });

    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordPresentEnvelope('underfunded-present-replay');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');

    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
  });

  it('returns canonical stale_version for stale attendance revision', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    await commands.execute(recordPresentEnvelope('stale-base'));

    const staleAttempt = await commands.execute({
      ...recordPresentEnvelope('stale-attempt'),
      intent: {
        courseEnrollmentId: enrollmentId,
        courseDayId,
        attendanceStatus: 'absent',
        expectedAttendanceRevision: AggregateRevisionSchema.parse(99),
      },
    });
    expect(staleAttempt.status).toBe('error');
    if (staleAttempt.status === 'error') {
      expect(staleAttempt.error.code).toBe('stale_version');
    }
  });
});
