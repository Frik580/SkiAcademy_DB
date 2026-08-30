import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  AttendanceSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  PaymentSchema,
  ResourceClaimSchema,
  WalletSchema,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS,
  buildActiveCourseEnrollmentGuard,
  buildCourseSeatClaimIdentity,
  buildParticipantCourseDayEnrollmentClaimIdentity,
  courseDayOccurrenceIdFromRevision,
  courseEnrollmentSeatOccurrenceId,
  initialCourseDayOccurrenceId,
  missingCourseDayAttendanceIssueIdentity,
  paymentIdFromCourseEnrollmentId,
  readAggregateRevision,
  resolveCommandIdempotencyIdentity,
  canonicalPaths,
  canonicalTimestampToEpochMs,
  addMillisecondsToCanonicalTimestamp,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { courseDayInstructorClaimIdentity } from './courseDayClaimOperations';

const PROJECT_ID = 'ski-academy-course-attendance-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_attendance_emulator_01');
const accountId = AccountIdSchema.parse('account_course_attendance_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_course_attendance_emulator_admin');
const instructorAccountId = AccountIdSchema.parse('account_course_attendance_emulator_instructor');
const instructorTwoAccountId = AccountIdSchema.parse('account_course_attendance_emulator_instructor_02');
const participantId = ParticipantIdSchema.parse('participant_course_attendance_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_attendance_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_course_attendance_emulator_01');
const instructorTwoId = InstructorIdSchema.parse('instructor_course_attendance_emulator_02');
const courseId = CourseIdSchema.parse('course_course_attendance_emulator_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_attendance_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_attendance_emulator_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_attendance_emulator_03');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_course_attendance_emulator_01');
const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));
const dayThreeStart = timestampFromDate(new Date('2026-02-03T03:00:00.000Z'));
const dayThreeEnd = timestampFromDate(new Date('2026-02-03T05:00:00.000Z'));
const COURSE_PRICE_KZT = 50_000;
const WALLET_START_KZT = 50_000;

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

const DAY_INTERVALS = {
  1: { startsAt: dayOneStart, endsAt: dayOneEnd },
  2: { startsAt: dayTwoStart, endsAt: dayTwoEnd },
  3: { startsAt: dayThreeStart, endsAt: dayThreeEnd },
} as const;

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
  actorAccountId: typeof instructorAccountId,
  transportInstructorId: typeof instructorId,
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

function adminContext(idempotencyKey: string) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
  };
}

function recordEnvelope(
  courseDayId: typeof courseDayOneId,
  attendanceStatus: 'present' | 'absent',
  idempotencyKey: string,
  options: {
    expectedAttendanceRevision?: number;
    expectedEnrollmentRevision?: number;
    instructorAccountId?: typeof instructorAccountId;
    instructorId?: typeof instructorId;
  } = {}
): CommandEnvelope<'record_course_day_attendance'> {
  const actorAccountId = options.instructorAccountId ?? instructorAccountId;
  const transportInstructorId = options.instructorId ?? instructorId;
  return {
    kind: 'record_course_day_attendance',
    context: instructorContext(actorAccountId, transportInstructorId, idempotencyKey),
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus,
      ...(options.expectedAttendanceRevision === undefined
        ? {}
        : {
            expectedAttendanceRevision: AggregateRevisionSchema.parse(
              options.expectedAttendanceRevision
            ),
          }),
      ...(options.expectedEnrollmentRevision === undefined
        ? {}
        : {
            expectedEnrollmentRevision: AggregateRevisionSchema.parse(
              options.expectedEnrollmentRevision
            ),
          }),
    },
  };
}

function resolveEnvelope(idempotencyKey: string): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor('system_actor_course_attendance_emulator_resolve'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent: {
      subjectKind: 'course_enrollment',
      subjectId: enrollmentId,
    },
  };
}

function reassignEnvelope(
  targetCourseDayId: typeof courseDayThreeId,
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
      reasonExplanation: 'Instructor reassignment for attendance emulator test',
    },
  };
}

function attendanceIdFor(courseDayId: typeof courseDayOneId): string {
  return attendanceIdFromCourseDayIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId,
    courseDayId,
  });
}

async function readAttendanceRevision(
  courseDayId: typeof courseDayOneId
): Promise<number | undefined> {
  const attendance = await firestore.doc(`attendance/${attendanceIdFor(courseDayId)}`).get();
  return readAggregateRevision(attendance.data() as Record<string, unknown> | undefined);
}

async function readEnrollmentRevision(): Promise<number | undefined> {
  const enrollment = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  return readAggregateRevision(enrollment.data() as Record<string, unknown> | undefined);
}

function isoFromTimestamp(timestamp: { seconds: number; nanoseconds: number }): string {
  return new Date(canonicalTimestampToEpochMs(timestamp)).toISOString();
}

function isoAtInstructorWindowEnd(endsAt: { seconds: number; nanoseconds: number }): string {
  return isoFromTimestamp(
    addMillisecondsToCanonicalTimestamp(endsAt, BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS)
  );
}

function isoAfterFinalCourseDayEnd(): string {
  return '2026-02-03T06:00:00.000Z';
}

function isoAtAutomationEligible(): string {
  return isoFromTimestamp(
    addMillisecondsToCanonicalTimestamp(dayThreeEnd, BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS)
  );
}

function isoBeforeAutomationEligible(): string {
  const automationAt = addMillisecondsToCanonicalTimestamp(
    dayThreeEnd,
    BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS
  );
  return isoFromTimestamp(addMillisecondsToCanonicalTimestamp(automationAt, -1));
}

function assertNoUndefinedDeep(value: unknown, path = 'root'): void {
  if (value === undefined) {
    throw new Error(`undefined value at ${path}`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedDeep(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefinedDeep(entry, `${path}.${key}`);
  }
}

function paymentFinancialSnapshot(data: Record<string, unknown> | undefined) {
  return {
    price: data?.price,
    paidAmount: data?.paidAmount,
    retainedAmount: data?.retainedAmount,
    settledAmount: data?.settledAmount,
    outstandingAmount: data?.outstandingAmount,
    refundedAmount: data?.refundedAmount,
    paymentStatus: data?.paymentStatus,
    incrementalRequirements: data?.incrementalRequirements,
  };
}

function walletSnapshot(data: Record<string, unknown> | undefined) {
  return {
    balance: data?.balance,
    revision: data?.revision,
    eventRevision: data?.eventRevision,
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

async function seedEnrollmentResourceClaims(database: Firestore) {
  const daySpecs = [
    { courseDayId: courseDayOneId, dayOrder: 1 as const },
    { courseDayId: courseDayTwoId, dayOrder: 2 as const },
    { courseDayId: courseDayThreeId, dayOrder: 3 as const },
  ];

  const seatIdentity = buildCourseSeatClaimIdentity({
    courseId,
    enrollmentId,
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
  });
  await database.doc(`resource_claims/${seatIdentity.claimId}`).set(
    ResourceClaimSchema.parse({
      claimId: seatIdentity.claimId,
      strategyVersion: 'claim:v1',
      claimKind: 'course_seat_pre_start',
      resourceKind: 'course',
      resourceId: courseId,
      ownerKind: 'course_enrollment',
      ownerId: enrollmentId,
      occurrenceId: seatIdentity.identity.occurrenceId,
      interval: { startsAt: decidedAt, endsAt: dayThreeEnd },
      lifecycle: { status: 'active' },
      revision: 1,
      correlationId,
      lastChangedByCommandId: 'seed',
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );

  for (const day of daySpecs) {
    const courseDay = {
      courseId,
      courseDayId: day.courseDayId,
      dayOrder: day.dayOrder,
      interval: DAY_INTERVALS[day.dayOrder],
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
    };
    const dayIdentity = buildParticipantCourseDayEnrollmentClaimIdentity({
      participantId,
      enrollmentId,
      courseDay,
    });
    await database.doc(`resource_claims/${dayIdentity.claimId}`).set(
      ResourceClaimSchema.parse({
        claimId: dayIdentity.claimId,
        strategyVersion: 'claim:v1',
        claimKind: 'participant_course_day_enrollment',
        resourceKind: 'participant',
        resourceId: participantId,
        ownerKind: 'course_enrollment',
        ownerId: enrollmentId,
        occurrenceId: dayIdentity.occurrenceId,
        interval: DAY_INTERVALS[day.dayOrder],
        lifecycle: { status: 'active' },
        revision: 1,
        correlationId,
        lastChangedByCommandId: 'seed',
        createdAt: decidedAt,
        updatedAt: decidedAt,
      })
    );

    const instructorClaim = courseDayInstructorClaimIdentity({
      courseDayId: day.courseDayId,
      instructorId,
      occurrenceRevision: 1,
    });
    await database.doc(`resource_claims/${instructorClaim.instructorClaimId}`).set(
      ResourceClaimSchema.parse({
        claimId: instructorClaim.instructorClaimId,
        strategyVersion: 'claim:v1',
        claimKind: 'instructor_course_day',
        resourceKind: 'instructor',
        resourceId: instructorId,
        ownerKind: 'course_day',
        ownerId: day.courseDayId,
        occurrenceId: instructorClaim.occurrenceId,
        interval: DAY_INTERVALS[day.dayOrder],
        lifecycle: { status: 'active' },
        revision: 1,
        correlationId,
        lastChangedByCommandId: 'seed',
        createdAt: decidedAt,
        updatedAt: decidedAt,
      })
    );
  }

  const guard = buildActiveCourseEnrollmentGuard({
    participantId,
    courseId,
    courseEnrollmentId: enrollmentId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    lastChangedByCommandId: 'seed',
    correlationId,
  });
  const guardPath = canonicalPaths.activeCourseEnrollmentGuard(participantId, courseId).slice(1);
  await database.doc(guardPath).set(guard);
}

async function seedCourseAttendanceFixture(
  database: Firestore,
  enrollmentOverrides: Record<string, unknown> = {}
) {
  for (const id of [accountId, adminAccountId, instructorAccountId, instructorTwoAccountId]) {
    await database.doc(`users/${id}`).set(
      AccountSchema.parse({
        accountId: id,
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
  }

  await database.doc(`participants/${participantId}`).set({
    participantId,
    displayName: 'Emulator Attendance Participant',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
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

  await database.doc(`participant_management/${managementId}`).set({
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
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });

  await database.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: WALLET_START_KZT,
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
    await database.doc(`instructors/${id}`).set({
      id,
      name: `Emulator Coach ${id}`,
      pricePerHourKZT: price,
      isAvailable: true,
    });
  }

  await database.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Emulator Attendance Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId, instructorTwoId],
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
    { courseDayId: courseDayOneId, dayOrder: 1 },
    { courseDayId: courseDayTwoId, dayOrder: 2 },
    { courseDayId: courseDayThreeId, dayOrder: 3 },
  ] as const;

  for (const day of daySpecs) {
    await database.doc(`courses/${courseId}/days/${day.courseDayId}`).set({
      courseId,
      courseDayId: day.courseDayId,
      dayOrder: day.dayOrder,
      interval: DAY_INTERVALS[day.dayOrder],
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
    paymentId,
    payerAccountId: accountId,
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
    ...enrollmentOverrides,
  });

  await database.doc(`payments/${paymentId}`).set(
    PaymentSchema.parse({
      paymentId,
      subjectType: 'course_enrollment',
      subjectId: enrollmentId,
      currency: 'KZT',
      originalPrice: COURSE_PRICE_KZT,
      price: COURSE_PRICE_KZT,
      paidAmount: COURSE_PRICE_KZT,
      refundedAmount: 0,
      retainedAmount: COURSE_PRICE_KZT,
      settledAmount: COURSE_PRICE_KZT,
      writtenOffAmount: 0,
      outstandingAmount: 0,
      paymentStatus: 'paid',
      incrementalRequirements: [],
      revision: 1,
      eventRevision: 1,
      payerAccountId: accountId,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );

  await seedEnrollmentResourceClaims(database);
}

async function seedStaleAttendance(
  courseDayId: typeof courseDayThreeId,
  occurrenceRevision: number,
  attendanceStatus: 'present' | 'absent' = 'present'
) {
  const occurrenceId =
    occurrenceRevision === 1
      ? initialCourseDayOccurrenceId(courseDayId)
      : courseDayOccurrenceIdFromRevision(courseDayId, occurrenceRevision);
  const attendanceId = attendanceIdFor(courseDayId);
  await firestore.doc(`attendance/${attendanceId}`).set(
    AttendanceSchema.parse({
      attendanceId,
      subject: {
        subjectKind: 'course_enrollment',
        enrollmentId,
        courseId,
        courseDayId,
        occurrenceId,
        participantId,
      },
      attendanceStatus,
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: decidedAt,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: decidedAt,
      revision: 1,
      correlationId,
    })
  );
}

async function missingAttendanceIssues() {
  const issues = await firestore.collection('admin_issues').get();
  return issues.docs.filter((doc) => doc.data().kind === 'missing_attendance');
}

async function listEnrollmentOwnedClaims() {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs
    .filter(
      (doc) =>
        doc.data()?.ownerKind === 'course_enrollment' && doc.data()?.ownerId === enrollmentId
    )
    .map((doc) => doc.data());
}

async function readCourseAvailableSeats() {
  return (await firestore.doc(`courses/${courseId}`).get()).data()?.capacity?.availableSeats;
}

describeEmulator('courseEnrollmentAttendanceCommands emulator', () => {
  beforeAll(async () => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  }, 30_000);

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    await clearCollections(firestore);
    await seedCourseAttendanceFixture(firestore);
  }, 30_000);

  it('A. durable instructor attendance + idempotent replay', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordEnvelope(courseDayOneId, 'present', 'idem-emulator-attendance-a');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');

    const attendanceId = attendanceIdFor(courseDayOneId);
    const attendance = await firestore.doc(`attendance/${attendanceId}`).get();
    expect(attendance.exists).toBe(true);
    expect(attendance.data()?.attendanceStatus).toBe('present');
    expect(attendance.data()?.revision).toBe(1);

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.id).toBe(attendanceId);

    const activityLogs = await firestore.collection('activity_logs').get();
    expect(activityLogs.size).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('C. present -> absent -> present with distinct idempotency keys', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const attemptPresentA = 'attempt-present-a';
    const attemptAbsentB = 'attempt-absent-b';
    const attemptPresentC = 'attempt-present-c';

    const envelopeA = recordEnvelope(courseDayOneId, 'present', attemptPresentA);
    const resultA = await commands.execute(envelopeA);
    expect(resultA.status).toBe('success');
    expect(envelopeA.intent.expectedAttendanceRevision).toBeUndefined();
    expect(envelopeA.intent.expectedEnrollmentRevision).toBeUndefined();

    const retryA = await commands.execute(envelopeA);
    expect(retryA.status).toBe('success');

    const revisionAfterA = await readAttendanceRevision(courseDayOneId);
    expect(revisionAfterA).toBe(1);
    const enrollmentRevisionAfterA = await readEnrollmentRevision();
    expect(enrollmentRevisionAfterA).toBe(2);

    const envelopeB = recordEnvelope(courseDayOneId, 'absent', attemptAbsentB, {
      expectedAttendanceRevision: revisionAfterA,
    });
    expect(envelopeB.intent.expectedAttendanceRevision).toBe(1);
    expect(envelopeB.intent.expectedEnrollmentRevision).toBeUndefined();

    const resultB = await commands.execute(envelopeB);
    if (resultB.status === 'error') {
      throw new Error(
        `absent(B) failed: code=${resultB.error.code} details=${JSON.stringify(resultB.error.details)} currentRevision=${String(resultB.error.currentRevision)}`
      );
    }
    expect(resultB.status).toBe('success');

    const revisionAfterB = await readAttendanceRevision(courseDayOneId);
    expect(revisionAfterB).toBe(2);
    const enrollmentRevisionAfterB = await readEnrollmentRevision();
    expect(enrollmentRevisionAfterB).toBe(3);

    const envelopeC = recordEnvelope(courseDayOneId, 'present', attemptPresentC, {
      expectedAttendanceRevision: revisionAfterB,
    });
    expect(envelopeC.intent.expectedAttendanceRevision).toBe(2);
    expect(envelopeC.intent.expectedEnrollmentRevision).toBeUndefined();

    const resultC = await commands.execute(envelopeC);
    if (resultC.status === 'error') {
      throw new Error(
        `present(C) failed: code=${resultC.error.code} details=${JSON.stringify(resultC.error.details)} currentRevision=${String(resultC.error.currentRevision)}`
      );
    }
    expect(resultC.status).toBe('success');

    const attendanceId = attendanceIdFor(courseDayOneId);
    const attendance = await firestore.doc(`attendance/${attendanceId}`).get();
    expect(attendance.exists).toBe(true);
    expect(attendance.data()?.attendanceStatus).toBe('present');
    expect(attendance.data()?.revision).toBe(3);

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.id).toBe(attendanceId);
  }, 30_000);

  it('B. concurrent present vs absent same occurrence -> one winner, revision 1', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const [presentResult, absentResult] = await Promise.allSettled([
      commands.execute(recordEnvelope(courseDayOneId, 'present', 'concurrent-present')),
      commands.execute(recordEnvelope(courseDayOneId, 'absent', 'concurrent-absent')),
    ]);

    const outcomes = [presentResult, absentResult].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected'
    );
    expect(outcomes.filter((status) => status === 'success').length).toBe(1);
    expect(outcomes.filter((status) => status === 'error').length).toBe(1);

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    const attendance = attendanceDocs.docs[0]?.data();
    expect(attendance?.revision).toBe(1);
    expect(['present', 'absent']).toContain(attendance?.attendanceStatus);

    const loserEnvelope =
      presentResult.status === 'fulfilled' && presentResult.value.status === 'error'
        ? recordEnvelope(courseDayOneId, 'present', 'concurrent-present')
        : recordEnvelope(courseDayOneId, 'absent', 'concurrent-absent');
    const loserIdentity = resolveCommandIdempotencyIdentity(loserEnvelope);
    const loserIdempotency = await firestore
      .doc(`command_idempotency/${loserIdentity.identityKey}`)
      .get();
    expect(loserIdempotency.exists).toBe(false);
  }, 30_000);

  it('C. no outcome before final course day ends (record present on day 1-2, still confirmed)', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'present', 'early-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'present', 'early-day2'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('D. any-present after final day -> completed (absent, present, absent pattern)', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'pattern-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'present', 'pattern-day2'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'pattern-day3'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
  }, 30_000);

  it('E. all-absent -> no_show', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'all-absent-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'all-absent-day2'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'all-absent-day3'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('no_show');
  }, 30_000);

  it('F. absent + missing -> unresolved + exactly 2 missing issues for D2,D3 (D1 absent only)', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'missing-mix-day1'));

    const resolveCommands = createCommands(isoAtAutomationEligible());
    const envelope = resolveEnvelope('resolve-missing-mix');
    expect((await resolveCommands.execute(envelope)).status).toBe('success');
    expect((await resolveCommands.execute(envelope)).status).toBe('success');

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');

    const issues = await missingAttendanceIssues();
    expect(issues).toHaveLength(2);
    const courseDayIds = issues.map((issue) => issue.data().courseDayId).sort();
    expect(courseDayIds).toEqual([courseDayTwoId, courseDayThreeId].sort());
  }, 30_000);

  it('G. all missing -> unresolved + exactly 3 deduped issues on replay', async () => {
    const resolveCommands = createCommands(isoAtAutomationEligible());
    const envelope = resolveEnvelope('resolve-all-missing');
    expect((await resolveCommands.execute(envelope)).status).toBe('success');
    expect((await resolveCommands.execute(envelope)).status).toBe('success');

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');

    const issues = await missingAttendanceIssues();
    expect(issues).toHaveLength(3);
    const dedupeKeys = issues.map((issue) => {
      const identity = missingCourseDayAttendanceIssueIdentity({
        enrollmentId,
        courseDayId: issue.data().courseDayId,
        participantId,
        occurrenceId: issue.data().occurrenceId,
      });
      return adminIssueDedupeKeyFromIdentity(identity);
    });
    expect(new Set(dedupeKeys).size).toBe(3);
    for (const issue of issues) {
      const identity = missingCourseDayAttendanceIssueIdentity({
        enrollmentId,
        courseDayId: issue.data().courseDayId,
        participantId,
        occurrenceId: issue.data().occurrenceId,
      });
      expect(issue.id).toBe(adminIssueIdFromDedupeKey(adminIssueDedupeKeyFromIdentity(identity)));
    }
  }, 30_000);

  it('H. present + missing -> completed, zero missing issues', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'present', 'present-missing-day1'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'present-missing-day3'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');

    const issues = await missingAttendanceIssues();
    expect(issues).toHaveLength(0);
  }, 30_000);

  it('I. pending_cancellation stays pending_cancellation after all absent recorded', async () => {
    await clearCollections(firestore);
    await seedCourseAttendanceFixture(firestore, {
      lifecycle: { status: 'pending_cancellation', requestedAt: decidedAt },
    });

    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'pending-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'pending-day2'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'pending-day3'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('pending_cancellation');
  }, 30_000);

  it('J. cancelled enrollment not resurrected by resolver', async () => {
    await clearCollections(firestore);
    await seedCourseAttendanceFixture(firestore, {
      lifecycle: {
        status: 'cancelled',
        cancelledAt: decidedAt,
        reasonCode: 'administrator_cancelled',
      },
    });

    const resolveCommands = createCommands(isoAtAutomationEligible());
    const result = await resolveCommands.execute(resolveEnvelope('resolve-cancelled'));
    expect(result.status, JSON.stringify(result)).toBe('success');

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('cancelled');
  }, 30_000);

  it('K. occurrence rotation: stale day-3 evidence ignored; new instructor records at rev2', async () => {
    const reassignCommands = createCommands('2026-02-02T10:00:00.000Z');
    expect(
      (await reassignCommands.execute(
        reassignEnvelope(courseDayThreeId, instructorTwoId, 'rotate-day3-instructor')
      )).status
    ).toBe('success');

    await seedStaleAttendance(courseDayThreeId, 1, 'present');

    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'rotation-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'rotation-day2'));

    const resolveCommands = createCommands(isoAtAutomationEligible());
    expect((await resolveCommands.execute(resolveEnvelope('rotation-resolve'))).status).toBe(
      'success'
    );

    const enrollmentBeforeRecord = (await firestore.doc(`course_enrollments/${enrollmentId}`).get())
      .data();
    expect(enrollmentBeforeRecord?.lifecycle.status).toBe('confirmed');

    const staleIssues = await missingAttendanceIssues();
    expect(staleIssues).toHaveLength(1);
    expect(staleIssues[0]?.data().courseDayId).toBe(courseDayThreeId);
    expect(staleIssues[0]?.data().occurrenceId).toBe(
      courseDayOccurrenceIdFromRevision(courseDayThreeId, 2)
    );

    const dayThreeCommands = createCommands('2026-02-03T04:00:00.000Z');
    expect(
      (
        await dayThreeCommands.execute(
          recordEnvelope(courseDayThreeId, 'present', 'rotation-new-instructor', {
            instructorAccountId: instructorTwoAccountId,
            instructorId: instructorTwoId,
          })
        )
      ).status
    ).toBe('success');

    const attendanceId = attendanceIdFor(courseDayThreeId);
    const attendance = (await firestore.doc(`attendance/${attendanceId}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');
    expect(attendance?.subject.occurrenceId).toBe(
      courseDayOccurrenceIdFromRevision(courseDayThreeId, 2)
    );

    const oldInstructorAttempt = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'absent', 'rotation-old-forbidden')
    );
    expect(oldInstructorAttempt.status).toBe('error');
  }, 30_000);

  it('L. reassigned instructor authority: old forbidden, new allowed on day 3', async () => {
    const reassignCommands = createCommands('2026-02-02T10:00:00.000Z');
    expect(
      (await reassignCommands.execute(
        reassignEnvelope(courseDayThreeId, instructorTwoId, 'authority-reassign')
      )).status
    ).toBe('success');

    const dayThreeCommands = createCommands('2026-02-03T04:00:00.000Z');
    const oldAttempt = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'present', 'authority-old-forbidden')
    );
    expect(oldAttempt.status).toBe('error');

    const newAttempt = await dayThreeCommands.execute(
      recordEnvelope(courseDayThreeId, 'present', 'authority-new-allowed', {
        instructorAccountId: instructorTwoAccountId,
        instructorId: instructorTwoId,
      })
    );
    expect(newAttempt.status).toBe('success');
  }, 30_000);

  it('M. attendance vs resolver race - no no_show + present durable state', async () => {
    const commands = createCommands(isoAfterFinalCourseDayEnd());
    const [recordResult, resolveResult] = await Promise.allSettled([
      commands.execute(recordEnvelope(courseDayThreeId, 'present', 'race-present')),
      commands.execute(resolveEnvelope('race-resolve')),
    ]);
    expect([recordResult.status, resolveResult.status].every((status) => status === 'fulfilled')).toBe(
      true
    );

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const attendanceDocs = await firestore.collection('attendance').get();
    const attendanceStatus = attendanceDocs.docs[0]?.data()?.attendanceStatus;

    if (enrollment?.lifecycle.status === 'completed') {
      expect(attendanceStatus).toBe('present');
    }
    if (enrollment?.lifecycle.status === 'no_show') {
      expect(attendanceStatus).not.toBe('present');
    }
    if (attendanceStatus === 'present') {
      expect(enrollment?.lifecycle.status).not.toBe('no_show');
    }
  }, 30_000);

  it('N. concurrent resolver dedupe - one missing issue set', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'dedupe-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'dedupe-day2'));

    const resolveCommands = createCommands(isoAtAutomationEligible());
    const [resolveA, resolveB] = await Promise.allSettled([
      resolveCommands.execute(resolveEnvelope('dedupe-resolve-a')),
      resolveCommands.execute(resolveEnvelope('dedupe-resolve-b')),
    ]);
    expect([resolveA, resolveB].filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const resolveStatuses = [resolveA, resolveB].map((result) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected'
    );
    expect(resolveStatuses.every((status) => status === 'success')).toBe(true);

    const issues = await missingAttendanceIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.data().courseDayId).toBe(courseDayThreeId);

    expect((await resolveCommands.execute(resolveEnvelope('dedupe-resolve-a'))).status).toBe(
      'success'
    );
    const issuesAfterReplay = await missingAttendanceIssues();
    expect(issuesAfterReplay).toHaveLength(1);
  }, 30_000);

  it('O. terminal resource: completed/no_show does NOT increase availableSeats; participant day claims released', async () => {
    const seatsBefore = await readCourseAvailableSeats();
    const claimsBefore = await listEnrollmentOwnedClaims();
    expect(
      claimsBefore.filter((claim) => claim?.claimKind === 'participant_course_day_enrollment').length
    ).toBe(3);

    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'terminal-day1'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'terminal-day2'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'terminal-day3'));

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('no_show');
    expect(await readCourseAvailableSeats()).toBe(seatsBefore);

    const dayClaims = (await listEnrollmentOwnedClaims()).filter(
      (claim) => claim?.claimKind === 'participant_course_day_enrollment'
    );
    expect(dayClaims.filter((claim) => claim?.lifecycle?.status === 'released').length).toBe(3);
    const guardSnap = await firestore.collection('active_course_enrollment_guards').get();
    expect(guardSnap.empty).toBe(true);
  }, 30_000);

  it('P. payment + wallet immutability after record and after terminal outcome', async () => {
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const walletBefore = walletSnapshot(
      (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
    );

    const recordCommands = createCommands('2026-02-01T04:00:00.000Z');
    await recordCommands.execute(recordEnvelope(courseDayOneId, 'present', 'immutable-record'));

    const paymentAfterRecord = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const walletAfterRecord = walletSnapshot(
      (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
    );
    expect(paymentAfterRecord).toEqual(paymentBefore);
    expect(walletAfterRecord).toEqual(walletBefore);

    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'immutable-day2'));
    const dayThreeCommands = createCommands(isoAfterFinalCourseDayEnd());
    await dayThreeCommands.execute(recordEnvelope(courseDayThreeId, 'absent', 'immutable-day3'));

    const paymentAfterTerminal = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const walletAfterTerminal = walletSnapshot(
      (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
    );
    expect(paymentAfterTerminal).toEqual(paymentBefore);
    expect(walletAfterTerminal).toEqual(walletBefore);

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
  }, 30_000);

  it('Q. exact replay of record command', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordEnvelope(courseDayOneId, 'present', 'exact-replay');
    const first = await commands.execute(envelope);
    const second = await commands.execute(envelope);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');

    const attendanceDocs = await firestore.collection('attendance').get();
    expect(attendanceDocs.size).toBe(1);
    expect(attendanceDocs.docs[0]?.data()?.revision).toBe(1);
  }, 30_000);

  it('R. stale attendance revision rejected', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    await commands.execute(recordEnvelope(courseDayOneId, 'present', 'stale-revision-base'));

    const staleAttempt = await commands.execute(
      recordEnvelope(courseDayOneId, 'absent', 'stale-revision', { expectedAttendanceRevision: 99 })
    );
    expect(staleAttempt.status).toBe('error');

    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get())
      .data();
    expect(attendance?.attendanceStatus).toBe('present');
    expect(attendance?.revision).toBe(1);
  }, 30_000);

  // S. simulateRetry coverage lives in unit tests (transaction retry simulation is not emulator-safe).

  it('T. undefined serialization boundary on attendance write', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordEnvelope(courseDayOneId, 'present', 'undefined-boundary');
    expect((await commands.execute(envelope)).status).toBe('success');

    const attendanceDoc = (await firestore.collection('attendance').get()).docs[0];
    const enrollmentDoc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
    const activityLogDoc = (await firestore.collection('activity_logs').get()).docs[0];
    const idempotencyDoc = (await firestore.collection('command_idempotency').get()).docs[0];

    expect(() => assertNoUndefinedDeep(attendanceDoc?.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(enrollmentDoc.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(activityLogDoc?.data())).not.toThrow();
    expect(() => assertNoUndefinedDeep(idempotencyDoc?.data())).not.toThrow();
  }, 30_000);

  it('T-boundary-1. before startsAt rejected', async () => {
    const commands = createCommands('2026-02-01T02:59:59.999Z');
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'boundary-before-start')
    );
    expect(result.status).toBe('error');
    expect((await firestore.collection('attendance').get()).size).toBe(0);
  }, 30_000);

  it('T-boundary-2. exactly startsAt allowed', async () => {
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'boundary-exact-start')
    );
    expect(result.status).toBe('success');
    expect((await firestore.collection('attendance').get()).size).toBe(1);
  }, 30_000);

  it('T-boundary-3. exactly endsAt+24h instructor window boundary', async () => {
    const commands = createCommands(isoAtInstructorWindowEnd(dayOneEnd));
    const result = await commands.execute(
      recordEnvelope(courseDayOneId, 'present', 'boundary-window-end')
    );
    expect(result.status).toBe('success');
  }, 30_000);

  it('T-boundary-4. system before final+24h blocked for missing issues', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'boundary-sys-before-a'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'boundary-sys-before-b'));

    const resolveCommands = createCommands(isoBeforeAutomationEligible());
    expect((await resolveCommands.execute(resolveEnvelope('boundary-sys-before'))).status).toBe(
      'success'
    );

    const issues = await missingAttendanceIssues();
    expect(issues).toHaveLength(0);
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('T-boundary-5. system exactly final+24h creates missing issues', async () => {
    const dayOneCommands = createCommands('2026-02-01T04:00:00.000Z');
    await dayOneCommands.execute(recordEnvelope(courseDayOneId, 'absent', 'boundary-sys-exact-a'));
    const dayTwoCommands = createCommands('2026-02-02T04:00:00.000Z');
    await dayTwoCommands.execute(recordEnvelope(courseDayTwoId, 'absent', 'boundary-sys-exact-b'));

    const resolveCommands = createCommands(isoAtAutomationEligible());
    expect((await resolveCommands.execute(resolveEnvelope('boundary-sys-exact'))).status).toBe(
      'success'
    );

    const issues = await missingAttendanceIssues();
    expect(issues.length).toBeGreaterThan(0);
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('terminal correction: admin D3 absent->present repairs no_show to completed atomically', async () => {
    await clearCollections(firestore);
    await seedCourseAttendanceFixture(firestore, {
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      attendanceSummary: {
        recordedDayCount: 3,
        presentDayCount: 0,
        absentDayCount: 3,
        projectionRevision: 3,
      },
      revision: 2,
    });

    await seedStaleAttendance(courseDayOneId, 1, 'absent');
    await seedStaleAttendance(courseDayTwoId, 1, 'absent');
    await seedStaleAttendance(courseDayThreeId, 1, 'absent');

    const commands = createCommands(isoAfterFinalCourseDayEnd());
    const adminAttempt = await commands.execute({
      kind: 'record_course_day_attendance',
      context: adminContext('terminal-correction-success'),
      intent: {
        courseEnrollmentId: enrollmentId,
        courseDayId: courseDayThreeId,
        attendanceStatus: 'present',
        expectedAttendanceRevision: AggregateRevisionSchema.parse(1),
        expectedEnrollmentRevision: AggregateRevisionSchema.parse(2),
        reasonExplanation: 'D3 was actually present',
      },
    });
    expect(adminAttempt.status).toBe('success');

    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayThreeId)}`).get())
      .data();
    expect(attendance?.attendanceStatus).toBe('present');

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
  }, 30_000);
});
