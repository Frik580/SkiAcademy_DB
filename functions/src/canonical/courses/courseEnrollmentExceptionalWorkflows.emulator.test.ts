import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
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
  ResourceClaimSchema,
  WalletSchema,
  adminIssueDedupeKeyFromIdentity,
  adminIssueIdFromDedupeKey,
  attendanceIdFromCourseDayIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  buildActiveCourseEnrollmentGuard,
  buildCourseSeatClaimIdentity,
  buildParticipantCourseDayEnrollmentClaimIdentity,
  courseDayOccurrenceIdFromRevision,
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  initialCourseDayOccurrenceId,
  paymentIdFromCourseEnrollmentId,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  systemCommandActor,
  timestampFromDate,
  accountCommandActor,
  canonicalPaths,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-course-exceptional-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_exceptional_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_course_exceptional_emulator_02');
const accountId = 'account_course_exceptional_emulator_01';
const adminAccountId = 'account_course_exceptional_emulator_admin';
const instructorAccountId = 'account_course_exceptional_emulator_instructor';
const participantId = ParticipantIdSchema.parse('participant_course_exceptional_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_exceptional_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_course_exceptional_emulator_01');
const courseId = CourseIdSchema.parse('course_course_exceptional_emulator_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_exceptional_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_exceptional_emulator_02');
const courseDayThreeId = CourseDayIdSchema.parse('course_day_exceptional_emulator_03');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_course_exceptional_emulator_01');
const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
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
  'admin_issues',
  'attendance',
  'activity_logs',
  'command_idempotency',
  'monetary_events',
  'domain_outbox',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'provider_event_receipts',
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

function adminContext(idempotencyKey: string, correlation = correlationId) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId: correlation,
    source: 'admin_callable' as const,
  };
}

function gateEnvelope(idempotencyKey: string, correlation = correlationId): CommandEnvelope<'enforce_payment_start_gate'> {
  return {
    kind: 'enforce_payment_start_gate',
    context: {
      actor: systemCommandActor('system_exceptional_gate'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId: correlation,
      source: 'scheduler',
    },
    intent: { subjectKind: 'course_enrollment', subjectId: enrollmentId },
  };
}

function recordPresentEnvelope(
  idempotencyKey: string,
  options: {
    courseDayId?: typeof courseDayOneId;
    expectedAttendanceRevision?: number;
    expectedEnrollmentRevision?: number;
    reasonExplanation?: string;
    actor?: 'instructor' | 'admin';
  } = {}
): CommandEnvelope<'record_course_day_attendance'> {
  const courseDayId = options.courseDayId ?? courseDayOneId;
  const actor = options.actor ?? 'instructor';
  return {
    kind: 'record_course_day_attendance',
    context:
      actor === 'admin'
        ? adminContext(idempotencyKey)
        : {
            actor: accountCommandActor(instructorAccountId),
            exercisedCapability: 'instructor' as const,
            idempotencyKey,
            correlationId,
            source: 'client_callable',
            transportMetadata: { instructor_id: instructorId },
          },
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus: 'present',
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
      ...(options.reasonExplanation === undefined ? {} : { reasonExplanation: options.reasonExplanation }),
    },
  };
}

function recordAbsentEnvelope(
  idempotencyKey: string,
  courseDayId: typeof courseDayOneId,
  options: {
    expectedAttendanceRevision?: number;
    actor?: 'instructor' | 'admin';
  } = {}
): CommandEnvelope<'record_course_day_attendance'> {
  const actor = options.actor ?? 'instructor';
  return {
    kind: 'record_course_day_attendance',
    context:
      actor === 'admin'
        ? adminContext(idempotencyKey)
        : {
            actor: accountCommandActor(instructorAccountId),
            exercisedCapability: 'instructor' as const,
            idempotencyKey,
            correlationId,
            source: 'client_callable',
            transportMetadata: { instructor_id: instructorId },
          },
    intent: {
      courseEnrollmentId: enrollmentId,
      courseDayId,
      attendanceStatus: 'absent',
      ...(options.expectedAttendanceRevision === undefined
        ? {}
        : {
            expectedAttendanceRevision: AggregateRevisionSchema.parse(
              options.expectedAttendanceRevision
            ),
          }),
    },
  };
}

function providerPaymentEnvelope(
  amount: number,
  idempotencyKey: string,
  correlation = correlationIdB
): CommandEnvelope<'record_provider_payment_event'> {
  return {
    kind: 'record_provider_payment_event',
    context: adminContext(idempotencyKey, correlation),
    intent: {
      paymentId,
      amount,
      sourceKind: 'manual_external',
      manualReference: `manual-ref-${idempotencyKey}`,
    },
  };
}

function paymentStartIssueId(): string {
  return adminIssueIdFromDedupeKey(
    adminIssueDedupeKeyFromIdentity(
      paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(enrollmentId)
    )
  );
}

function paymentConflictIssueId(): string {
  return adminIssueIdFromDedupeKey(
    adminIssueDedupeKeyFromIdentity(
      courseEnrollmentAttendancePaymentConflictIdentity({
        enrollmentId,
        occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
        participantId,
      })
    )
  );
}

function attendanceIdFor(courseDayId: typeof courseDayOneId): string {
  return attendanceIdFromCourseDayIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId,
    courseDayId,
  });
}

function paymentFinancialSnapshot(data: Record<string, unknown> | undefined) {
  return {
    originalPrice: data?.originalPrice,
    price: data?.price,
    paidAmount: data?.paidAmount,
    refundedAmount: data?.refundedAmount,
    retainedAmount: data?.retainedAmount,
    settledAmount: data?.settledAmount,
    writtenOffAmount: data?.writtenOffAmount,
    outstandingAmount: data?.outstandingAmount,
    payerAccountId: data?.payerAccountId,
    eventRevision: data?.eventRevision,
    paymentStatus: data?.paymentStatus,
    revision: data?.revision,
  };
}

function walletSnapshot(data: Record<string, unknown> | undefined) {
  return {
    balance: data?.balance,
    revision: data?.revision,
  };
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

async function clearAll() {
  const coursesSnap = await firestore.collection('courses').get();
  for (const courseDoc of coursesSnap.docs) {
    const daysSnap = await courseDoc.ref.collection('days').get();
    if (!daysSnap.empty) {
      const batch = firestore.batch();
      daysSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  for (const collection of COLLECTIONS_TO_CLEAR) {
    const snap = await firestore.collection(collection).get();
    if (snap.empty) continue;
    const batch = firestore.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedEnrollmentResourceClaims(dayCount: 1 | 3 = 1) {
  const daySpecs =
    dayCount === 3
      ? [
          { courseDayId: courseDayOneId, dayOrder: 1 as const },
          { courseDayId: courseDayTwoId, dayOrder: 2 as const },
          { courseDayId: courseDayThreeId, dayOrder: 3 as const },
        ]
      : [{ courseDayId: courseDayOneId, dayOrder: 1 as const }];

  const seatIdentity = buildCourseSeatClaimIdentity({
    courseId,
    enrollmentId,
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
  });
  await firestore.doc(`resource_claims/${seatIdentity.claimId}`).set(
    ResourceClaimSchema.parse({
      claimId: seatIdentity.claimId,
      strategyVersion: 'claim:v1',
      claimKind: 'course_seat_pre_start',
      resourceKind: 'course',
      resourceId: courseId,
      ownerKind: 'course_enrollment',
      ownerId: enrollmentId,
      occurrenceId: seatIdentity.identity.occurrenceId,
      interval: {
        startsAt: decidedAt,
        endsAt: dayCount === 3 ? dayThreeEnd : dayOneEnd,
      },
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
    const identity = buildParticipantCourseDayEnrollmentClaimIdentity({
      participantId,
      enrollmentId,
      courseDay,
    });
    await firestore.doc(`resource_claims/${identity.claimId}`).set(
      ResourceClaimSchema.parse({
        claimId: identity.claimId,
        strategyVersion: 'claim:v1',
        claimKind: 'participant_course_day_enrollment',
        resourceKind: 'participant',
        resourceId: participantId,
        ownerKind: 'course_enrollment',
        ownerId: enrollmentId,
        occurrenceId: identity.occurrenceId,
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
  await firestore.doc(guardPath).set(guard);
}

async function listEnrollmentOwnedClaims() {
  const snap = await firestore.collection('resource_claims').get();
  return snap.docs
    .map((doc) => doc.data())
    .filter((claim) => claim?.ownerId === enrollmentId);
}

async function readCourseAvailableSeats() {
  return (await firestore.doc(`courses/${courseId}`).get()).data()?.capacity?.availableSeats;
}

async function seedBase(options: {
  underfunded?: boolean;
  dayCount?: 1 | 3;
  lifecycle?: Record<string, unknown>;
  enrollmentRevision?: number;
} = {}) {
  const underfunded = options.underfunded ?? false;
  const dayCount = options.dayCount ?? 1;
  await clearAll();
  for (const id of [accountId, adminAccountId, instructorAccountId]) {
    await firestore.doc(`users/${id}`).set(
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
  await firestore.doc(`participants/${participantId}`).set({
    participantId,
    displayName: 'Exceptional Participant',
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
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 0,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Exceptional Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Exceptional Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: dayCount,
      finalCourseDayEndsAt: dayCount === 3 ? dayThreeEnd : dayOneEnd,
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
  const daySpecs =
    dayCount === 3
      ? [
          { courseDayId: courseDayOneId, dayOrder: 1 as const },
          { courseDayId: courseDayTwoId, dayOrder: 2 as const },
          { courseDayId: courseDayThreeId, dayOrder: 3 as const },
        ]
      : [{ courseDayId: courseDayOneId, dayOrder: 1 as const }];
  for (const day of daySpecs) {
    await firestore.doc(`courses/${courseId}/days/${day.courseDayId}`).set({
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
  await firestore.doc(`course_enrollments/${enrollmentId}`).set({
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
    lifecycle: options.lifecycle ?? { status: 'confirmed' },
    revision: options.enrollmentRevision ?? 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  const payment = underfunded
    ? PaymentSchema.parse({
        paymentId,
        subjectType: 'course_enrollment',
        subjectId: enrollmentId,
        currency: 'KZT',
        originalPrice: COURSE_PRICE_KZT,
        price: COURSE_PRICE_KZT,
        paidAmount: 0,
        refundedAmount: 0,
        retainedAmount: 0,
        settledAmount: 0,
        writtenOffAmount: 0,
        outstandingAmount: COURSE_PRICE_KZT,
        paymentStatus: 'unpaid',
        incrementalRequirements: [],
        revision: 1,
        eventRevision: 1,
        payerAccountId: accountId,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      })
    : PaymentSchema.parse({
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
      });
  await firestore.doc(`payments/${paymentId}`).set(payment);
  await seedEnrollmentResourceClaims(dayCount);
}

async function seedAttendance(
  courseDayId: typeof courseDayOneId,
  attendanceStatus: 'present' | 'absent',
  occurrenceRevision = 1
) {
  const attendanceId = attendanceIdFor(courseDayId);
  await firestore.doc(`attendance/${attendanceId}`).set({
    attendanceId,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId,
      courseDayId,
      occurrenceId:
        occurrenceRevision === 1
          ? initialCourseDayOccurrenceId(courseDayId)
          : courseDayOccurrenceIdFromRevision(courseDayId, occurrenceRevision),
      participantId,
    },
    attendanceStatus,
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: decidedAt,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: decidedAt,
    revision: 1,
    correlationId,
  });
}

describeEmulator('courseEnrollmentExceptionalWorkflows emulator', () => {
  beforeAll(() => {
    if (getApps().length === 0) {
      app = initializeApp({ projectId: PROJECT_ID });
    } else {
      app = getApps()[0]!;
    }
    firestore = getFirestore(app);
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  beforeEach(async () => {
    await seedBase();
  }, 30_000);

  it('A. fully funded payment-start gate at boundary creates no issue', async () => {
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    expect((await commands.execute(gateEnvelope('gate-funded'))).status).toBe('success');
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.size).toBe(0);
  }, 30_000);

  it('B. underfunded payment-start gate opens deterministic issue without payment mutation', async () => {
    await seedBase({ underfunded: true });
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    expect((await commands.execute(gateEnvelope('gate-underfunded'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.kind).toBe('payment_required_at_start');
    expect(issue?.lifecycle.status).toBe('open');
    const paymentAfter = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    expect(paymentAfter).toEqual(paymentBefore);
  }, 30_000);

  it('C. payment-start gate just before course.startAt is rejected', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T02:59:59.999Z');
    expect((await commands.execute(gateEnvelope('gate-early'))).status).toBe('error');
    expect((await firestore.collection('admin_issues').get()).size).toBe(0);
  }, 30_000);

  it('C. payment-start gate exactly at course.startAt opens underfunded issue', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    expect((await commands.execute(gateEnvelope('gate-exact-start'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.kind).toBe('payment_required_at_start');
    expect(issue?.lifecycle.status).toBe('open');
  }, 30_000);

  it('C. payment-start gate after course.startAt opens underfunded issue', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(gateEnvelope('gate-after-start'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.kind).toBe('payment_required_at_start');
    expect(issue?.lifecycle.status).toBe('open');
  }, 30_000);

  it('D. concurrent payment-start gate vs provider payment serializes valid final state', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(gateEnvelope('gate-race-d')),
      commands.execute(providerPaymentEnvelope(COURSE_PRICE_KZT, 'provider-race-d')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const issues = await firestore.collection('admin_issues').get();
    const payment = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    expect(issues.size).toBeLessThanOrEqual(1);
    if (issues.size === 1) {
      expect(issues.docs[0]?.data().kind).toBe('payment_required_at_start');
    } else {
      expect(payment.outstandingAmount).toBe(0);
      expect(payment.retainedAmount).toBe(COURSE_PRICE_KZT);
    }
    expect(payment.writtenOffAmount).toBe(0);
  }, 30_000);

  it('E. truthful present while underfunded without prior gate opens both issues atomically', async () => {
    await seedBase({ underfunded: true });
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(recordPresentEnvelope('present-no-gate'))).status).toBe('success');
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');
    const paymentStart = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(paymentStart?.kind).toBe('payment_required_at_start');
    expect(paymentStart?.lifecycle.status).toBe('open');
    const conflict = (await firestore.doc(`admin_issues/${paymentConflictIssueId()}`).get()).data();
    expect(conflict?.kind).toBe('attendance_payment_conflict');
    expect(conflict?.lifecycle.status).toBe('open');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
    expect(paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())).toEqual(
      paymentBefore
    );
  }, 30_000);

  it('F. present vs concurrent provider payment avoids stale payment-conflict state', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(recordPresentEnvelope('present-race-f')),
      commands.execute(providerPaymentEnvelope(COURSE_PRICE_KZT, 'provider-race-f')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');
    const payment = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const issues = await firestore.collection('admin_issues').get();
    if (payment.outstandingAmount === 0) {
      const conflict = issues.docs.find((doc) => doc.data().kind === 'attendance_payment_conflict');
      expect(conflict?.data().lifecycle?.status).not.toBe('open');
    } else {
      const conflict = issues.docs.find((doc) => doc.data().kind === 'attendance_payment_conflict');
      expect(conflict?.data().lifecycle?.status).toBe('open');
    }
  }, 30_000);

  it('G. concurrent payment-start gate dedupe keeps one logical issue', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    const results = await Promise.all([
      commands.execute(gateEnvelope('gate-dedupe-a', correlationId)),
      commands.execute(gateEnvelope('gate-dedupe-b', correlationIdB)),
    ]);
    expect(results.every((result) => result.status === 'success')).toBe(true);
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.size).toBe(1);
    expect(issues.docs[0]?.id).toBe(paymentStartIssueId());
  }, 30_000);

  it('G. replayed payment conflict does not duplicate issue', async () => {
    await seedBase({ underfunded: true });
    const gateCommands = createCommands('2026-02-01T03:00:00.000Z');
    await gateCommands.execute(gateEnvelope('gate-replay'));
    const attendanceCommands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordPresentEnvelope('present-conflict-replay');
    expect((await attendanceCommands.execute(envelope)).status).toBe('success');
    expect((await attendanceCommands.execute(envelope)).status).toBe('success');
    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
  }, 30_000);

  it('H. no_show -> completed admin terminal correction is atomic', async () => {
    await seedBase({ underfunded: true });
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      revision: 2,
      attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 0,
        absentDayCount: 1,
        projectionRevision: 1,
      },
    });
    await seedAttendance(courseDayOneId, 'absent');
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect(
      (
        await commands.execute(
          recordPresentEnvelope('terminal-h', {
            actor: 'admin',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 2,
            reasonExplanation: 'Correct absent to present',
          })
        )
      ).status
    ).toBe('success');
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
    const outcomeIssues = await firestore.collection('admin_issues').get();
    expect(
      outcomeIssues.docs.filter((doc) => doc.data().kind === 'outcome_correction_required')
    ).toHaveLength(0);
  }, 30_000);

  it('I. completed -> no_show admin terminal correction uses all-current evidence', async () => {
    await seedBase();
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'completed', completedAt: decidedAt },
      revision: 2,
      attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 1,
        absentDayCount: 0,
        projectionRevision: 1,
      },
    });
    await seedAttendance(courseDayOneId, 'present');
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect(
      (
        await commands.execute(
          recordAbsentEnvelope('terminal-i', courseDayOneId, {
            actor: 'admin',
            expectedAttendanceRevision: 1,
          })
        )
      ).status
    ).toBe('error');
    expect(
      (
        await commands.execute({
          kind: 'record_course_day_attendance',
          context: adminContext('terminal-i-admin'),
          intent: {
            courseEnrollmentId: enrollmentId,
            courseDayId: courseDayOneId,
            attendanceStatus: 'absent',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 2,
            reasonExplanation: 'Correct present to absent',
          },
        })
      ).status
    ).toBe('success');
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('absent');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('no_show');
  }, 30_000);

  it('J. terminal correction with missing evidence returns to confirmed', async () => {
    await seedBase({ dayCount: 3 });
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'completed', completedAt: decidedAt },
      revision: 2,
      attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 1,
        absentDayCount: 0,
        projectionRevision: 1,
      },
    });
    await seedAttendance(courseDayOneId, 'present');
    const commands = createCommands('2026-02-03T06:00:00.000Z');
    expect(
      (
        await commands.execute({
          kind: 'record_course_day_attendance',
          context: adminContext('terminal-j'),
          intent: {
            courseEnrollmentId: enrollmentId,
            courseDayId: courseDayOneId,
            attendanceStatus: 'absent',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 2,
            reasonExplanation: 'Remove sole present evidence; days 2-3 remain missing',
          },
        })
      ).status
    ).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('K. stale expectedAttendanceRevision is rejected with no partial changes', async () => {
    await seedBase();
    await seedAttendance(courseDayOneId, 'absent');
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const before = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(
      (
        await commands.execute(
          recordPresentEnvelope('stale-attendance', { expectedAttendanceRevision: 99 })
        )
      ).status
    ).toBe('error');
    const after = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(after?.attendanceStatus).toBe(before?.attendanceStatus);
    expect(after?.revision).toBe(before?.revision);
  }, 30_000);

  it('L. stale expectedEnrollmentRevision is rejected with no partial changes', async () => {
    await seedBase({ underfunded: true });
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      revision: 2,
    });
    await seedAttendance(courseDayOneId, 'absent');
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    const enrollmentBefore = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(
      (
        await commands.execute(
          recordPresentEnvelope('stale-enrollment', {
            actor: 'admin',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 99,
            reasonExplanation: 'Stale enrollment revision',
          })
        )
      ).status
    ).toBe('error');
    const enrollmentAfter = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollmentAfter?.lifecycle.status).toBe(enrollmentBefore?.lifecycle.status);
    expect(enrollmentAfter?.revision).toBe(enrollmentBefore?.revision);
  }, 30_000);

  it('M. concurrent competing terminal corrections serialize to one evidence-consistent outcome', async () => {
    await seedBase();
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      revision: 2,
      attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 0,
        absentDayCount: 1,
        projectionRevision: 1,
      },
    });
    await seedAttendance(courseDayOneId, 'absent');
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    const [a, b] = await Promise.allSettled([
      commands.execute(
        recordPresentEnvelope('terminal-race-a', {
          actor: 'admin',
          expectedAttendanceRevision: 1,
          expectedEnrollmentRevision: 2,
          reasonExplanation: 'Race correction A',
        })
      ),
      commands.execute(
        recordPresentEnvelope('terminal-race-b', {
          actor: 'admin',
          expectedAttendanceRevision: 1,
          expectedEnrollmentRevision: 2,
          reasonExplanation: 'Race correction B',
        })
      ),
    ]);
    expect([a.status, b.status].filter((status) => status === 'fulfilled').length).toBe(2);
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    if (attendance?.attendanceStatus === 'present') {
      expect(enrollment?.lifecycle.status).toBe('completed');
    } else {
      expect(enrollment?.lifecycle.status).toBe('no_show');
    }
  }, 30_000);

  it('N. pending_cancellation blocks payment-start gate exceptional path', async () => {
    await seedBase({
      underfunded: true,
      lifecycle: { status: 'pending_cancellation', pendingCancellationAt: decidedAt },
    });
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    expect((await commands.execute(gateEnvelope('pending-gate'))).status).toBe('error');
    expect((await firestore.collection('admin_issues').get()).size).toBe(0);
  }, 30_000);

  it('O. cancelled enrollment cannot be resurrected by exceptional path', async () => {
    await seedBase({
      lifecycle: { status: 'cancelled', cancelledAt: decidedAt, reasonCode: 'incomplete_payment' },
    });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(recordPresentEnvelope('cancelled'))).status).toBe('error');
  }, 30_000);

  it('P. withdrawn enrollment cannot be resurrected by exceptional path', async () => {
    await seedBase({ lifecycle: { status: 'withdrawn', withdrawnAt: decidedAt } });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(recordPresentEnvelope('withdrawn'))).status).toBe('error');
  }, 30_000);

  it('Q. stale CourseDay occurrence evidence does not drive exceptional correction', async () => {
    await seedBase();
    await seedAttendance(courseDayOneId, 'absent', 2);
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      revision: 2,
    });
    expect(
      (
        await commands.execute(
          recordPresentEnvelope('stale-occurrence', {
            actor: 'admin',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 2,
            reasonExplanation: 'Stale occurrence should not count',
          })
        )
      ).status
    ).toBe('error');
  }, 30_000);

  it('R. completed <-> no_show correction preserves capacity and claims', async () => {
    const seatsBefore = await readCourseAvailableSeats();
    const claimsBefore = (await listEnrollmentOwnedClaims()).length;
    await seedBase({ underfunded: true });
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'no_show', noShowAt: decidedAt },
      revision: 2,
      attendanceSummary: {
        recordedDayCount: 1,
        presentDayCount: 0,
        absentDayCount: 1,
        projectionRevision: 1,
      },
    });
    await seedAttendance(courseDayOneId, 'absent');
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect(
      (
        await commands.execute(
          recordPresentEnvelope('capacity-r', {
            actor: 'admin',
            expectedAttendanceRevision: 1,
            expectedEnrollmentRevision: 2,
            reasonExplanation: 'Terminal correction',
          })
        )
      ).status
    ).toBe('success');
    expect(await readCourseAvailableSeats()).toBe(seatsBefore);
    expect((await listEnrollmentOwnedClaims()).length).toBe(claimsBefore);
    const guards = await firestore.collection('active_course_enrollment_guards').get();
    expect(guards.size).toBe(1);
  }, 30_000);

  it('S. non-financial exceptional commands leave Payment Wallet and MonetaryEvents unchanged', async () => {
    await seedBase({ underfunded: true });
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const walletBefore = walletSnapshot(
      (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
    );
    const monetaryBefore = await firestore.collection('monetary_events').get();
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    await commands.execute(gateEnvelope('finance-gate'));
    await commands.execute(recordPresentEnvelope('finance-present'));
    expect(
      paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())
    ).toEqual(paymentBefore);
    expect(
      walletSnapshot((await firestore.doc(`users/${accountId}/wallet/state`).get()).data())
    ).toEqual(walletBefore);
    const monetaryAfter = await firestore.collection('monetary_events').get();
    expect(monetaryAfter.size).toBe(monetaryBefore.size);
    expect([...monetaryAfter.docs].map((doc) => doc.id)).toEqual(
      [...monetaryBefore.docs].map((doc) => doc.id)
    );
  }, 30_000);

  it('T. concurrent AdminIssue triggers dedupe to one logical issue', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(recordPresentEnvelope('dedupe-present-a')),
      commands.execute(recordPresentEnvelope('dedupe-present-b')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const conflictIssues = (await firestore.collection('admin_issues').get()).docs.filter(
      (doc) => doc.data().kind === 'attendance_payment_conflict'
    );
    expect(conflictIssues).toHaveLength(1);
  }, 30_000);

  it('U. funding vs gate re-evaluation race leaves payment-start issue aligned with Payment', async () => {
    await seedBase({ underfunded: true });
    const presentCommands = createCommands('2026-02-01T04:00:00.000Z');
    await presentCommands.execute(recordPresentEnvelope('resolution-race-u'));
    expect(
      (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data()?.lifecycle?.status
    ).toBe('open');
    const raceCommands = createCommands('2026-02-01T04:01:00.000Z');
    const settled = await Promise.allSettled([
      raceCommands.execute(gateEnvelope('resolution-gate-u')),
      raceCommands.execute(providerPaymentEnvelope(COURSE_PRICE_KZT, 'resolution-fund-u')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const payment = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const issues = await firestore.collection('admin_issues').get();
    const openPaymentStart = issues.docs.filter(
      (doc) =>
        doc.data().kind === 'payment_required_at_start' && doc.data().lifecycle?.status === 'open'
    );
    if (payment.outstandingAmount === 0) {
      expect(openPaymentStart).toHaveLength(0);
    } else {
      expect(openPaymentStart).toHaveLength(1);
    }
  }, 30_000);

  it('V. exact command replay does not duplicate durable writes', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const envelope = recordPresentEnvelope('replay-exact');
    expect((await commands.execute(envelope)).status).toBe('success');
    const attendanceAfterFirst = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    const enrollmentAfterFirst = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const issuesAfterFirst = await firestore.collection('admin_issues').get();
    const logsAfterFirst = await firestore.collection('activity_logs').get();
    expect((await commands.execute(envelope)).status).toBe('success');
    const attendanceAfterSecond = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    const enrollmentAfterSecond = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const issuesAfterSecond = await firestore.collection('admin_issues').get();
    const logsAfterSecond = await firestore.collection('activity_logs').get();
    expect(attendanceAfterSecond?.revision).toBe(attendanceAfterFirst?.revision);
    expect(enrollmentAfterSecond?.revision).toBe(enrollmentAfterFirst?.revision);
    expect(issuesAfterSecond.size).toBe(issuesAfterFirst.size);
    expect(logsAfterSecond.size).toBe(logsAfterFirst.size);
  }, 30_000);

  it('X. optional fields serialize without undefined in Firestore writes', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(recordPresentEnvelope('undefined-serialize'))).status).toBe('success');
    const collections = ['attendance', 'admin_issues', 'course_enrollments', 'activity_logs'];
    for (const collection of collections) {
      const snap = await firestore.collection(collection).get();
      snap.docs.forEach((doc) => assertNoUndefinedDeep(doc.data(), `${collection}/${doc.id}`));
    }
  }, 30_000);
});
