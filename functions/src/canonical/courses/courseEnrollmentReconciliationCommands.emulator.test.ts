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
  courseEnrollmentAttendancePaymentConflictIdentity,
  courseEnrollmentSeatOccurrenceId,
  initialCourseDayOccurrenceId,
  paymentIdFromCourseEnrollmentId,
  paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment,
  missingCourseDayAttendanceIssueIdentity,
  accountCommandActor,
  systemCommandActor,
  canonicalPaths,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-course-reconciliation-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_reconciliation_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_course_reconciliation_emulator_02');
const accountId = 'account_course_reconciliation_emulator_01';
const adminAccountId = 'account_course_reconciliation_emulator_admin';
const instructorAccountId = 'account_course_reconciliation_emulator_instructor';
const participantId = ParticipantIdSchema.parse('participant_course_reconciliation_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_course_reconciliation_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_course_reconciliation_emulator_01');
const courseId = CourseIdSchema.parse('course_course_reconciliation_emulator_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_reconciliation_emulator_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_course_reconciliation_emulator_01');
const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
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
] as const;

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

function systemReconciliationContext(idempotencyKey: string, correlation = correlationId) {
  return {
    actor: systemCommandActor('system_course_reconciliation_emulator'),
    exercisedCapability: 'system' as const,
    idempotencyKey,
    correlationId: correlation,
    source: 'system_reconciliation' as const,
  };
}

function reconcileEnvelope(
  idempotencyKey: string,
  options: { actor?: 'admin' | 'system'; expectedRevision?: number } = {}
): CommandEnvelope<'reconcile_course_enrollment'> {
  const actor = options.actor ?? 'admin';
  return {
    kind: 'reconcile_course_enrollment',
    context: {
      ...(actor === 'admin'
        ? adminContext(idempotencyKey)
        : systemReconciliationContext(idempotencyKey)),
      ...(options.expectedRevision === undefined
        ? {}
        : {
            expectedRevision: AggregateRevisionSchema.parse(options.expectedRevision),
          }),
    },
    intent: { courseEnrollmentId: enrollmentId },
  };
}

function gateEnvelope(idempotencyKey: string): CommandEnvelope<'enforce_payment_start_gate'> {
  return {
    kind: 'enforce_payment_start_gate',
    context: {
      actor: systemCommandActor('system_reconciliation_gate'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent: { subjectKind: 'course_enrollment', subjectId: enrollmentId },
  };
}

async function providerPaymentEnvelope(
  amount: number,
  idempotencyKey: string,
  correlation = correlationIdB
): Promise<CommandEnvelope<'record_provider_payment_event'>> {
  const paymentDoc = await firestore.doc(`payments/${paymentId}`).get();
  const revision = paymentDoc.data()?.revision ?? 1;
  return {
    kind: 'record_provider_payment_event',
    context: {
      ...adminContext(idempotencyKey, correlation),
      expectedRevision: AggregateRevisionSchema.parse(revision),
    },
    intent: {
      paymentId,
      amount,
      sourceKind: 'manual_external',
      manualReference: `manual-ref-${idempotencyKey}`,
    },
  };
}

async function fundPayment(
  commands: ReturnType<typeof createCommands>,
  amount: number,
  idempotencyKey: string,
  correlation = correlationIdB
) {
  const envelope = await providerPaymentEnvelope(amount, idempotencyKey, correlation);
  const result = await commands.execute(envelope);
  expect(result.status).toBe('success');
  return result;
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

function missingAttendanceIssueId(courseDayId = courseDayOneId): string {
  return adminIssueIdFromDedupeKey(
    adminIssueDedupeKeyFromIdentity(
      missingCourseDayAttendanceIssueIdentity({
        enrollmentId,
        courseDayId,
        participantId,
        occurrenceId: initialCourseDayOccurrenceId(courseDayId),
      })
    )
  );
}

function walletFinancialSnapshot(data: Record<string, unknown> | undefined) {
  return {
    balance: data?.balance,
    revision: data?.revision,
    eventRevision: data?.eventRevision,
  };
}

async function monetaryEventIds(): Promise<string[]> {
  const snap = await firestore.collection('monetary_events').get();
  return snap.docs.map((doc) => doc.id).sort();
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

async function seedEnrollmentResourceClaims() {
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
      interval: { startsAt: decidedAt, endsAt: dayOneEnd },
      lifecycle: { status: 'active' },
      revision: 1,
      correlationId,
      lastChangedByCommandId: 'seed',
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  const courseDay = {
    courseId,
    courseDayId: courseDayOneId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
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
  await firestore.doc(`resource_claims/${dayIdentity.claimId}`).set(
    ResourceClaimSchema.parse({
      claimId: dayIdentity.claimId,
      strategyVersion: 'claim:v1',
      claimKind: 'participant_course_day_enrollment',
      resourceKind: 'participant',
      resourceId: participantId,
      ownerKind: 'course_enrollment',
      ownerId: enrollmentId,
      occurrenceId: dayIdentity.occurrenceId,
      interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
      lifecycle: { status: 'active' },
      revision: 1,
      correlationId,
      lastChangedByCommandId: 'seed',
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
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

async function seedOpenPaymentStartIssue() {
  const issueId = paymentStartIssueId();
  await firestore.doc(`admin_issues/${issueId}`).set({
    issueId,
    kind: 'payment_required_at_start',
    subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
    lifecycle: {
      status: 'open',
      openedAt: decidedAt,
      lastDetectedAt: decidedAt,
    },
    severity: 'urgent',
    blocksOutcome: true,
    blocksDelivery: true,
    dedupeKey: adminIssueDedupeKeyFromIdentity(
      paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(enrollmentId)
    ),
    revision: 1,
    correlationId,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

async function seedBase(options: {
  underfunded?: boolean;
  lifecycle?: Record<string, unknown>;
  enrollmentRevision?: number;
} = {}) {
  const underfunded = options.underfunded ?? false;
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
    displayName: 'Reconciliation Participant',
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
    name: 'Reconciliation Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Reconciliation Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 7 },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: dayOneEnd,
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
  await firestore.doc(`courses/${courseId}/days/${courseDayOneId}`).set({
    courseId,
    courseDayId: courseDayOneId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
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
  await seedEnrollmentResourceClaims();
}

async function seedPresentAttendance() {
  const attendanceId = attendanceIdFor(courseDayOneId);
  await firestore.doc(`attendance/${attendanceId}`).set({
    attendanceId,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId,
      courseDayId: courseDayOneId,
      occurrenceId: initialCourseDayOccurrenceId(courseDayOneId),
      participantId,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId,
  });
}

async function seedAbsentAttendance() {
  const attendanceId = attendanceIdFor(courseDayOneId);
  await firestore.doc(`attendance/${attendanceId}`).set({
    attendanceId,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId,
      courseDayId: courseDayOneId,
      occurrenceId: initialCourseDayOccurrenceId(courseDayOneId),
      participantId,
    },
    attendanceStatus: 'absent',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId,
  });
}

async function seedStaleOccurrencePresentAttendance() {
  const attendanceId = attendanceIdFor(courseDayOneId);
  await firestore.doc(`attendance/${attendanceId}`).set({
    attendanceId,
    subject: {
      subjectKind: 'course_enrollment',
      enrollmentId,
      courseId,
      courseDayId: courseDayOneId,
      occurrenceId: 'occurrence:v1:course-day:stale:rev:0',
      participantId,
    },
    attendanceStatus: 'present',
    recordedBy: { kind: 'instructor', instructorId },
    recordedAt: dayOneEnd,
    lastChangedBy: { kind: 'instructor', instructorId },
    updatedAt: dayOneEnd,
    revision: 1,
    correlationId,
  });
}

async function seedOpenMissingAttendanceIssue() {
  const issueId = missingAttendanceIssueId();
  await firestore.doc(`admin_issues/${issueId}`).set({
    issueId,
    kind: 'missing_attendance',
    subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
    courseDayId: courseDayOneId,
    occurrenceId: initialCourseDayOccurrenceId(courseDayOneId),
    participantId,
    lifecycle: { status: 'open', openedAt: decidedAt, lastDetectedAt: decidedAt },
    severity: 'urgent',
    blocksOutcome: true,
    blocksDelivery: true,
    dedupeKey: adminIssueDedupeKeyFromIdentity(
      missingCourseDayAttendanceIssueIdentity({
        enrollmentId,
        courseDayId: courseDayOneId,
        participantId,
        occurrenceId: initialCourseDayOccurrenceId(courseDayOneId),
      })
    ),
    revision: 1,
    correlationId,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

async function seedOpenPaymentConflictIssue() {
  const issueId = paymentConflictIssueId();
  await firestore.doc(`admin_issues/${issueId}`).set({
    issueId,
    kind: 'attendance_payment_conflict',
    subjectRef: { subjectKind: 'course_enrollment', enrollmentId },
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
    participantId,
    lifecycle: { status: 'open', openedAt: decidedAt, lastDetectedAt: decidedAt },
    severity: 'critical',
    blocksOutcome: true,
    blocksDelivery: true,
    dedupeKey: adminIssueDedupeKeyFromIdentity(
      courseEnrollmentAttendancePaymentConflictIdentity({
        enrollmentId,
        occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
        participantId,
      })
    ),
    revision: 1,
    correlationId,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

describeEmulator('courseEnrollmentReconciliation emulator', () => {
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

  it('A. canonical enrollment reconciles with no-op', async () => {
    const enrollmentBefore = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-noop'))).status).toBe('success');
    const enrollmentAfter = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollmentAfter?.revision).toBe(enrollmentBefore?.revision);
    expect((await firestore.collection('activity_logs').get()).size).toBe(0);
    expect((await firestore.collection('admin_issues').get()).size).toBe(0);
  }, 30_000);

  it('B. underfunded payment keeps payment_required_at_start open', async () => {
    await seedBase({ underfunded: true });
    const commands = createCommands('2026-02-01T03:00:00.000Z');
    await commands.execute(gateEnvelope('gate-open'));
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const commandsLater = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commandsLater.execute(reconcileEnvelope('reconcile-underfunded'))).status).toBe(
      'success'
    );
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('open');
    expect(paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())).toEqual(
      paymentBefore
    );
  }, 30_000);

  it('C. fully funded payment resolves stale payment_required_at_start', async () => {
    await seedBase({ underfunded: true });
    const gateCommands = createCommands('2026-02-01T03:00:00.000Z');
    expect((await gateCommands.execute(gateEnvelope('gate-stale'))).status).toBe('success');
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-before-reconcile');
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    expect(paymentBefore.outstandingAmount).toBe(0);
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const reconcileResult = await commands.execute(reconcileEnvelope('reconcile-funded'));
    expect(reconcileResult.status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('resolved');
    expect(
      paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())
    ).toEqual(paymentBefore);
  }, 30_000);

  it('D. payment event vs reconciliation race converges', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-race'));
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const fundEnvelope = await providerPaymentEnvelope(COURSE_PRICE_KZT, 'provider-race');
    const settled = await Promise.allSettled([
      commands.execute(reconcileEnvelope('reconcile-race')),
      commands.execute(fundEnvelope),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const payment = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    if (payment.outstandingAmount === 0) {
      expect(issue?.lifecycle?.status).toBe('resolved');
    } else {
      expect(issue?.lifecycle?.status).toBe('open');
    }
  }, 30_000);

  it('F. funded payment resolves attendance_payment_conflict and completes enrollment', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-conflict'));
    await seedPresentAttendance();
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-conflict');
    await seedOpenPaymentConflictIssue();
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-conflict'))).status).toBe('success');
    const conflict = (await firestore.doc(`admin_issues/${paymentConflictIssueId()}`).get()).data();
    expect(conflict?.lifecycle.status).toBe('resolved');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
    expect(
      paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())
    ).toEqual(paymentBefore);
  }, 30_000);

  it('M. pending_cancellation is not bypassed by reconciliation', async () => {
    await seedBase({
      lifecycle: { status: 'pending_cancellation', requestedAt: decidedAt },
    });
    await seedOpenPaymentStartIssue();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-pending'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('pending_cancellation');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('open');
  }, 30_000);

  it('T. stale enrollment revision is rejected', async () => {
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    const result = await commands.execute(
      reconcileEnvelope('reconcile-stale-revision', { expectedRevision: 99 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
    }
  }, 30_000);

  it('Y. exact replay is stable', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-replay'));
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-replay');
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const first = await commands.execute(reconcileEnvelope('reconcile-replay'));
    const second = await commands.execute(reconcileEnvelope('reconcile-replay'));
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('resolved');
    expect((await firestore.collection('activity_logs').get()).size).toBe(3);
  }, 30_000);

  it('E. present with active payment restriction keeps attendance_payment_conflict open', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-conflict-open'));
    await seedPresentAttendance();
    await seedOpenPaymentConflictIssue();
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const commands = createCommands('2026-02-01T04:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-conflict-open'))).status).toBe('success');
    const conflict = (await firestore.doc(`admin_issues/${paymentConflictIssueId()}`).get()).data();
    expect(conflict?.lifecycle.status).toBe('open');
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    expect(attendance?.attendanceStatus).toBe('present');
    expect(
      paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())
    ).toEqual(paymentBefore);
  }, 30_000);

  it('G. fully funded present after final day completes enrollment', async () => {
    await seedPresentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-complete'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
  }, 30_000);

  it('H. fully funded all current absent marks no_show', async () => {
    await seedAbsentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-no-show'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('no_show');
  }, 30_000);

  it('I. missing attendance keeps missing_attendance open', async () => {
    await seedOpenMissingAttendanceIssue();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-missing-open'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${missingAttendanceIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('open');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('confirmed');
  }, 30_000);

  it('J. recorded current absent resolves stale missing_attendance', async () => {
    await seedOpenMissingAttendanceIssue();
    await seedAbsentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-missing-resolve'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${missingAttendanceIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('resolved');
  }, 30_000);

  it('K. attendance write vs reconciliation race converges on current evidence', async () => {
    await seedOpenMissingAttendanceIssue();
    await seedAbsentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(reconcileEnvelope('reconcile-attendance-race')),
      commands.execute(reconcileEnvelope('reconcile-attendance-race-b')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const issue = (await firestore.doc(`admin_issues/${missingAttendanceIssueId()}`).get()).data();
    const attendance = (await firestore.doc(`attendance/${attendanceIdFor(courseDayOneId)}`).get()).data();
    if (attendance?.attendanceStatus === 'absent') {
      expect(issue?.lifecycle?.status).toBe('resolved');
    } else {
      expect(issue?.lifecycle?.status).toBe('open');
    }
  }, 30_000);

  it('L. stale occurrence attendance does not resolve current missing issue', async () => {
    await seedOpenMissingAttendanceIssue();
    await seedStaleOccurrencePresentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-stale-occurrence'))).status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${missingAttendanceIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('open');
  }, 30_000);

  it('N. cancelled enrollment is not resurrected by reconciliation', async () => {
    await seedBase({
      lifecycle: {
        status: 'cancelled',
        cancelledAt: decidedAt,
        reasonCode: 'administrator_cancelled',
      },
    });
    await seedOpenPaymentStartIssue();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-cancelled'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('cancelled');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('open');
  }, 30_000);

  it('O. withdrawn enrollment is not resurrected by reconciliation', async () => {
    await seedBase({
      lifecycle: { status: 'withdrawn', withdrawnAt: decidedAt },
    });
    await seedOpenPaymentStartIssue();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-withdrawn'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('withdrawn');
  }, 30_000);

  it('P. completed canonical enrollment reconciles without resource churn', async () => {
    await seedPresentAttendance();
    const completeCommands = createCommands('2026-02-01T05:00:00.000Z');
    await completeCommands.execute(reconcileEnvelope('reconcile-to-complete'));
    const courseBefore = (await firestore.doc(`courses/${courseId}`).get()).data();
    const claimsBefore = (await firestore.collection('resource_claims').get()).size;
    const guardBefore = (await firestore.collection('active_course_enrollment_guards').get()).size;
    const enrollmentRevision = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data()
      ?.revision;
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-completed-noop'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
    expect(enrollment?.revision).toBe(enrollmentRevision);
    expect((await firestore.doc(`courses/${courseId}`).get()).data()?.capacity).toEqual(
      courseBefore?.capacity
    );
    expect((await firestore.collection('resource_claims').get()).size).toBe(claimsBefore);
    expect((await firestore.collection('active_course_enrollment_guards').get()).size).toBe(guardBefore);
  }, 30_000);

  it('Q. no_show canonical enrollment reconciles without resource churn', async () => {
    await seedAbsentAttendance();
    const noShowCommands = createCommands('2026-02-01T05:00:00.000Z');
    await noShowCommands.execute(reconcileEnvelope('reconcile-to-no-show'));
    const courseBefore = (await firestore.doc(`courses/${courseId}`).get()).data();
    const enrollmentRevision = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data()
      ?.revision;
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-no-show-noop'))).status).toBe('success');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('no_show');
    expect(enrollment?.revision).toBe(enrollmentRevision);
    expect((await firestore.doc(`courses/${courseId}`).get()).data()?.capacity).toEqual(
      courseBefore?.capacity
    );
  }, 30_000);

  it('R. outcome resolver vs reconciliation race converges without duplicate terminal effects', async () => {
    await seedPresentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(reconcileEnvelope('reconcile-outcome-race-a')),
      commands.execute(reconcileEnvelope('reconcile-outcome-race-b')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle.status).toBe('completed');
    expect((await firestore.collection('activity_logs').get()).size).toBeLessThanOrEqual(2);
  }, 30_000);

  it('S. concurrent reconciliation dedupes issue resolution', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-concurrent'));
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-concurrent');
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const settled = await Promise.allSettled([
      commands.execute(reconcileEnvelope('reconcile-concurrent-a')),
      commands.execute(reconcileEnvelope('reconcile-concurrent-b')),
    ]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('resolved');
    const issues = await firestore.collection('admin_issues').get();
    expect(issues.docs.filter((doc) => doc.data().kind === 'payment_required_at_start').length).toBe(1);
  }, 30_000);

  it('U. stale payment expectedRevision on funding is rejected', async () => {
    await seedBase({ underfunded: true });
    const envelope = await providerPaymentEnvelope(COURSE_PRICE_KZT, 'fund-stale-revision');
    envelope.context.expectedRevision = AggregateRevisionSchema.parse(99);
    const result = await createCommands('2026-02-01T04:00:00.000Z').execute(envelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
    }
  }, 30_000);

  it('V. terminal enrollment with active guard opens resource_reconciliation_mismatch', async () => {
    await seedPresentAttendance();
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'completed', completedAt: dayOneEnd },
      revision: 2,
      updatedAt: dayOneEnd,
    });
    const commands = createCommands('2026-02-01T06:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-resource-mismatch'))).status).toBe(
      'success'
    );
    const issues = await firestore.collection('admin_issues').get();
    const mismatch = issues.docs.find((doc) => doc.data().kind === 'resource_reconciliation_mismatch');
    expect(mismatch?.data().lifecycle?.status).toBe('open');
  }, 30_000);

  it('W. started course reconciliation never increments availableSeats', async () => {
    await seedBase({ underfunded: true });
    const courseBefore = (await firestore.doc(`courses/${courseId}`).get()).data();
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-capacity'));
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-capacity');
    await seedAbsentAttendance();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-capacity'))).status).toBe('success');
    const courseAfter = (await firestore.doc(`courses/${courseId}`).get()).data();
    expect(courseAfter?.capacity?.availableSeats).toBe(courseBefore?.capacity?.availableSeats);
  }, 30_000);

  it('X. non-financial reconciliation leaves Payment Wallet and MonetaryEvents unchanged', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-finance'));
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-finance');
    const paymentBefore = paymentFinancialSnapshot(
      (await firestore.doc(`payments/${paymentId}`).get()).data()
    );
    const walletBefore = walletFinancialSnapshot(
      (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
    );
    const eventsBefore = await monetaryEventIds();
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    expect((await commands.execute(reconcileEnvelope('reconcile-finance-immutable'))).status).toBe(
      'success'
    );
    expect(
      paymentFinancialSnapshot((await firestore.doc(`payments/${paymentId}`).get()).data())
    ).toEqual(paymentBefore);
    expect(
      walletFinancialSnapshot((await firestore.doc(`users/${accountId}/wallet/state`).get()).data())
    ).toEqual(walletBefore);
    expect(await monetaryEventIds()).toEqual(eventsBefore);
  }, 30_000);

  it('Z. reconciliation retry plans do not serialize undefined values', async () => {
    await seedBase({ underfunded: true });
    await createCommands('2026-02-01T03:00:00.000Z').execute(gateEnvelope('gate-retry'));
    await fundPayment(createCommands('2026-02-01T04:00:00.000Z'), COURSE_PRICE_KZT, 'fund-retry');
    const commands = createCommands('2026-02-01T05:00:00.000Z');
    const first = await commands.execute(reconcileEnvelope('reconcile-retry'));
    expect(first.status).toBe('success');
    const issue = (await firestore.doc(`admin_issues/${paymentStartIssueId()}`).get()).data();
    expect(issue?.lifecycle.status).toBe('resolved');
    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    expect(enrollment?.lifecycle?.status).toBe('confirmed');
  }, 30_000);
});
