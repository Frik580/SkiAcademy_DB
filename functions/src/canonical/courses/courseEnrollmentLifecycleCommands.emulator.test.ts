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
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  SystemActorIdSchema,
  WalletSchema,
  COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS,
  COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS,
  courseEnrollmentIdFromCommandParticipant,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  systemCommandActor,
  timestampFromDate,
  accountCommandActor,
  type CommandEnvelope,
  type CourseEnrollmentId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-course-enrollment-lifecycle-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_lifecycle_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_course_lifecycle_emulator_02');
const accountId = AccountIdSchema.parse('account_course_lifecycle_owner_01');
const adminAccountId = AccountIdSchema.parse('account_course_lifecycle_admin_01');
const participantId = ParticipantIdSchema.parse('participant_course_lifecycle_01');
const participantIdB = ParticipantIdSchema.parse('participant_course_lifecycle_02');
const managementId = ParticipantManagementIdSchema.parse('management_course_lifecycle_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_course_lifecycle_02');
const guestParticipantId = ParticipantIdSchema.parse('participant_guest_course_lifecycle_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_subject_course_lifecycle_01');
const instructorId = InstructorIdSchema.parse('instructor_course_lifecycle_01');
const courseId = CourseIdSchema.parse('course_course_lifecycle_emulator_01');
const courseIdB = CourseIdSchema.parse('course_course_lifecycle_emulator_02');
const courseIdC = CourseIdSchema.parse('course_course_lifecycle_emulator_03');
const courseDayId = CourseDayIdSchema.parse('course_day_lifecycle_emulator_01');
const courseDayBId = CourseDayIdSchema.parse('course_day_lifecycle_emulator_b01');
const courseDayB2Id = CourseDayIdSchema.parse('course_day_lifecycle_emulator_b02');
const courseDayCId = CourseDayIdSchema.parse('course_day_lifecycle_emulator_c01');
const bookingConflictId = BookingIdSchema.parse('booking_course_lifecycle_conflict_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));

const COURSE_PRICE_KZT = 50_000;
const COURSE_PRICE_UP_KZT = 60_000;
const COURSE_PRICE_DOWN_KZT = 40_000;
const ODD_COURSE_PRICE_KZT = 10_001;
const WALLET_START_KZT = COURSE_PRICE_KZT * 2;
const BOOKING_PRICE_KZT = 12_000;

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
  'bookings',
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

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret: 'guest-course-lifecycle-emulator-secret',
  });
}

function accountContext(
  idempotencyKey: string,
  actorAccountId = accountId,
  capability: 'account_owner' | 'parent_guardian' | 'administrator' = 'account_owner'
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId,
    source:
      capability === 'administrator' ? ('admin_callable' as const) : ('client_callable' as const),
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
}

function adminContext(
  idempotencyKey: string,
  expectedRevision?: number,
  actorAccountId = adminAccountId
) {
  return {
    ...accountContext(idempotencyKey, actorAccountId, 'administrator'),
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

function seedAccountRecord(targetAccountId: typeof accountId) {
  return AccountSchema.parse({
    accountId: targetAccountId,
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
}

function seedWallet(balance: number, targetAccountId = accountId) {
  return WalletSchema.parse({
    accountId: targetAccountId,
    currency: 'KZT',
    balance,
    revision: 1,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function seedParticipantRecord(targetParticipantId = participantId, targetManagementId = managementId) {
  return {
    participantId: targetParticipantId,
    displayName: 'Lifecycle Participant',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: targetManagementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  };
}

function seedGuestParticipantRecord() {
  return {
    participantId: guestParticipantId,
    displayName: 'Guest Lifecycle Participant',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  };
}

function seedManagementRecord(targetManagementId = managementId, targetParticipantId = participantId) {
  return {
    participantManagementId: targetManagementId,
    participantId: targetParticipantId,
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
  };
}

async function seedCourseWithSchedule(input: {
  targetCourseId?: typeof courseId;
  price?: number;
  availableSeats: number;
  courseDayId?: typeof courseDayId;
  courseDayCount?: 1 | 2;
  courseDayIds?: readonly [typeof courseDayId, typeof courseDayId?];
}) {
  const targetCourseId = input.targetCourseId ?? courseId;
  const price = input.price ?? COURSE_PRICE_KZT;
  const courseDayCount = input.courseDayCount ?? 1;
  const dayIds = input.courseDayIds ?? [input.courseDayId ?? courseDayId, courseDayB2Id];
  const finalEndsAt = courseDayCount === 1 ? dayOneEnd : dayTwoEnd;

  await firestore.doc(`courses/${targetCourseId}`).set({
    courseId: targetCourseId,
    title: `Course Lifecycle Emulator ${targetCourseId}`,
    price,
    capacity: { totalSeats: input.availableSeats, availableSeats: input.availableSeats },
    instructorRosterIds: [instructorId],
    startAt: dayOneStart,
    scheduleProjection: {
      courseDayCount,
      finalCourseDayEndsAt: finalEndsAt,
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

  const dayOrders = (courseDayCount === 1 ? [1] : [1, 2]) as readonly (1 | 2)[];
  for (const dayOrder of dayOrders) {
    const interval =
      dayOrder === 1
        ? { startsAt: dayOneStart, endsAt: dayOneEnd }
        : { startsAt: dayTwoStart, endsAt: dayTwoEnd };
    await firestore.doc(`courses/${targetCourseId}/days/${dayIds[dayOrder - 1]!}`).set({
      courseId: targetCourseId,
      courseDayId: dayIds[dayOrder - 1]!,
      dayOrder,
      interval,
      timeZone: 'Asia/Almaty',
      actualInstructorIds: [instructorId],
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
}

async function seedBase(
  walletBalance: number,
  availableSeats = 8,
  options: {
    includeAdminAccount?: boolean;
    includeCourseB?: boolean;
    includeCourseC?: boolean;
    includeParticipantB?: boolean;
    includeGuestParticipant?: boolean;
    coursePrice?: number;
    courseBPrice?: number;
    courseCPrice?: number;
    courseBDayCount?: 1 | 2;
    courseBSeats?: number;
  } = {}
) {
  await firestore.doc(`users/${accountId}`).set(seedAccountRecord(accountId));
  if (options.includeAdminAccount) {
    await firestore.doc(`users/${adminAccountId}`).set(seedAccountRecord(adminAccountId));
  }
  await firestore.doc(`users/${accountId}/wallet/state`).set(seedWallet(walletBalance));
  await firestore.doc(`participants/${participantId}`).set(seedParticipantRecord());
  await firestore.doc(`participant_management/${managementId}`).set(seedManagementRecord());
  if (options.includeParticipantB) {
    await firestore.doc(`participants/${participantIdB}`).set(
      seedParticipantRecord(participantIdB, managementIdB)
    );
    await firestore.doc(`participant_management/${managementIdB}`).set(
      seedManagementRecord(managementIdB, participantIdB)
    );
  }
  if (options.includeGuestParticipant) {
    await firestore.doc(`participants/${guestParticipantId}`).set(seedGuestParticipantRecord());
  }
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: `Instructor ${instructorId}`,
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await seedCourseWithSchedule({
    availableSeats,
    price: options.coursePrice,
  });
  if (options.includeCourseB) {
    await seedCourseWithSchedule({
      targetCourseId: courseIdB,
      availableSeats: options.courseBSeats ?? availableSeats,
      price: options.courseBPrice ?? options.coursePrice,
      courseDayCount: options.courseBDayCount ?? 1,
      courseDayIds: [courseDayBId, courseDayB2Id],
    });
  }
  if (options.includeCourseC) {
    await seedCourseWithSchedule({
      targetCourseId: courseIdC,
      availableSeats,
      price: options.courseCPrice ?? options.coursePrice,
      courseDayId: courseDayCId,
      courseDayCount: 1,
      courseDayIds: [courseDayCId],
    });
  }
}

function enrollmentEnvelope(input: {
  idempotencyKey: string;
  targetCourseId?: typeof courseId;
  targetParticipantId?: typeof participantId;
  correlation?: typeof correlationId;
}): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      ...accountContext(input.idempotencyKey),
      ...(input.correlation ? { correlationId: input.correlation } : {}),
    },
    intent: {
      courseId: input.targetCourseId ?? courseId,
      participantIds: [input.targetParticipantId ?? participantId],
    },
  };
}

function enrollmentEnvelopeB(input: {
  idempotencyKey: string;
  targetCourseId?: typeof courseId;
}): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      ...accountContext(input.idempotencyKey),
      correlationId: correlationIdB,
    },
    intent: {
      courseId: input.targetCourseId ?? courseId,
      participantIds: [participantIdB],
    },
  };
}

function guestEnrollmentEnvelope(idempotencyKey: string): CommandEnvelope<'create_course_enrollments'> {
  const sharedContext = {
    exercisedCapability: 'guest' as const,
    idempotencyKey,
    correlationId,
    source: 'guest_callable' as const,
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
  };
  const draft: CommandEnvelope<'create_course_enrollments'> = {
    kind: 'create_course_enrollments',
    context: {
      ...sharedContext,
      actor: guestCommandActor(guestSubjectId),
    },
    intent: {
      courseId,
      participantIds: [guestParticipantId],
    },
  };
  const identity = resolveCommandIdempotencyIdentity(draft);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId: guestParticipantId,
  });

  return {
    kind: 'create_course_enrollments',
    context: {
      ...sharedContext,
      actor: guestCommandActor(guestSubjectIdFromCourseEnrollmentId(enrollmentId)),
    },
    intent: {
      courseId,
      participantIds: [guestParticipantId],
      enrollmentIds: [enrollmentId],
    },
  };
}

function expireGuestEnrollmentEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  idempotencyKey: string;
  expectedRevision: number;
}): CommandEnvelope<'expire_guest_reservation'> {
  return {
    kind: 'expire_guest_reservation',
    context: {
      actor: systemCommandActor(SystemActorIdSchema.parse('system_course_lifecycle_guest_expiry')),
      exercisedCapability: 'system',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'scheduler',
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: { courseEnrollmentId: input.enrollmentId },
  };
}

function cancelEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  idempotencyKey: string;
  expectedRevision: number;
}): CommandEnvelope<'request_course_enrollment_cancellation'> {
  return {
    kind: 'request_course_enrollment_cancellation',
    context: {
      ...accountContext(input.idempotencyKey),
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: { courseEnrollmentId: input.enrollmentId },
  };
}

function withdrawEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  idempotencyKey: string;
  expectedRevision: number;
}): CommandEnvelope<'withdraw_course_enrollment'> {
  return {
    kind: 'withdraw_course_enrollment',
    context: {
      ...accountContext(input.idempotencyKey),
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: { courseEnrollmentId: input.enrollmentId },
  };
}

function resolveEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  decision: 'approve' | 'reject' | 'direct_cancel';
  refundAmount?: number;
  idempotencyKey: string;
  expectedRevision: number;
  reasonExplanation?: string;
}): CommandEnvelope<'resolve_course_enrollment_cancellation'> {
  return {
    kind: 'resolve_course_enrollment_cancellation',
    context: adminContext(input.idempotencyKey, input.expectedRevision),
    intent: {
      courseEnrollmentId: input.enrollmentId,
      decision: input.decision,
      ...(input.refundAmount === undefined ? {} : { refundAmount: input.refundAmount }),
      reasonExplanation: input.reasonExplanation ?? 'Lifecycle emulator admin action',
    },
  };
}

function transferEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  targetCourseId: typeof courseId;
  idempotencyKey: string;
  expectedRevision: number;
  reasonExplanation?: string;
}): CommandEnvelope<'transfer_course_enrollment'> {
  return {
    kind: 'transfer_course_enrollment',
    context: adminContext(input.idempotencyKey, input.expectedRevision),
    intent: {
      courseEnrollmentId: input.enrollmentId,
      targetCourseId: input.targetCourseId,
      reasonExplanation: input.reasonExplanation ?? 'Lifecycle emulator transfer',
    },
  };
}

function bookingEnvelope(input: {
  targetBookingId: typeof bookingConflictId;
  idempotencyKey: string;
  localDate?: string;
  localTime?: string;
}): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey,
      correlationId: CorrelationIdSchema.parse(`correlation_booking_${input.idempotencyKey}`),
      source: 'client_callable',
      calendarInput: {
        localDate: input.localDate ?? '2026-02-01',
        localTime: input.localTime ?? '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: input.targetBookingId,
      instructorId,
      participantIds: [participantId],
    },
  };
}

interface FundedEnrollment {
  readonly enrollmentId: CourseEnrollmentId;
  readonly paymentId: string;
  readonly revision: number;
}

async function createFundedEnrollment(
  commands: ReturnType<typeof createCommands>,
  input: {
    idempotencyKey?: string;
    targetCourseId?: typeof courseId;
  } = {}
): Promise<FundedEnrollment> {
  const idempotencyKey = input.idempotencyKey ?? 'lifecycle-funded-enrollment';
  const envelope = enrollmentEnvelope({
    idempotencyKey,
    targetCourseId: input.targetCourseId,
  });
  const result = await commands.execute(envelope);
  expect(result.status).toBe('success');

  const identity = resolveCommandIdempotencyIdentity(envelope);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId,
  });
  const enrollmentDoc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  return {
    enrollmentId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    revision: AggregateRevisionSchema.parse(enrollmentDoc.data()?.revision ?? 1),
  };
}

async function readEnrollment(enrollmentId: CourseEnrollmentId) {
  const doc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  return doc.data();
}

async function durableCounts(targetCourseId = courseId) {
  const [
    enrollments,
    courses,
    payments,
    monetaryEvents,
    activityLogs,
    idempotency,
    claims,
    enrollmentGuards,
    wallet,
    adminIssues,
  ] = await Promise.all([
    firestore.collection('course_enrollments').get(),
    firestore.collection('courses').get(),
    firestore.collection('payments').get(),
    firestore.collection('monetary_events').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('resource_claims').get(),
    firestore.collection('active_course_enrollment_guards').get(),
    firestore.doc(`users/${accountId}/wallet/state`).get(),
    firestore.collection('admin_issues').get(),
  ]);

  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );
  const course = courses.docs.find((doc) => doc.id === targetCourseId)?.data();
  const refundEvents = monetaryEvents.docs.filter(
    (doc) => doc.data().eventKind === 'refund_to_wallet'
  );

  return {
    enrollments: enrollments.size,
    enrollmentIds: enrollments.docs.map((doc) => doc.id),
    availableSeats: course?.capacity?.availableSeats as number | undefined,
    payments: payments.size,
    paymentIds: payments.docs.map((doc) => doc.id),
    monetaryEvents: monetaryEvents.size,
    refundEvents: refundEvents.length,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    releasedClaims: claims.docs.filter((doc) => doc.data().lifecycle?.status === 'released').length,
    enrollmentGuards: enrollmentGuards.size,
    walletBalance: wallet.data()?.balance as number | undefined,
    adminIssues: adminIssues.size,
    openAdminIssues: adminIssues.docs.filter((doc) => doc.data().lifecycle?.status === 'open')
      .length,
    instructorClaims: claims.docs.filter((doc) => doc.data()?.claimKind === 'instructor_course_day')
      .length,
  };
}

async function listEnrollmentOwnedClaims(enrollmentId: CourseEnrollmentId) {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs
    .filter(
      (doc) =>
        doc.data()?.ownerKind === 'course_enrollment' && doc.data()?.ownerId === enrollmentId
    )
    .map((doc) => doc.data());
}

async function readActiveEnrollmentGuard(targetCourseId = courseId, targetParticipantId = participantId) {
  const guards = await firestore.collection('active_course_enrollment_guards').get();
  return guards.docs.find(
    (doc) =>
      doc.data()?.participantId === targetParticipantId && doc.data()?.courseId === targetCourseId
  )?.data();
}

async function createGuestEnrollment(
  commands: ReturnType<typeof createCommands>,
  idempotencyKey: string
): Promise<FundedEnrollment> {
  const envelope = guestEnrollmentEnvelope(idempotencyKey);
  const result = await commands.execute(envelope);
  expect(result.status).toBe('success');

  const enrollmentId = envelope.intent.enrollmentIds![0]!;
  const enrollmentDoc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  return {
    enrollmentId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    revision: AggregateRevisionSchema.parse(enrollmentDoc.data()?.revision ?? 1),
  };
}

async function captureEnrollmentRollbackSnapshot(
  funded: FundedEnrollment,
  sourceCourseId = courseId,
  targetCourseId = courseIdB
) {
  const enrollment = await readEnrollment(funded.enrollmentId);
  const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
  const wallet = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data();
  const sourceCourse = (await firestore.doc(`courses/${sourceCourseId}`).get()).data();
  const targetCourse = (await firestore.doc(`courses/${targetCourseId}`).get()).data();
  const claims = await listEnrollmentOwnedClaims(funded.enrollmentId);
  const guard = await readActiveEnrollmentGuard(sourceCourseId);
  const monetaryEvents = await firestore.collection('monetary_events').get();
  const activityLogs = await firestore.collection('activity_logs').get();
  const idempotency = await firestore.collection('command_idempotency').get();
  const outbox = await firestore.collection('domain_outbox').get();

  return {
    enrollment,
    payment,
    walletBalance: wallet?.balance as number | undefined,
    sourceAvailableSeats: sourceCourse?.capacity?.availableSeats as number | undefined,
    targetAvailableSeats: targetCourse?.capacity?.availableSeats as number | undefined,
    claims,
    guard,
    monetaryEventCount: monetaryEvents.size,
    activityLogCount: activityLogs.size,
    successfulIdempotency: idempotency.docs.filter(
      (doc) => doc.data().completionState === 'completed'
    ).length,
    outboxCount: outbox.size,
  };
}

const atLeast7dBeforeStart = new Date(
  dayOneStart.seconds * 1000 +
    dayOneStart.nanoseconds / 1_000_000 -
    COURSE_CLIENT_CANCELLATION_WINDOW_7D_MS
).toISOString();
const between2dAnd7dBeforeStart = new Date(
  dayOneStart.seconds * 1000 +
    dayOneStart.nanoseconds / 1_000_000 -
    COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS -
    24 * 60 * 60 * 1_000
).toISOString();
const within2dBeforeStart = new Date(
  dayOneStart.seconds * 1000 +
    dayOneStart.nanoseconds / 1_000_000 -
    COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS +
    60 * 60 * 1_000
).toISOString();
const postStart = new Date(
  dayOneStart.seconds * 1000 + dayOneStart.nanoseconds / 1_000_000
).toISOString();

describe.sequential.runIf(runsOnFirestoreEmulator)(
  'course enrollment lifecycle commands emulator',
  () => {
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
      await seedBase(WALLET_START_KZT, 8, { includeAdminAccount: true });
    });

    it(
      'A. >=7d client cancellation refunds fully, releases seat, and credits wallet',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-a-enroll',
        });

        const commands = createCommands(atLeast7dBeforeStart);
        const cancelResult = await commands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-a-cancel',
            expectedRevision: funded.revision,
          })
        );
        expect(cancelResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('cancelled');
        expect(payment?.refundedAmount).toBe(COURSE_PRICE_KZT);
        expect(state.walletBalance).toBe(WALLET_START_KZT);
        expect(state.availableSeats).toBe(8);
        expect(state.refundEvents).toBe(1);
        expect(state.releasedClaims).toBeGreaterThan(0);
      },
      30_000
    );

    it(
      'B. >=2d <7d 50% cancellation uses floor rounding on odd retained amount',
      async () => {
        await clearCollections(firestore);
        await seedBase(ODD_COURSE_PRICE_KZT * 2, 8, {
          includeAdminAccount: true,
          coursePrice: ODD_COURSE_PRICE_KZT,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-b-enroll',
        });

        const commands = createCommands(between2dAnd7dBeforeStart);
        const cancelResult = await commands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-b-cancel',
            expectedRevision: funded.revision,
          })
        );
        expect(cancelResult.status).toBe('success');

        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const state = await durableCounts();
        const expectedRefund = 5_001;

        expect(payment?.refundedAmount).toBe(expectedRefund);
        expect(payment?.retainedAmount).toBe(ODD_COURSE_PRICE_KZT - expectedRefund);
        expect(state.walletBalance).toBe(ODD_COURSE_PRICE_KZT * 2 - ODD_COURSE_PRICE_KZT + expectedRefund);
        expect(state.availableSeats).toBe(8);
        expect(state.refundEvents).toBe(1);
      },
      30_000
    );

    it(
      'C. <2d cancellation enters pending_cancellation without refund or resource release',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-c-enroll',
        });
        const before = await durableCounts();

        const commands = createCommands(within2dBeforeStart);
        const cancelResult = await commands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-c-cancel',
            expectedRevision: funded.revision,
          })
        );
        expect(cancelResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const after = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('pending_cancellation');
        expect(payment?.refundedAmount ?? 0).toBe(0);
        expect(after.refundEvents).toBe(0);
        expect(after.claims).toBe(before.claims);
        expect(after.availableSeats).toBe(7);
        expect(after.openAdminIssues).toBe(1);

        const ownedClaims = await listEnrollmentOwnedClaims(funded.enrollmentId);
        expect(ownedClaims.every((claim) => claim?.lifecycle?.status === 'active')).toBe(true);
        expect(
          ownedClaims.some((claim) => claim?.claimKind === 'course_seat_pre_start')
        ).toBe(true);
        expect(
          ownedClaims.some((claim) => claim?.claimKind === 'participant_course_day_enrollment')
        ).toBe(true);
        expect(await readActiveEnrollmentGuard()).toBeDefined();
      },
      30_000
    );

    it(
      'D. withdrawing pending cancellation restores confirmed without resource churn',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-d-enroll',
        });

        const pendingCommands = createCommands(within2dBeforeStart);
        const pendingResult = await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-d-pending',
            expectedRevision: funded.revision,
          })
        );
        expect(pendingResult.status).toBe('success');

        const pendingEnrollment = await readEnrollment(funded.enrollmentId);
        const claimsBeforeWithdraw = (await durableCounts()).claims;

        const withdrawCommands = createCommands(within2dBeforeStart);
        const withdrawResult = await withdrawCommands.execute(
          withdrawEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-d-withdraw',
            expectedRevision: AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2),
          })
        );
        expect(withdrawResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const after = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('confirmed');
        expect(after.claims).toBe(claimsBeforeWithdraw);
        expect(after.availableSeats).toBe(7);
        expect(after.refundEvents).toBe(0);
      },
      30_000
    );

    it(
      'E. admin approves pending cancellation before start with partial refund',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-e-enroll',
        });

        const pendingCommands = createCommands(within2dBeforeStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-e-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);

        const approveCommands = createCommands(within2dBeforeStart);
        const approveResult = await approveCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'approve',
            refundAmount: 20_000,
            idempotencyKey: 'lifecycle-e-approve',
            expectedRevision: AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2),
          })
        );
        expect(approveResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('cancelled');
        expect(payment?.refundedAmount).toBe(20_000);
        expect(state.walletBalance).toBe(WALLET_START_KZT - COURSE_PRICE_KZT + 20_000);
        expect(state.availableSeats).toBe(8);
        expect(state.refundEvents).toBe(1);
      },
      30_000
    );

    it(
      'F. admin rejects pending cancellation and restores confirmed',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-f-enroll',
        });

        const pendingCommands = createCommands(within2dBeforeStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-f-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);

        const rejectCommands = createCommands(within2dBeforeStart);
        const rejectResult = await rejectCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'reject',
            idempotencyKey: 'lifecycle-f-reject',
            expectedRevision: AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2),
          })
        );
        expect(rejectResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('confirmed');
        expect(payment?.refundedAmount ?? 0).toBe(0);
        expect(state.refundEvents).toBe(0);
        expect(state.availableSeats).toBe(7);
      },
      30_000
    );

    it(
      'G. post-start zero-refund approval withdraws enrollment without increasing capacity',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-g-enroll',
        });

        const pendingCommands = createCommands(postStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-g-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);

        const approveCommands = createCommands(postStart);
        const approveResult = await approveCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'approve',
            refundAmount: 0,
            idempotencyKey: 'lifecycle-g-approve',
            expectedRevision: AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2),
          })
        );
        expect(approveResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('withdrawn');
        expect(state.availableSeats).toBe(7);
        expect(state.refundEvents).toBe(0);
      },
      30_000
    );

    it(
      'H. post-start positive-refund approval cancels enrollment without increasing capacity',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-h-enroll',
        });

        const pendingCommands = createCommands(postStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-h-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);

        const approveCommands = createCommands(postStart);
        const approveResult = await approveCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'approve',
            refundAmount: 10_000,
            idempotencyKey: 'lifecycle-h-approve',
            expectedRevision: AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2),
          })
        );
        expect(approveResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('cancelled');
        expect(payment?.refundedAmount).toBe(10_000);
        expect(state.availableSeats).toBe(7);
        expect(state.refundEvents).toBe(1);
      },
      30_000
    );

    it(
      'I. pre-start transfer succeeds with same enrollmentId and paymentId',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT, 8, { includeAdminAccount: true, includeCourseB: true });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-i-enroll',
          targetCourseId: courseId,
        });

        const transferCommands = createCommands('2026-01-25T00:00:00.000Z');
        const transferResult = await transferCommands.execute(
          transferEnvelope({
            enrollmentId: funded.enrollmentId,
            targetCourseId: courseIdB,
            idempotencyKey: 'lifecycle-i-transfer',
            expectedRevision: funded.revision,
          })
        );
        expect(transferResult.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const sourceCourse = (await firestore.doc(`courses/${courseId}`).get()).data();
        const targetCourse = (await firestore.doc(`courses/${courseIdB}`).get()).data();

        expect(enrollment?.courseId).toBe(courseIdB);
        expect(enrollment?.paymentId).toBe(funded.paymentId);
        expect(enrollment?.lifecycle.status).toBe('confirmed');
        expect(sourceCourse?.capacity?.availableSeats).toBe(8);
        expect(targetCourse?.capacity?.availableSeats).toBe(7);
      },
      30_000
    );

    it(
      'J. transfer fails on booking conflict and leaves source enrollment unchanged',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT + BOOKING_PRICE_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
          courseBDayCount: 2,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-j-enroll',
          targetCourseId: courseId,
        });

        const bookingCommands = createCommands('2026-01-10T00:00:00.000Z');
        const bookingResult = await bookingCommands.execute(
          bookingEnvelope({
            targetBookingId: bookingConflictId,
            idempotencyKey: 'lifecycle-j-booking',
            localDate: '2026-02-02',
            localTime: '09:00',
          })
        );
        expect(bookingResult.status).toBe('success');

        const before = await captureEnrollmentRollbackSnapshot(funded);

        const transferCommands = createCommands('2026-01-25T00:00:00.000Z');
        const transferResult = await transferCommands.execute(
          transferEnvelope({
            enrollmentId: funded.enrollmentId,
            targetCourseId: courseIdB,
            idempotencyKey: 'lifecycle-j-transfer',
            expectedRevision: funded.revision,
          })
        );
        expect(transferResult.status).toBe('error');
        if (transferResult.status === 'error') {
          expect(transferResult.error.code).toBe('participant_conflict');
        }

        const enrollment = await readEnrollment(funded.enrollmentId);
        const sourceCourse = (await firestore.doc(`courses/${courseId}`).get()).data();
        const targetCourse = (await firestore.doc(`courses/${courseIdB}`).get()).data();

        expect(enrollment?.courseId).toBe(courseId);
        expect(enrollment?.lifecycle.status).toBe('confirmed');
        expect(enrollment?.revision).toBe(before.enrollment?.revision);
        expect(sourceCourse?.capacity?.availableSeats).toBe(7);
        expect(targetCourse?.capacity?.availableSeats).toBe(8);

        const after = await captureEnrollmentRollbackSnapshot(funded);
        expect(after.payment).toEqual(before.payment);
        expect(after.walletBalance).toBe(before.walletBalance);
        expect(after.monetaryEventCount).toBe(before.monetaryEventCount);
        expect(after.successfulIdempotency).toBe(before.successfulIdempotency);
        expect(after.guard).toBeDefined();
        expect(after.claims.filter((claim) => claim?.lifecycle?.status === 'active').length).toBe(
          before.claims.filter((claim) => claim?.lifecycle?.status === 'active').length
        );
      },
      30_000
    );

    it(
      'N. re-enrollment after pre-start cancel creates a new enrollmentId',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const first = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-n-enroll-1',
        });

        const cancelCommands = createCommands(atLeast7dBeforeStart);
        const cancelResult = await cancelCommands.execute(
          cancelEnvelope({
            enrollmentId: first.enrollmentId,
            idempotencyKey: 'lifecycle-n-cancel',
            expectedRevision: first.revision,
          })
        );
        expect(cancelResult.status).toBe('success');

        const reEnrollCommands = createCommands(atLeast7dBeforeStart);
        const second = await createFundedEnrollment(reEnrollCommands, {
          idempotencyKey: 'lifecycle-n-enroll-2',
        });

        const state = await durableCounts();
        expect(second.enrollmentId).not.toBe(first.enrollmentId);
        expect(state.enrollments).toBe(2);
        expect(state.enrollmentGuards).toBe(1);
        expect(state.availableSeats).toBe(7);
        expect(
          (await readEnrollment(second.enrollmentId))?.lifecycle.status
        ).toBe('confirmed');
      },
      30_000
    );

    it(
      'I-up. pre-start transfer reprices payment upward and debits wallet for delta',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT + COURSE_PRICE_UP_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
          courseBPrice: COURSE_PRICE_UP_KZT,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-i-up-enroll',
        });
        const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
          ?.balance;

        const transferCommands = createCommands('2026-01-25T00:00:00.000Z');
        const transferResult = await transferCommands.execute(
          transferEnvelope({
            enrollmentId: funded.enrollmentId,
            targetCourseId: courseIdB,
            idempotencyKey: 'lifecycle-i-up-transfer',
            expectedRevision: funded.revision,
          })
        );
        expect(transferResult.status).toBe('success');

        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
          ?.balance;
        const instructorClaimsBefore = (await durableCounts()).instructorClaims;

        expect(payment?.price).toBe(COURSE_PRICE_UP_KZT);
        expect(payment?.paymentId).toBe(funded.paymentId);
        expect(walletAfter).toBe(walletBefore! - (COURSE_PRICE_UP_KZT - COURSE_PRICE_KZT));
        expect((await durableCounts()).instructorClaims).toBe(instructorClaimsBefore);
      },
      30_000
    );

    it(
      'I-down. pre-start transfer reprices payment downward and refunds wallet delta',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
          courseBPrice: COURSE_PRICE_DOWN_KZT,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-i-down-enroll',
        });
        const walletBefore = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
          ?.balance;

        const transferCommands = createCommands('2026-01-25T00:00:00.000Z');
        const transferResult = await transferCommands.execute(
          transferEnvelope({
            enrollmentId: funded.enrollmentId,
            targetCourseId: courseIdB,
            idempotencyKey: 'lifecycle-i-down-transfer',
            expectedRevision: funded.revision,
          })
        );
        expect(transferResult.status).toBe('success');

        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();
        const walletAfter = (await firestore.doc(`users/${accountId}/wallet/state`).get()).data()
          ?.balance;

        expect(payment?.price).toBe(COURSE_PRICE_DOWN_KZT);
        expect(walletAfter).toBe(walletBefore! + (COURSE_PRICE_KZT - COURSE_PRICE_DOWN_KZT));
      },
      30_000
    );

    it(
      'K. transfer vs last-seat enrollment race leaves exactly one winner',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT + COURSE_PRICE_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
          includeParticipantB: true,
          courseBSeats: 1,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-k-enroll',
        });

        const raceCommands = createCommands('2026-01-25T00:00:00.000Z');
        const [transferResult, enrollResult] = await Promise.all([
          raceCommands.execute(
            transferEnvelope({
              enrollmentId: funded.enrollmentId,
              targetCourseId: courseIdB,
              idempotencyKey: 'lifecycle-k-transfer',
              expectedRevision: funded.revision,
            })
          ),
          raceCommands.execute(enrollmentEnvelopeB({
            idempotencyKey: 'lifecycle-k-enroll-b',
            targetCourseId: courseIdB,
          })),
        ]);

        const successes = [transferResult, enrollResult].filter((result) => result.status === 'success');
        expect(successes).toHaveLength(1);

        const targetCourse = (await firestore.doc(`courses/${courseIdB}`).get()).data();
        expect(targetCourse?.capacity?.availableSeats).toBeGreaterThanOrEqual(0);
        expect((await firestore.collection('course_enrollments').get()).size).toBeLessThanOrEqual(2);
      },
      30_000
    );

    it(
      'L. duplicate transfer races serialize to one target course',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
          includeCourseC: true,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-l-enroll',
        });

        const raceCommands = createCommands('2026-01-25T00:00:00.000Z');
        const [toB, toC] = await Promise.all([
          raceCommands.execute(
            transferEnvelope({
              enrollmentId: funded.enrollmentId,
              targetCourseId: courseIdB,
              idempotencyKey: 'lifecycle-l-transfer-b',
              expectedRevision: funded.revision,
            })
          ),
          raceCommands.execute(
            transferEnvelope({
              enrollmentId: funded.enrollmentId,
              targetCourseId: courseIdC,
              idempotencyKey: 'lifecycle-l-transfer-c',
              expectedRevision: funded.revision,
            })
          ),
        ]);

        const successes = [toB, toC].filter((result) => result.status === 'success');
        expect(successes).toHaveLength(1);

        const enrollment = await readEnrollment(funded.enrollmentId);
        const finalCourseId = enrollment?.courseId;
        expect([courseIdB, courseIdC]).toContain(finalCourseId);
        expect(
          (await firestore.doc(`courses/${finalCourseId}`).get()).data()?.capacity?.availableSeats
        ).toBe(7);
      },
      30_000
    );

    it(
      'M. transfer vs cancellation race serializes without double finance or seat churn',
      async () => {
        await clearCollections(firestore);
        await seedBase(WALLET_START_KZT, 8, {
          includeAdminAccount: true,
          includeCourseB: true,
        });

        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-m-enroll',
        });

        const raceCommands = createCommands(atLeast7dBeforeStart);
        const [transferResult, cancelResult] = await Promise.all([
          raceCommands.execute(
            transferEnvelope({
              enrollmentId: funded.enrollmentId,
              targetCourseId: courseIdB,
              idempotencyKey: 'lifecycle-m-transfer',
              expectedRevision: funded.revision,
            })
          ),
          raceCommands.execute(
            cancelEnvelope({
              enrollmentId: funded.enrollmentId,
              idempotencyKey: 'lifecycle-m-cancel',
              expectedRevision: funded.revision,
            })
          ),
        ]);

        const successes = [transferResult, cancelResult].filter((result) => result.status === 'success');
        expect(successes).toHaveLength(1);

        const state = await durableCounts();
        expect(state.refundEvents).toBeLessThanOrEqual(1);
        expect(state.availableSeats).toBeGreaterThanOrEqual(6);
        expect(state.availableSeats).toBeLessThanOrEqual(8);
      },
      30_000
    );

    it(
      'O. guest expiry before course start releases seat and claims without wallet',
      async () => {
        await clearCollections(firestore);
        await seedBase(0, 8, { includeGuestParticipant: true });

        const createCommandsAt = createCommands('2026-01-30T03:00:00.000Z');
        const guest = await createGuestEnrollment(createCommandsAt, 'lifecycle-o-guest-create');

        const expireCommands = createCommands('2026-01-31T04:00:00.000Z');
        const expireResult = await expireCommands.execute(
          expireGuestEnrollmentEnvelope({
            enrollmentId: guest.enrollmentId,
            idempotencyKey: 'lifecycle-o-expire',
            expectedRevision: guest.revision,
          })
        );
        if (expireResult.status === 'error') {
          throw new Error(`expire failed: ${expireResult.error.code} ${JSON.stringify(expireResult.error.details)}`);
        }
        expect(expireResult.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const state = await durableCounts();
        const guestWallet = await firestore.doc(`users/${guestSubjectId}/wallet/state`).get();

        expect(enrollment?.lifecycle).toMatchObject({
          status: 'cancelled',
          reasonCode: 'reservation_expired',
        });
        expect(state.availableSeats).toBe(8);
        expect(state.enrollmentGuards).toBe(0);
        expect(guestWallet.exists).toBe(false);
        expect(state.monetaryEvents).toBe(0);
      },
      30_000
    );

    it(
      'P. guest expiry at course start terminalizes without increasing availableSeats',
      async () => {
        await clearCollections(firestore);
        await seedBase(0, 8, { includeGuestParticipant: true });

        const createCommandsAt = createCommands('2026-01-30T03:00:00.000Z');
        const guest = await createGuestEnrollment(createCommandsAt, 'lifecycle-p-guest-create');
        expect((await durableCounts()).availableSeats).toBe(7);

        const expireCommands = createCommands(postStart);
        const expireResult = await expireCommands.execute(
          expireGuestEnrollmentEnvelope({
            enrollmentId: guest.enrollmentId,
            idempotencyKey: 'lifecycle-p-expire',
            expectedRevision: guest.revision,
          })
        );
        if (expireResult.status === 'error') {
          throw new Error(`expire failed: ${expireResult.error.code} ${JSON.stringify(expireResult.error.details)}`);
        }
        expect(expireResult.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('cancelled');
        expect(state.availableSeats).toBe(7);
      },
      30_000
    );

    it(
      'Q. replays successful cancellation without duplicate refund or seat release',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-q-enroll',
        });

        const cancelEnvelopeValue = cancelEnvelope({
          enrollmentId: funded.enrollmentId,
          idempotencyKey: 'lifecycle-q-cancel',
          expectedRevision: funded.revision,
        });
        const cancelCommands = createCommands(atLeast7dBeforeStart);
        const first = await cancelCommands.execute(cancelEnvelopeValue);
        const replay = await cancelCommands.execute(cancelEnvelopeValue);
        expect(first.status).toBe('success');
        expect(replay.status).toBe('success');

        const state = await durableCounts();
        const payment = (await firestore.doc(`payments/${funded.paymentId}`).get()).data();

        const cancelIdentity = resolveCommandIdempotencyIdentity(cancelEnvelopeValue);
        const cancelIdempotency = await firestore
          .doc(`command_idempotency/${cancelIdentity.commandKey}`)
          .get();

        expect(payment?.refundedAmount).toBe(COURSE_PRICE_KZT);
        expect(state.refundEvents).toBe(1);
        expect(state.availableSeats).toBe(8);
        expect(cancelIdempotency.data()?.completionState).toBe('completed');
        expect(
          (await firestore.collection('command_idempotency').get()).docs.filter(
            (doc) => doc.id === cancelIdentity.commandKey
          )
        ).toHaveLength(1);
      },
      30_000
    );

    it(
      'R. stale revision races leave exactly one durable lifecycle winner',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-r-enroll',
        });

        const pendingCommands = createCommands(within2dBeforeStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-r-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);
        const pendingRevision = AggregateRevisionSchema.parse(pendingEnrollment?.revision ?? 2);

        const raceCommands = createCommands(within2dBeforeStart);
        const [approveResult, rejectResult] = await Promise.all([
          raceCommands.execute(
            resolveEnvelope({
              enrollmentId: funded.enrollmentId,
              decision: 'approve',
              refundAmount: 10_000,
              idempotencyKey: 'lifecycle-r-approve',
              expectedRevision: pendingRevision,
            })
          ),
          raceCommands.execute(
            resolveEnvelope({
              enrollmentId: funded.enrollmentId,
              decision: 'reject',
              idempotencyKey: 'lifecycle-r-reject',
              expectedRevision: pendingRevision,
            })
          ),
        ]);

        const successes = [approveResult, rejectResult].filter((result) => result.status === 'success');
        const stale = [approveResult, rejectResult].filter(
          (result) => result.status === 'error' && result.error.code === 'stale_version'
        );
        expect(successes).toHaveLength(1);
        expect(stale).toHaveLength(1);

        const enrollment = await readEnrollment(funded.enrollmentId);
        expect(['cancelled', 'confirmed']).toContain(enrollment?.lifecycle.status);
        expect(enrollment?.revision).toBeGreaterThan(pendingRevision);
      },
      30_000
    );

    it(
      'T. omits undefined optional lifecycle fields without Firestore write errors',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-t-enroll',
        });

        const pendingCommands = createCommands(within2dBeforeStart);
        await pendingCommands.execute(
          cancelEnvelope({
            enrollmentId: funded.enrollmentId,
            idempotencyKey: 'lifecycle-t-pending',
            expectedRevision: funded.revision,
          })
        );
        const pendingEnrollment = await readEnrollment(funded.enrollmentId);

        const rejectCommands = createCommands(within2dBeforeStart);
        const rejectResult = await rejectCommands.execute({
          kind: 'resolve_course_enrollment_cancellation',
          context: adminContext('lifecycle-t-reject', pendingEnrollment?.revision ?? 2),
          intent: {
            courseEnrollmentId: funded.enrollmentId,
            decision: 'reject',
            reasonExplanation: 'Lifecycle emulator reject without refundAmount',
          },
        });
        expect(rejectResult.status).toBe('success');

        const enrollmentDoc = await firestore.doc(`course_enrollments/${funded.enrollmentId}`).get();
        const paymentDoc = await firestore.doc(`payments/${funded.paymentId}`).get();
        expect(enrollmentDoc.exists).toBe(true);
        expect(paymentDoc.exists).toBe(true);
        expect(paymentDoc.data()?.payerAccountId).toBe(accountId);
        expect(enrollmentDoc.data()?.lifecycle?.status).toBe('confirmed');
      },
      30_000
    );

    it(
      'direct_cancel pre-start zero refund withdraws account enrollment and releases seat',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-direct-pre-enroll',
        });

        const directCommands = createCommands(atLeast7dBeforeStart);
        const result = await directCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'direct_cancel',
            refundAmount: 0,
            idempotencyKey: 'lifecycle-direct-pre',
            expectedRevision: funded.revision,
          })
        );
        expect(result.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('withdrawn');
        expect(state.refundEvents).toBe(0);
        expect(state.availableSeats).toBe(8);
      },
      30_000
    );

    it(
      'direct_cancel post-start zero refund withdraws without increasing capacity',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const funded = await createFundedEnrollment(createCommandsAt, {
          idempotencyKey: 'lifecycle-direct-post-enroll',
        });

        const directCommands = createCommands(postStart);
        const result = await directCommands.execute(
          resolveEnvelope({
            enrollmentId: funded.enrollmentId,
            decision: 'direct_cancel',
            refundAmount: 0,
            idempotencyKey: 'lifecycle-direct-post',
            expectedRevision: funded.revision,
          })
        );
        expect(result.status).toBe('success');

        const enrollment = await readEnrollment(funded.enrollmentId);
        const state = await durableCounts();

        expect(enrollment?.lifecycle.status).toBe('withdrawn');
        expect(state.availableSeats).toBe(7);
        expect(state.refundEvents).toBe(0);
      },
      30_000
    );
  }
);
