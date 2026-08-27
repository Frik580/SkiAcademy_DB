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
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  SystemActorIdSchema,
  WalletSchema,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  guestCommandActor,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  participantManagementIdFromGuestLink,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  signGuestActionCredential,
  signGuestCourseEnrollmentActionCredential,
  createGuestActionTokenNonce,
  GUEST_ACTION_TOKEN_VERSION,
  systemCommandActor,
  timestampFromDate,
  COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type GuestCourseEnrollmentLinkCredential,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-guest-course-enrollment-link-emulator-test';
const guestActionTokenSecret = 'guest-course-link-emulator-secret';

const correlationId = CorrelationIdSchema.parse('correlation_guest_link_emulator_01');
const correlationIdB = CorrelationIdSchema.parse('correlation_guest_link_emulator_02');
const accountId = AccountIdSchema.parse('account_guest_link_emulator_owner_01');
const accountIdB = AccountIdSchema.parse('account_guest_link_emulator_owner_02');
const participantId = ParticipantIdSchema.parse('participant_guest_link_emulator_managed_01');
const participantIdB = ParticipantIdSchema.parse('participant_guest_link_emulator_managed_02');
const participantIdAccountB = ParticipantIdSchema.parse('participant_guest_link_emulator_account_b_01');
const participantIdDuplicateName = ParticipantIdSchema.parse(
  'participant_guest_link_emulator_dup_name_02'
);
const participantIdCreate = ParticipantIdSchema.parse('participant_guest_link_emulator_create_01');
const managementId = ParticipantManagementIdSchema.parse('management_guest_link_emulator_01');
const managementIdB = ParticipantManagementIdSchema.parse('management_guest_link_emulator_02');
const managementIdAccountB = ParticipantManagementIdSchema.parse('management_guest_link_emulator_account_b_01');
const managementIdDuplicateName = ParticipantManagementIdSchema.parse(
  'management_guest_link_emulator_dup_name_02'
);
const guestParticipantId = ParticipantIdSchema.parse('participant_guest_link_emulator_guest_01');
const guestParticipantIdTwo = ParticipantIdSchema.parse('participant_guest_link_emulator_guest_02');
const guestParticipantIdThree = ParticipantIdSchema.parse('participant_guest_link_emulator_guest_03');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_subject_guest_link_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_link_emulator_01');
const courseId = CourseIdSchema.parse('course_guest_link_emulator_01');
const courseDayId = CourseDayIdSchema.parse('course_day_guest_link_emulator_01');
const bookingConflictId = BookingIdSchema.parse('booking_guest_link_emulator_conflict_01');
const bookingAdjacentId = BookingIdSchema.parse('booking_guest_link_emulator_adjacent_01');
const bookingRaceId = BookingIdSchema.parse('booking_guest_link_emulator_race_01');

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));
const dayTwoStart = timestampFromDate(new Date('2026-02-02T03:00:00.000Z'));
const dayTwoEnd = timestampFromDate(new Date('2026-02-02T05:00:00.000Z'));

const within2dBeforeStart = new Date(
  dayOneStart.seconds * 1000 +
    dayOneStart.nanoseconds / 1_000_000 -
    COURSE_CLIENT_CANCELLATION_WINDOW_2D_MS +
    60 * 60 * 1_000
).toISOString();

const COURSE_PRICE_KZT = 50_000;
const BOOKING_PRICE_KZT = 12_000;
const WALLET_START_KZT = COURSE_PRICE_KZT * 3;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'participant_management_active_owner',
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
  'attendance',
] as const;

let app: App;
let firestore: Firestore;

interface GuestEnrollmentSeed {
  readonly enrollmentId: CourseEnrollmentId;
  readonly paymentId: ReturnType<typeof paymentIdFromCourseEnrollmentId>;
  readonly revision: number;
  readonly credential: GuestCourseEnrollmentLinkCredential;
  readonly attribution: Record<string, unknown>;
}

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret,
  });
}

function accountContext(
  idempotencyKey: string,
  actorAccountId = accountId,
  correlation = correlationId,
  capability: 'account_owner' | 'parent_guardian' = 'account_owner'
) {
  return {
    actor: accountCommandActor(actorAccountId),
    exercisedCapability: capability,
    idempotencyKey,
    correlationId: correlation,
    source: 'client_callable' as const,
    calendarInput: {
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
    },
    timezone: 'Asia/Almaty' as const,
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

function seedParticipantRecord(input: {
  participantId: typeof participantId;
  managementId: typeof managementId;
  displayName: string;
  authority?: 'self' | 'parent_guardian';
}) {
  return {
    participantId: input.participantId,
    displayName: input.displayName,
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: input.managementId },
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

function seedGuestParticipantRecord(participantIdValue = guestParticipantId, displayName = 'Guest Link Emulator Participant') {
  return {
    participantId: participantIdValue,
    displayName,
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

function seedManagementRecord(input: {
  managementId: typeof managementId;
  participantId: typeof participantId;
  targetAccountId?: typeof accountId;
  authority?: 'self' | 'parent_guardian';
}) {
  return {
    participantManagementId: input.managementId,
    participantId: input.participantId,
    accountId: input.targetAccountId ?? accountId,
    role: 'owner',
    authority: input.authority ?? 'self',
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
  availableSeats: number;
  courseDayCount?: 1 | 2;
}) {
  const courseDayCount = input.courseDayCount ?? 1;
  const finalEndsAt = courseDayCount === 1 ? dayOneEnd : dayTwoEnd;

  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Guest Link Emulator Course',
    price: COURSE_PRICE_KZT,
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
  const dayIds = [courseDayId, CourseDayIdSchema.parse('course_day_guest_link_emulator_02')];
  for (const dayOrder of dayOrders) {
    const interval =
      dayOrder === 1
        ? { startsAt: dayOneStart, endsAt: dayOneEnd }
        : { startsAt: dayTwoStart, endsAt: dayTwoEnd };
    await firestore.doc(`courses/${courseId}/days/${dayIds[dayOrder - 1]!}`).set({
      courseId,
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
  options: {
    includeAccountB?: boolean;
    includeDuplicateNameParticipants?: boolean;
    availableSeats?: number;
    courseDayCount?: 1 | 2;
  } = {}
) {
  await firestore.doc(`users/${accountId}`).set(seedAccountRecord(accountId));
  await firestore.doc(`users/${accountId}/wallet/state`).set(seedWallet(WALLET_START_KZT));
  if (options.includeAccountB) {
    await firestore.doc(`users/${accountIdB}`).set(seedAccountRecord(accountIdB));
    await firestore.doc(`users/${accountIdB}/wallet/state`).set(seedWallet(WALLET_START_KZT, accountIdB));
    await firestore.doc(`participants/${participantIdAccountB}`).set(
      seedParticipantRecord({
        participantId: participantIdAccountB,
        managementId: managementIdAccountB,
        displayName: 'Account B Participant',
      })
    );
    await firestore.doc(`participant_management/${managementIdAccountB}`).set(
      seedManagementRecord({
        managementId: managementIdAccountB,
        participantId: participantIdAccountB,
        targetAccountId: accountIdB,
      })
    );
  }
  await firestore.doc(`participants/${participantId}`).set(
    seedParticipantRecord({
      participantId,
      managementId,
      displayName: 'Alex Smith',
    })
  );
  await firestore.doc(`participant_management/${managementId}`).set(
    seedManagementRecord({ managementId, participantId })
  );
  await firestore.doc(`participants/${participantIdB}`).set(
    seedParticipantRecord({
      participantId: participantIdB,
      managementId: managementIdB,
      displayName: 'Managed Participant B',
    })
  );
  await firestore.doc(`participant_management/${managementIdB}`).set(
    seedManagementRecord({ managementId: managementIdB, participantId: participantIdB })
  );
  if (options.includeDuplicateNameParticipants) {
    await firestore.doc(`participants/${participantIdDuplicateName}`).set(
      seedParticipantRecord({
        participantId: participantIdDuplicateName,
        managementId: managementIdDuplicateName,
        displayName: 'Alex Smith',
      })
    );
    await firestore.doc(`participant_management/${managementIdDuplicateName}`).set(
      seedManagementRecord({
        managementId: managementIdDuplicateName,
        participantId: participantIdDuplicateName,
      })
    );
  }
  await firestore.doc(`participants/${guestParticipantId}`).set(seedGuestParticipantRecord());
  await firestore.doc(`participants/${guestParticipantIdTwo}`).set(
    seedGuestParticipantRecord(guestParticipantIdTwo, 'Guest Link Emulator Participant Two')
  );
  await firestore.doc(`participants/${guestParticipantIdThree}`).set(
    seedGuestParticipantRecord(guestParticipantIdThree, 'Guest Link Emulator Participant Three')
  );
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: `Instructor ${instructorId}`,
    pricePerHourKZT: BOOKING_PRICE_KZT,
    isAvailable: true,
  });
  await seedCourseWithSchedule({
    availableSeats: options.availableSeats ?? 64,
    courseDayCount: options.courseDayCount,
  });
}

function guestEnrollmentEnvelope(
  idempotencyKey: string,
  targetParticipantId: typeof guestParticipantId = guestParticipantId
): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      actor: guestCommandActor(guestSubjectId),
      exercisedCapability: 'guest',
      idempotencyKey,
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-02-01',
        localTime: '09:00',
        durationMinutes: 120,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      courseId,
      participantIds: [targetParticipantId],
    },
  };
}

function enrollmentEnvelope(input: {
  idempotencyKey: string;
  targetParticipantId?: typeof participantId;
}): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: accountContext(input.idempotencyKey),
    intent: {
      courseId,
      participantIds: [input.targetParticipantId ?? participantId],
    },
  };
}

function bookingEnvelope(input: {
  targetBookingId: typeof bookingConflictId;
  idempotencyKey: string;
  localTime: string;
  targetParticipantId?: typeof participantId;
  actorAccountId?: typeof accountId;
}): CommandEnvelope<'create_confirmed_booking'> {
  return {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: input.idempotencyKey,
      correlationId: CorrelationIdSchema.parse(`correlation_booking_${input.idempotencyKey}`),
      source: 'client_callable',
      calendarInput: {
        localDate: '2026-02-01',
        localTime: input.localTime,
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
    },
    intent: {
      bookingId: input.targetBookingId,
      instructorId,
      participantIds: [input.targetParticipantId ?? participantId],
    },
  };
}

function linkEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  credential: Pick<GuestCourseEnrollmentLinkCredential, 'nonce' | 'signature'>;
  participantTarget: CommandEnvelope<'link_guest_course_enrollment_to_account'>['intent']['participantTarget'];
  idempotencyKey: string;
  expectedRevision: number;
  actorAccountId?: typeof accountId;
  correlation?: typeof correlationId;
  expectedParticipantManagementRevision?: number;
}): CommandEnvelope<'link_guest_course_enrollment_to_account'> {
  return {
    kind: 'link_guest_course_enrollment_to_account',
    context: {
      ...accountContext(
        input.idempotencyKey,
        input.actorAccountId ?? accountId,
        input.correlation ?? correlationId
      ),
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
      ...(input.expectedParticipantManagementRevision === undefined
        ? {}
        : {
            expectedParticipantManagementRevision: AggregateRevisionSchema.parse(
              input.expectedParticipantManagementRevision
            ),
          }),
    },
    intent: {
      enrollmentId: input.enrollmentId,
      guestLinkCredential: {
        nonce: input.credential.nonce,
        signature: input.credential.signature,
      },
      participantTarget: input.participantTarget,
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
      actor: systemCommandActor(SystemActorIdSchema.parse('system_guest_link_emulator_expiry')),
      exercisedCapability: 'system',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'scheduler',
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: { courseEnrollmentId: input.enrollmentId },
  };
}

async function createGuestEnrollment(
  commands: ReturnType<typeof createCommands>,
  idempotencyKey: string,
  targetParticipantId: typeof guestParticipantId = guestParticipantId
): Promise<GuestEnrollmentSeed> {
  const envelope = guestEnrollmentEnvelope(idempotencyKey, targetParticipantId);
  const result = await commands.execute(envelope);
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('guest enrollment create failed');
  }

  const identity = resolveCommandIdempotencyIdentity(envelope);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId: targetParticipantId,
  });
  const enrollmentDoc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  const credential = result.payload?.guestLinkCredentials?.find(
    (entry) => entry.enrollmentId === enrollmentId
  );
  expect(credential).toBeDefined();
  expect(credential?.guestSubjectId).toBe(guestSubjectIdFromCourseEnrollmentId(enrollmentId));

  return {
    enrollmentId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    revision: AggregateRevisionSchema.parse(enrollmentDoc.data()?.revision ?? 1),
    credential: credential!,
    attribution: enrollmentDoc.data()?.attribution as Record<string, unknown>,
  };
}

async function createFundedEnrollment(
  commands: ReturnType<typeof createCommands>,
  input: { idempotencyKey: string; targetParticipantId?: typeof participantId }
) {
  const envelope = enrollmentEnvelope(input);
  const result = await commands.execute(envelope);
  expect(result.status).toBe('success');
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: identity.commandKey,
    participantId: input.targetParticipantId ?? participantId,
  });
  const enrollmentDoc = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
  return {
    enrollmentId,
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    revision: AggregateRevisionSchema.parse(enrollmentDoc.data()?.revision ?? 1),
  };
}

async function readEnrollment(enrollmentId: CourseEnrollmentId) {
  return (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
}

async function durableCounts(targetCourseId = courseId) {
  const [enrollments, courses, payments, monetaryEvents, activityLogs, idempotency, claims, guards, outbox] =
    await Promise.all([
      firestore.collection('course_enrollments').get(),
      firestore.collection('courses').get(),
      firestore.collection('payments').get(),
      firestore.collection('monetary_events').get(),
      firestore.collection('activity_logs').get(),
      firestore.collection('command_idempotency').get(),
      firestore.collection('resource_claims').get(),
      firestore.collection('active_course_enrollment_guards').get(),
      firestore.collection('domain_outbox').get(),
    ]);

  const course = courses.docs.find((doc) => doc.id === targetCourseId)?.data();
  const successfulIdempotency = idempotency.docs.filter(
    (doc) => doc.data().completionState === 'completed'
  );

  return {
    enrollments: enrollments.size,
    availableSeats: course?.capacity?.availableSeats as number | undefined,
    payments: payments.size,
    monetaryEvents: monetaryEvents.size,
    activityLogs: activityLogs.size,
    successfulIdempotency: successfulIdempotency.length,
    claims: claims.size,
    enrollmentGuards: guards.size,
    outbox: outbox.size,
    seatClaims: claims.docs.filter((doc) => doc.data()?.claimKind === 'course_seat_pre_start').length,
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

async function listParticipantCourseDayClaims(targetParticipantId: typeof participantId) {
  const claims = await firestore.collection('resource_claims').get();
  return claims.docs.filter(
    (doc) =>
      doc.data()?.claimKind === 'participant_course_day_enrollment' &&
      doc.data()?.resourceId === targetParticipantId
  );
}

async function readActiveEnrollmentGuard(
  targetCourseId = courseId,
  targetParticipantId = participantId
) {
  const guards = await firestore.collection('active_course_enrollment_guards').get();
  return guards.docs.find(
    (doc) =>
      doc.data()?.participantId === targetParticipantId && doc.data()?.courseId === targetCourseId
  )?.data();
}

function paymentImmutableSnapshot(payment: Record<string, unknown> | undefined) {
  return {
    originalPrice: payment?.originalPrice,
    price: payment?.price,
    paidAmount: payment?.paidAmount,
    refundedAmount: payment?.refundedAmount,
    retainedAmount: payment?.retainedAmount,
    settledAmount: payment?.settledAmount,
    writtenOffAmount: payment?.writtenOffAmount,
    outstandingAmount: payment?.outstandingAmount,
    eventRevision: payment?.eventRevision,
    paymentStatus: payment?.paymentStatus,
    payerAccountId: payment?.payerAccountId,
  };
}

async function readWalletBalance(targetAccountId = accountId) {
  const wallet = (await firestore.doc(`users/${targetAccountId}/wallet/state`).get()).data();
  return wallet?.balance as number | undefined;
}

function signEnrollmentLinkCredential(input: {
  enrollmentId: CourseEnrollmentId;
  guestSubjectId: GuestCourseEnrollmentLinkCredential['guestSubjectId'];
  expiresAt: GuestCourseEnrollmentLinkCredential['expiresAt'];
  nonce: string;
}) {
  return signGuestCourseEnrollmentActionCredential(guestActionTokenSecret, {
    version: GUEST_ACTION_TOKEN_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId: input.enrollmentId,
    guestSubjectId: input.guestSubjectId,
    purpose: 'link_guest_course_enrollment',
    expiresAt: input.expiresAt,
    nonce: input.nonce,
  });
}

async function assertRollbackState(input: {
  guest: GuestEnrollmentSeed;
  expectedParticipantId: typeof guestParticipantId;
  paymentBefore: Record<string, unknown> | undefined;
  seatsBefore: number | undefined;
  guestDayClaimsBeforeCount: number;
}) {
  const enrollment = await readEnrollment(input.guest.enrollmentId);
  const payment = (await firestore.doc(`payments/${input.guest.paymentId}`).get()).data();
  const after = await durableCounts();
  const guestDayClaims = await listParticipantCourseDayClaims(input.expectedParticipantId);
  const seatClaims = await listEnrollmentOwnedClaims(input.guest.enrollmentId);

  expect(enrollment?.participantId).toBe(input.expectedParticipantId);
  expect(enrollment?.guestAccountLink).toBeUndefined();
  expect(paymentImmutableSnapshot(payment)).toEqual(paymentImmutableSnapshot(input.paymentBefore));
  expect(after.availableSeats).toBe(input.seatsBefore);
  expect(
    seatClaims.find((claim) => claim.claimKind === 'course_seat_pre_start')?.lifecycle?.status
  ).toBe('active');
  expect(
    guestDayClaims.filter((doc) => doc.data()?.lifecycle?.status === 'active').length
  ).toBe(input.guestDayClaimsBeforeCount);
  expect(await readActiveEnrollmentGuard(courseId, input.expectedParticipantId)).toBeDefined();
}

function cancelEnrollmentEnvelope(input: {
  enrollmentId: CourseEnrollmentId;
  idempotencyKey: string;
  expectedRevision: number;
  actorAccountId?: typeof accountId;
  correlation?: typeof correlationId;
}): CommandEnvelope<'request_course_enrollment_cancellation'> {
  return {
    kind: 'request_course_enrollment_cancellation',
    context: {
      ...accountContext(
        input.idempotencyKey,
        input.actorAccountId ?? accountId,
        input.correlation ?? correlationId
      ),
      expectedRevision: AggregateRevisionSchema.parse(input.expectedRevision),
    },
    intent: { courseEnrollmentId: input.enrollmentId },
  };
}

async function setGuestEnrollmentLifecycleForEmulator(
  enrollmentId: CourseEnrollmentId,
  currentRevision: number,
  lifecycle: { status: 'confirmed' } | { status: 'pending_cancellation'; requestedAt: typeof decidedAt }
): Promise<number> {
  const nextRevision = AggregateRevisionSchema.parse(currentRevision + 1);
  await firestore.doc(`course_enrollments/${enrollmentId}`).update({
    lifecycle,
    revision: nextRevision,
    updatedAt: decidedAt,
  });
  return nextRevision;
}

async function seedPreExtensionGuestEnrollment(): Promise<{
  enrollmentId: CourseEnrollmentId;
  paymentId: ReturnType<typeof paymentIdFromCourseEnrollmentId>;
}> {
  const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_guest_link_emulator_legacy');
  const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
  const ephemeralGuestSubjectId = GuestSubjectIdSchema.parse('guest_subject_ephemeral_legacy_01');

  await firestore.doc(`course_enrollments/${enrollmentId}`).set({
    enrollmentId,
    participantId: guestParticipantId,
    courseId,
    originalCourseId: courseId,
    attribution: {
      bookingOrigin: 'guest',
      bookedBy: { kind: 'guest', guestSubjectId: ephemeralGuestSubjectId },
    },
    lifecycle: {
      status: 'pending',
      reservationExpiresAt: timestampFromDate(new Date('2026-01-15T00:00:00.000Z')),
    },
    paymentId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_legacy',
      lastChangedByCommandId: 'command_seed_legacy',
      correlationId,
    },
  });
  await firestore.doc(`payments/${paymentId}`).set({
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
    eventRevision: 0,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });

  return { enrollmentId, paymentId };
}

function assertNoUndefinedFields(value: unknown, path = 'root'): void {
  if (value === undefined) {
    throw new Error(`undefined at ${path}`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefinedFields(nested, `${path}.${key}`);
  }
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'guest course enrollment link commands (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST =
        process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    }, 30_000);

    afterAll(async () => {
      if (app) {
        await deleteApp(app);
      }
    });

    beforeEach(async () => {
      await clearCollections(firestore);
      await seedBase();
    }, 30_000);

    it(
      'A. existing_managed links with claim swap, guard migration, payer association, and immutable attribution',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-a-create');
        const before = await durableCounts();
        const paymentBefore = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const walletBefore = await readWalletBalance();
        const guestDayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);

        const linkResult = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-a-link',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(linkResult.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const payment = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const after = await durableCounts();
        const guestDayClaimsAfter = await listParticipantCourseDayClaims(guestParticipantId);
        const managedDayClaimsAfter = await listParticipantCourseDayClaims(participantId);
        const guestClaimsAfter = await listEnrollmentOwnedClaims(guest.enrollmentId);

        expect(enrollment?.participantId).toBe(participantId);
        expect(enrollment?.guestAccountLink).toMatchObject({
          linkedAccountId: accountId,
          linkedParticipantId: participantId,
          credentialNonce: guest.credential.nonce,
        });
        expect(enrollment?.attribution).toEqual(guest.attribution);
        expect(enrollment?.payerAccountId).toBeUndefined();
        expect(payment?.payerAccountId).toBe(accountId);
        expect(paymentImmutableSnapshot(payment)).toEqual({
          ...paymentImmutableSnapshot(paymentBefore),
          payerAccountId: accountId,
        });
        expect(await readWalletBalance()).toBe(walletBefore);
        expect(after.monetaryEvents).toBe(before.monetaryEvents);
        expect(
          guestClaimsAfter.find((claim) => claim.claimKind === 'course_seat_pre_start')?.lifecycle?.status
        ).toBe('active');
        expect(
          guestDayClaimsAfter.filter((doc) => doc.data()?.lifecycle?.status === 'active').length
        ).toBe(0);
        expect(managedDayClaimsAfter.length).toBe(guestDayClaimsBefore.length);
        expect(after.availableSeats).toBe(before.availableSeats);
        expect(await readActiveEnrollmentGuard(courseId, participantId)).toBeDefined();
        expect(await readActiveEnrollmentGuard(courseId, guestParticipantId)).toBeUndefined();
      },
      30_000
    );

    it(
      'B. rejects invalid guest credentials without durable mutation',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-b-create');
        const before = await durableCounts();
        const enrollmentBefore = await readEnrollment(guest.enrollmentId);

        const bookingCredential = signGuestActionCredential(guestActionTokenSecret, {
          version: 'guest-token:v1',
          subjectKind: 'booking',
          bookingId: bookingConflictId,
          guestSubjectId: guestSubjectIdFromBookingId(bookingConflictId),
          purpose: 'cancel_pending_reservation',
          expiresAt: guest.credential.expiresAt,
          nonce: guest.credential.nonce,
        });

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: { nonce: guest.credential.nonce, signature: bookingCredential },
            idempotencyKey: 'guest-link-b-invalid',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('unauthorized');
        }

        const after = await durableCounts();
        const enrollmentAfter = await readEnrollment(guest.enrollmentId);
        expect(after).toEqual(before);
        expect(enrollmentAfter).toEqual(enrollmentBefore);
      },
      30_000
    );

    it(
      'C. forbids linking to a participant the account does not manage',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeAccountB: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-c-create');
        const before = await durableCounts();

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-c-forbidden',
            expectedRevision: guest.revision,
            actorAccountId: accountIdB,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('forbidden');
        }

        const after = await durableCounts();
        expect(after).toEqual(before);
        expect((await readEnrollment(guest.enrollmentId))?.guestAccountLink).toBeUndefined();
      },
      30_000
    );

    it(
      'D. requires explicit participantId when duplicate display names exist',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeDuplicateNameParticipants: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-d-create');

        const linkDuplicate = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-d-dup-name',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId: participantIdDuplicateName },
          })
        );
        expect(linkDuplicate.status).toBe('success');
        if (linkDuplicate.status === 'success') {
          const enrollment = await readEnrollment(guest.enrollmentId);
          expect(enrollment?.participantId).toBe(participantIdDuplicateName);
          expect(enrollment?.guestAccountLink?.linkedParticipantId).toBe(participantIdDuplicateName);
        }
      },
      30_000
    );

    it(
      'E. rejects existing_managed when target participant has a booking conflict',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-e-create');
        const paymentBefore = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const seatsBefore = (await durableCounts()).availableSeats;
        const guestDayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);
        const bookingResult = await commands.execute(
          bookingEnvelope({
            targetBookingId: bookingConflictId,
            idempotencyKey: 'guest-link-e-booking',
            localTime: '09:00',
          })
        );
        expect(bookingResult.status).toBe('success');

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-e-link',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('participant_conflict');
        }

        await assertRollbackState({
          guest,
          expectedParticipantId: guestParticipantId,
          paymentBefore,
          seatsBefore,
          guestDayClaimsBeforeCount: guestDayClaimsBefore.filter(
            (doc) => doc.data()?.lifecycle?.status === 'active'
          ).length,
        });
      },
      30_000
    );

    it(
      'E-create_managed. rolls back create_managed when target participant already exists without orphan state',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-e-create-managed-create');
        const paymentBefore = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const seatsBefore = (await durableCounts()).availableSeats;
        const guestDayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);

        await firestore.doc(`participants/${participantIdCreate}`).set(
          seedParticipantRecord({
            participantId: participantIdCreate,
            managementId: ParticipantManagementIdSchema.parse('management_guest_link_emulator_create_01'),
            displayName: 'Pre-seeded Create Target',
          })
        );
        await firestore.doc(`participant_management/${ParticipantManagementIdSchema.parse('management_guest_link_emulator_create_01')}`).set(
          seedManagementRecord({
            managementId: ParticipantManagementIdSchema.parse('management_guest_link_emulator_create_01'),
            participantId: participantIdCreate,
          })
        );

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-e-create-managed-link',
            expectedRevision: guest.revision,
            participantTarget: {
              kind: 'create_managed',
              participantId: participantIdCreate,
              displayName: 'Created Managed Participant',
              age: { kind: 'age_years', years: 16 },
              skillLevel: 'beginner',
              discipline: 'ski',
            },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('validation');
        }

        const participants = await firestore.collection('participants').get();
        const managementDocs = await firestore.collection('participant_management').get();
        expect(participants.docs.filter((doc) => doc.id === participantIdCreate)).toHaveLength(1);
        expect(
          managementDocs.docs.filter(
            (doc) =>
              doc.id ===
              participantManagementIdFromGuestLink({
                participantId: participantIdCreate,
                accountId,
              })
          )
        ).toHaveLength(0);

        await assertRollbackState({
          guest,
          expectedParticipantId: guestParticipantId,
          paymentBefore,
          seatsBefore,
          guestDayClaimsBeforeCount: guestDayClaimsBefore.filter(
            (doc) => doc.data()?.lifecycle?.status === 'active'
          ).length,
        });
      },
      30_000
    );

    it(
      'F. allows half-open adjacent booking intervals during existing_managed link',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-f-create');
        const bookingResult = await commands.execute(
          bookingEnvelope({
            targetBookingId: bookingAdjacentId,
            idempotencyKey: 'guest-link-f-booking',
            localTime: '07:00',
          })
        );
        expect(bookingResult.status).toBe('success');

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-f-link',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('success');
      },
      30_000
    );

    it(
      'G. rejects existing_managed when target already has an active enrollment on the same course',
      async () => {
        const commands = createCommands();
        await createFundedEnrollment(commands, { idempotencyKey: 'guest-link-g-existing' });
        const guest = await createGuestEnrollment(commands, 'guest-link-g-create');
        const paymentBefore = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const seatsBefore = (await durableCounts()).availableSeats;
        const guestDayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-g-link',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(['duplicate_active_enrollment', 'participant_conflict']).toContain(result.error.code);
        }

        await assertRollbackState({
          guest,
          expectedParticipantId: guestParticipantId,
          paymentBefore,
          seatsBefore,
          guestDayClaimsBeforeCount: guestDayClaimsBefore.filter(
            (doc) => doc.data()?.lifecycle?.status === 'active'
          ).length,
        });
      },
      30_000
    );

    it(
      'H. serializes two accounts with different credentials racing to link the same guest enrollment',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeAccountB: true, includeDuplicateNameParticipants: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-h-create');
        const nonceA = guest.credential.nonce;
        const nonceB = createGuestActionTokenNonce();
        const signatureB = signEnrollmentLinkCredential({
          enrollmentId: guest.enrollmentId,
          guestSubjectId: guest.credential.guestSubjectId,
          expiresAt: guest.credential.expiresAt,
          nonce: nonceB,
        });

        const [attemptA, attemptB] = await Promise.all([
          commands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: { nonce: nonceA, signature: guest.credential.signature },
              idempotencyKey: 'guest-link-h-account-a',
              expectedRevision: guest.revision,
              actorAccountId: accountId,
              expectedParticipantManagementRevision: 1,
              participantTarget: { kind: 'existing_managed', participantId },
            })
          ),
          commands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: { nonce: nonceB, signature: signatureB },
              idempotencyKey: 'guest-link-h-account-b',
              expectedRevision: guest.revision,
              actorAccountId: accountIdB,
              correlation: correlationIdB,
              expectedParticipantManagementRevision: 1,
              participantTarget: {
                kind: 'existing_managed',
                participantId: participantIdAccountB,
              },
            })
          ),
        ]);

        const successes = [attemptA, attemptB].filter((attempt) => attempt.status === 'success');
        const failures = [attemptA, attemptB].filter((attempt) => attempt.status === 'error');
        expect(successes.length + failures.length).toBe(2);
        expect(successes.length).toBeGreaterThanOrEqual(1);
        expect(failures.length).toBeGreaterThanOrEqual(1);

        const enrollment = await readEnrollment(guest.enrollmentId);
        const payment = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const winnerAccountId = enrollment?.guestAccountLink?.linkedAccountId;
        expect(winnerAccountId).toBeDefined();
        expect(successes.some((attempt) => attempt.status === 'success')).toBe(true);
        expect(payment?.payerAccountId).toBe(winnerAccountId);

        if (winnerAccountId === accountId) {
          expect(enrollment?.participantId).toBe(participantId);
          const management = (await firestore.doc(`participant_management/${managementId}`).get()).data();
          expect(management?.accountId).toBe(accountId);
          expect(management?.status).toBe('active');
        } else {
          expect(enrollment?.participantId).toBe(participantIdAccountB);
          const management = (
            await firestore.doc(`participant_management/${managementIdAccountB}`).get()
          ).data();
          expect(management?.accountId).toBe(accountIdB);
          expect(management?.status).toBe('active');
        }
        expect(
          await readActiveEnrollmentGuard(courseId, enrollment?.participantId as typeof participantId)
        ).toBeDefined();
        const winnerDayClaims = await listParticipantCourseDayClaims(
          enrollment?.participantId as typeof participantId
        );
        expect(
          winnerDayClaims.filter((doc) => doc.data()?.lifecycle?.status === 'active').length
        ).toBeGreaterThan(0);
      },
      30_000
    );

    it(
      'I. serializes same-account races to different managed participants',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeDuplicateNameParticipants: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-i-create');

        const [attemptA, attemptB] = await Promise.all([
          commands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: guest.credential,
              idempotencyKey: 'guest-link-i-participant-a',
              expectedRevision: guest.revision,
              expectedParticipantManagementRevision: 1,
              participantTarget: { kind: 'existing_managed', participantId },
            })
          ),
          commands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: guest.credential,
              idempotencyKey: 'guest-link-i-participant-b',
              expectedRevision: guest.revision,
              correlation: correlationIdB,
              expectedParticipantManagementRevision: 1,
              participantTarget: {
                kind: 'existing_managed',
                participantId: participantIdDuplicateName,
              },
            })
          ),
        ]);

        const successes = [attemptA, attemptB].filter((attempt) => attempt.status === 'success');
        const failures = [attemptA, attemptB].filter((attempt) => attempt.status === 'error');
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
      },
      30_000
    );

    it(
      'J. preserves participant conflict invariants when link races overlapping booking creation',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-j-create');

        const [linkResult, bookingResult] = await Promise.all([
          commands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: guest.credential,
              idempotencyKey: 'guest-link-j-link',
              expectedRevision: guest.revision,
              expectedParticipantManagementRevision: 1,
              participantTarget: { kind: 'existing_managed', participantId },
            })
          ),
          commands.execute(
            bookingEnvelope({
              targetBookingId: bookingRaceId,
              idempotencyKey: 'guest-link-j-booking',
              localTime: '09:00',
            })
          ),
        ]);

        const successes = [linkResult, bookingResult].filter((result) => result.status === 'success');
        expect(successes).toHaveLength(1);

        const enrollment = await readEnrollment(guest.enrollmentId);
        const bookings = await firestore.collection('bookings').get();
        if (linkResult.status === 'success') {
          expect(enrollment?.participantId).toBe(participantId);
          expect(bookingResult.status).toBe('error');
        } else {
          expect(bookingResult.status).toBe('success');
          expect(enrollment?.guestAccountLink).toBeUndefined();
        }
        expect(bookings.size).toBeLessThanOrEqual(1);
      },
      30_000
    );

    it(
      'K. replays an exact link command without duplicate claims, audit, outbox, or payment mutation',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-k-create');
        const envelope = linkEnvelope({
          enrollmentId: guest.enrollmentId,
          credential: guest.credential,
          idempotencyKey: 'guest-link-k-replay',
          expectedRevision: guest.revision,
          expectedParticipantManagementRevision: 1,
          participantTarget: { kind: 'existing_managed', participantId },
        });

        const first = await commands.execute(envelope);
        expect(first.status).toBe('success');
        const afterFirst = await durableCounts();
        const paymentAfterFirst = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();

        const replay = await commands.execute(envelope);
        expect(replay.status).toBe('success');
        const afterReplay = await durableCounts();
        const paymentAfterReplay = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();

        expect(afterReplay.enrollments).toBe(afterFirst.enrollments);
        expect(afterReplay.payments).toBe(afterFirst.payments);
        expect(afterReplay.claims).toBe(afterFirst.claims);
        expect(afterReplay.activityLogs).toBe(afterFirst.activityLogs);
        expect(afterReplay.successfulIdempotency).toBe(afterFirst.successfulIdempotency);
        expect(paymentAfterReplay?.revision).toBe(paymentAfterFirst?.revision);
      },
      30_000
    );

    it(
      'L. create_managed survives concurrent Firestore contention without duplicate participants, management, or link state',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-l-create');
        const envelope = linkEnvelope({
          enrollmentId: guest.enrollmentId,
          credential: guest.credential,
          idempotencyKey: 'guest-link-l-create-managed-contention',
          expectedRevision: guest.revision,
          participantTarget: {
            kind: 'create_managed',
            participantId: participantIdCreate,
            displayName: 'Created Managed Participant',
            age: { kind: 'age_years', years: 16 },
            skillLevel: 'beginner',
            discipline: 'ski',
          },
        });

        const first = await commands.execute(envelope);
        expect(first.status).toBe('success');

        const retries = await Promise.all([
          commands.execute(envelope),
          commands.execute(envelope),
          commands.execute(envelope),
        ]);
        expect(retries.every((attempt) => attempt.status === 'success')).toBe(true);

        const participants = await firestore.collection('participants').get();
        const managementDocs = await firestore.collection('participant_management').get();
        const enrollment = await readEnrollment(guest.enrollmentId);
        const payment = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();

        expect(participants.docs.filter((doc) => doc.id === participantIdCreate)).toHaveLength(1);
        expect(
          managementDocs.docs.filter(
            (doc) =>
              doc.id ===
              participantManagementIdFromGuestLink({
                participantId: participantIdCreate,
                accountId,
              })
          )
        ).toHaveLength(1);
        expect(enrollment?.participantId).toBe(participantIdCreate);
        expect(enrollment?.guestAccountLink).toMatchObject({
          linkedAccountId: accountId,
          linkedParticipantId: participantIdCreate,
          credentialNonce: guest.credential.nonce,
        });
        expect(payment?.payerAccountId).toBe(accountId);
      },
      30_000
    );

    it(
      'M. persists linked enrollment without invalid undefined Firestore fields',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-m-create');
        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-m-link',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(result.status).toBe('success');

        const enrollment = (await firestore.doc(`course_enrollments/${guest.enrollmentId}`).get()).data();
        const payment = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const participant = (await firestore.doc(`participants/${guestParticipantId}`).get()).data();
        const managementIdResolved = participantManagementIdFromGuestLink({
          participantId: guestParticipantId,
          accountId,
        });
        const management = (
          await firestore.doc(`participant_management/${managementIdResolved}`).get()
        ).data();

        expect(() => assertNoUndefinedFields(enrollment)).not.toThrow();
        expect(() => assertNoUndefinedFields(payment)).not.toThrow();
        expect(() => assertNoUndefinedFields(participant)).not.toThrow();
        expect(() => assertNoUndefinedFields(management)).not.toThrow();
        expect(enrollment?.payerAccountId).toBeUndefined();
      },
      30_000
    );

    it(
      'N. serializes link vs guest expiry to one terminal outcome without double capacity release',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const guest = await createGuestEnrollment(createCommandsAt, 'guest-link-n-create');
        const seatsAfterCreate = (await durableCounts()).availableSeats;

        const linkCommands = createCommands('2026-01-15T12:00:00.000Z');
        const expireCommands = createCommands('2026-01-15T12:00:00.000Z');
        const [linkResult, expireResult] = await Promise.all([
          linkCommands.execute(
            linkEnvelope({
              enrollmentId: guest.enrollmentId,
              credential: guest.credential,
              idempotencyKey: 'guest-link-n-link',
              expectedRevision: guest.revision,
              expectedParticipantManagementRevision: 1,
              participantTarget: { kind: 'existing_managed', participantId },
            })
          ),
          expireCommands.execute(
            expireGuestEnrollmentEnvelope({
              enrollmentId: guest.enrollmentId,
              idempotencyKey: 'guest-link-n-expire',
              expectedRevision: guest.revision,
            })
          ),
        ]);

        const successes = [linkResult, expireResult].filter((result) => result.status === 'success');
        expect(successes).toHaveLength(1);

        const enrollment = await readEnrollment(guest.enrollmentId);
        const seatsAfterRace = (await durableCounts()).availableSeats;
        if (linkResult.status === 'success') {
          expect(enrollment?.guestAccountLink?.linkedAccountId).toBe(accountId);
          expect(expireResult.status).toBe('error');
          expect(seatsAfterRace).toBe(seatsAfterCreate);
        } else {
          expect(enrollment?.lifecycle?.status).toBe('cancelled');
          expect(seatsAfterRace).toBe((seatsAfterCreate ?? 0) + 1);
        }
      },
      30_000
    );

    it(
      'O. promote_guest keeps participantId, promotes management, and leaves seat claims unchanged',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-o-create');
        const before = await durableCounts();
        const seatClaimsBefore = await listEnrollmentOwnedClaims(guest.enrollmentId);
        const dayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-o-promote',
            expectedRevision: guest.revision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(result.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const participant = (await firestore.doc(`participants/${guestParticipantId}`).get()).data();
        const after = await durableCounts();
        const seatClaimsAfter = await listEnrollmentOwnedClaims(guest.enrollmentId);
        const dayClaimsAfter = await listParticipantCourseDayClaims(guestParticipantId);

        expect(enrollment?.participantId).toBe(guestParticipantId);
        expect(participant?.management?.kind).toBe('managed');
        expect(enrollment?.attribution).toEqual(guest.attribution);
        expect(after.availableSeats).toBe(before.availableSeats);
        expect(seatClaimsAfter).toEqual(seatClaimsBefore);
        expect(dayClaimsAfter.length).toBe(dayClaimsBefore.length);
      },
      30_000
    );

    it(
      'P. create_managed composes participant, management, claim migration, and guard acquisition atomically',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-p-create');

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-p-create-managed',
            expectedRevision: guest.revision,
            participantTarget: {
              kind: 'create_managed',
              participantId: participantIdCreate,
              displayName: 'Created Managed Participant',
              age: { kind: 'age_years', years: 16 },
              skillLevel: 'beginner',
              discipline: 'ski',
            },
          })
        );
        expect(result.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const createdParticipant = (
          await firestore.doc(`participants/${participantIdCreate}`).get()
        ).data();
        const guestParticipant = (
          await firestore.doc(`participants/${guestParticipantId}`).get()
        ).data();
        const managedDayClaims = await listParticipantCourseDayClaims(participantIdCreate);

        expect(enrollment?.participantId).toBe(participantIdCreate);
        expect(createdParticipant?.management?.kind).toBe('managed');
        expect(guestParticipant?.management?.kind).toBe('unmanaged_guest');
        expect(managedDayClaims.length).toBeGreaterThan(0);
        expect(await readActiveEnrollmentGuard(courseId, participantIdCreate)).toBeDefined();
      },
      30_000
    );

    it(
      'Q. rejects credential reuse by a different account after a successful link',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeAccountB: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-q-create');
        const firstLink = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-q-first',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(firstLink.status).toBe('success');
        const linked = await readEnrollment(guest.enrollmentId);

        const secondLink = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-q-second',
            expectedRevision: AggregateRevisionSchema.parse((linked?.revision as number) ?? 2),
            actorAccountId: accountIdB,
            correlation: correlationIdB,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId: participantIdAccountB },
          })
        );
        expect(secondLink.status).toBe('error');
        if (secondLink.status === 'error') {
          expect(secondLink.error.code).toBe('forbidden');
        }

        const enrollment = await readEnrollment(guest.enrollmentId);
        expect(enrollment?.guestAccountLink?.linkedAccountId).toBe(accountId);
      },
      30_000
    );

    it(
      'R. rejects pre-extension guest enrollments without durable deterministic guestSubjectId attribution',
      async () => {
        const commands = createCommands();
        const legacy = await seedPreExtensionGuestEnrollment();
        const credential = (
          await createGuestEnrollment(commands, 'guest-link-r-credential-donor')
        ).credential;

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: legacy.enrollmentId,
            credential,
            idempotencyKey: 'guest-link-r-legacy',
            expectedRevision: 1,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('validation');
        }

        const enrollment = await readEnrollment(legacy.enrollmentId);
        expect(enrollment?.guestAccountLink).toBeUndefined();
      },
      30_000
    );

    it(
      'rejects link when payment payerAccountId is set to a different account than the linker',
      async () => {
        await clearCollections(firestore);
        await seedBase({ includeAccountB: true });

        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-payer-mismatch-create');
        await firestore.doc(`payments/${guest.paymentId}`).update({
          payerAccountId: accountIdB,
          revision: 2,
        });

        const result = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-payer-mismatch',
            expectedRevision: guest.revision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(result.status).toBe('error');
        if (result.status === 'error') {
          expect(result.error.code).toBe('forbidden');
        }

        expect((await readEnrollment(guest.enrollmentId))?.guestAccountLink).toBeUndefined();
      },
      30_000
    );

    it(
      'rejects credential nonce reuse with a different nonce after successful link',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-nonce-reuse-create');
        const first = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-nonce-reuse-first',
            expectedRevision: guest.revision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(first.status).toBe('success');

        const linked = await readEnrollment(guest.enrollmentId);
        const differentNonce = createGuestActionTokenNonce();
        const differentSignature = signEnrollmentLinkCredential({
          enrollmentId: guest.enrollmentId,
          guestSubjectId: guest.credential.guestSubjectId,
          expiresAt: guest.credential.expiresAt,
          nonce: differentNonce,
        });
        const replayWithDifferentNonce = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: {
              nonce: differentNonce,
              signature: differentSignature,
            },
            idempotencyKey: 'guest-link-nonce-reuse-second',
            expectedRevision: AggregateRevisionSchema.parse((linked?.revision as number) ?? 2),
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(replayWithDifferentNonce.status).toBe('error');
        if (replayWithDifferentNonce.status === 'error') {
          expect(replayWithDifferentNonce.error.code).toBe('unauthorized');
        }
      },
      30_000
    );

    it(
      'accepts link credential just before expiresAt and rejects at/after finalCourseDayEndsAt',
      async () => {
        const createCommandsAt = createCommands('2026-01-01T00:00:00.000Z');
        const guest = await createGuestEnrollment(createCommandsAt, 'guest-link-expiry-create');
        const confirmedRevision = await setGuestEnrollmentLifecycleForEmulator(
          guest.enrollmentId,
          guest.revision,
          { status: 'confirmed' }
        );
        const beforeExpiryCommands = createCommands('2026-02-01T04:59:59.999Z');
        const atExpiryCommands = createCommands('2026-02-01T05:00:00.000Z');
        const afterExpiryCommands = createCommands('2026-02-01T05:00:00.001Z');

        const beforeResult = await beforeExpiryCommands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-expiry-before',
            expectedRevision: confirmedRevision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(beforeResult.status).toBe('success');

        const guestAtExpiry = await createGuestEnrollment(
          createCommandsAt,
          'guest-link-expiry-create-at',
          guestParticipantIdTwo
        );
        const confirmedAtRevision = await setGuestEnrollmentLifecycleForEmulator(
          guestAtExpiry.enrollmentId,
          guestAtExpiry.revision,
          { status: 'confirmed' }
        );
        const atResult = await atExpiryCommands.execute(
          linkEnvelope({
            enrollmentId: guestAtExpiry.enrollmentId,
            credential: guestAtExpiry.credential,
            idempotencyKey: 'guest-link-expiry-at',
            expectedRevision: confirmedAtRevision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(atResult.status).toBe('error');
        if (atResult.status === 'error') {
          expect(atResult.error.code).toBe('unauthorized');
        }
        expect((await readEnrollment(guestAtExpiry.enrollmentId))?.guestAccountLink).toBeUndefined();

        const guestAfterExpiry = await createGuestEnrollment(
          createCommandsAt,
          'guest-link-expiry-create-after',
          guestParticipantIdThree
        );
        const confirmedAfterRevision = await setGuestEnrollmentLifecycleForEmulator(
          guestAfterExpiry.enrollmentId,
          guestAfterExpiry.revision,
          { status: 'confirmed' }
        );
        const afterResult = await afterExpiryCommands.execute(
          linkEnvelope({
            enrollmentId: guestAfterExpiry.enrollmentId,
            credential: guestAfterExpiry.credential,
            idempotencyKey: 'guest-link-expiry-after',
            expectedRevision: confirmedAfterRevision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(afterResult.status).toBe('error');
        if (afterResult.status === 'error') {
          expect(afterResult.error.code).toBe('unauthorized');
        }
        expect(
          (await readEnrollment(guestAfterExpiry.enrollmentId))?.guestAccountLink
        ).toBeUndefined();
      },
      30_000
    );

    it(
      'allows promote_guest after course start while participant-changing link remains forbidden',
      async () => {
        const preStartCommands = createCommands('2026-01-01T00:00:00.000Z');
        const postStartCommands = createCommands('2026-02-01T04:00:00.000Z');
        const guest = await createGuestEnrollment(preStartCommands, 'guest-link-post-start-create');
        const linkableRevision = await setGuestEnrollmentLifecycleForEmulator(
          guest.enrollmentId,
          guest.revision,
          { status: 'confirmed' }
        );
        const dayClaimsBefore = await listParticipantCourseDayClaims(guestParticipantId);
        const guardBefore = await readActiveEnrollmentGuard(courseId, guestParticipantId);

        const promoteResult = await postStartCommands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-post-start-promote',
            expectedRevision: linkableRevision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(promoteResult.status).toBe('success');

        const enrollment = await readEnrollment(guest.enrollmentId);
        const payment = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const participant = (await firestore.doc(`participants/${guestParticipantId}`).get()).data();
        const dayClaimsAfter = await listParticipantCourseDayClaims(guestParticipantId);

        expect(enrollment?.participantId).toBe(guestParticipantId);
        expect(enrollment?.attribution).toEqual(guest.attribution);
        expect(participant?.management?.kind).toBe('managed');
        expect(payment?.payerAccountId).toBe(accountId);
        expect(dayClaimsAfter.length).toBe(dayClaimsBefore.length);
        expect(await readActiveEnrollmentGuard(courseId, guestParticipantId)).toEqual(guardBefore);

        const guestTwo = await createGuestEnrollment(
          preStartCommands,
          'guest-link-post-start-create-two',
          guestParticipantIdTwo
        );
        const guestTwoLinkableRevision = await setGuestEnrollmentLifecycleForEmulator(
          guestTwo.enrollmentId,
          guestTwo.revision,
          { status: 'confirmed' }
        );
        const blockedResult = await postStartCommands.execute(
          linkEnvelope({
            enrollmentId: guestTwo.enrollmentId,
            credential: guestTwo.credential,
            idempotencyKey: 'guest-link-post-start-existing-managed',
            expectedRevision: guestTwoLinkableRevision,
            expectedParticipantManagementRevision: 1,
            participantTarget: { kind: 'existing_managed', participantId },
          })
        );
        expect(blockedResult.status).toBe('error');
        if (blockedResult.status === 'error') {
          expect(blockedResult.error.code).toBe('invalid_transition');
        }
        expect((await readEnrollment(guestTwo.enrollmentId))?.guestAccountLink).toBeUndefined();
      },
      30_000
    );

    it(
      'grants post-link account authority through request_course_enrollment_cancellation despite guest provenance',
      async () => {
        const setupCommands = createCommands('2026-01-01T00:00:00.000Z');
        const guest = await createGuestEnrollment(
          setupCommands,
          'guest-link-lifecycle-authority-create'
        );
        const confirmedRevision = await setGuestEnrollmentLifecycleForEmulator(
          guest.enrollmentId,
          guest.revision,
          { status: 'confirmed' }
        );

        const linkCommands = createCommands('2026-01-15T12:00:00.000Z');
        const linkResult = await linkCommands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-lifecycle-authority-link',
            expectedRevision: confirmedRevision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(linkResult.status).toBe('success');

        const linked = await readEnrollment(guest.enrollmentId);
        expect(linked?.attribution?.bookingOrigin).toBe('guest');
        expect(linked?.attribution?.bookedBy).toEqual(guest.attribution.bookedBy);
        expect(linked?.guestAccountLink?.linkedAccountId).toBe(accountId);

        const resolvedManagementId = participantManagementIdFromGuestLink({
          participantId: guestParticipantId,
          accountId,
        });
        const management = (
          await firestore.doc(`participant_management/${resolvedManagementId}`).get()
        ).data();
        expect(management?.status).toBe('active');
        expect(management?.accountId).toBe(accountId);
        expect(management?.participantId).toBe(guestParticipantId);

        await firestore.doc(`users/${accountIdB}`).set(seedAccountRecord(accountIdB));

        const cancelCommands = createCommands(within2dBeforeStart);
        const linkedRevision = AggregateRevisionSchema.parse(linked?.revision as number);

        const accountBResult = await cancelCommands.execute(
          cancelEnrollmentEnvelope({
            enrollmentId: guest.enrollmentId,
            idempotencyKey: 'guest-link-lifecycle-authority-cancel-b',
            expectedRevision: linkedRevision,
            actorAccountId: accountIdB,
            correlation: correlationIdB,
          })
        );
        expect(accountBResult.status).toBe('error');
        if (accountBResult.status === 'error') {
          expect(accountBResult.error.code).toBe('forbidden');
        }

        const accountAResult = await cancelCommands.execute(
          cancelEnrollmentEnvelope({
            enrollmentId: guest.enrollmentId,
            idempotencyKey: 'guest-link-lifecycle-authority-cancel-a',
            expectedRevision: linkedRevision,
          })
        );
        expect(accountAResult.status).toBe('success');

        const afterCancel = await readEnrollment(guest.enrollmentId);
        expect(afterCancel?.lifecycle?.status).toBe('pending_cancellation');
        expect(afterCancel?.attribution?.bookingOrigin).toBe('guest');
        expect(afterCancel?.attribution?.bookedBy).toEqual(guest.attribution.bookedBy);
      },
      30_000
    );

    it(
      'replays same persisted nonce with a new command identity without duplicate domain mutations',
      async () => {
        const commands = createCommands();
        const guest = await createGuestEnrollment(commands, 'guest-link-same-nonce-create');
        const first = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-same-nonce-first',
            expectedRevision: guest.revision,
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(first.status).toBe('success');
        const linkedAfterFirst = await readEnrollment(guest.enrollmentId);
        const paymentAfterFirst = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const countsAfterFirst = await durableCounts();

        const second = await commands.execute(
          linkEnvelope({
            enrollmentId: guest.enrollmentId,
            credential: guest.credential,
            idempotencyKey: 'guest-link-same-nonce-second',
            expectedRevision: AggregateRevisionSchema.parse((linkedAfterFirst?.revision as number) ?? 2),
            participantTarget: { kind: 'promote_guest' },
          })
        );
        expect(second.status).toBe('success');

        const linkedAfterSecond = await readEnrollment(guest.enrollmentId);
        const paymentAfterSecond = (await firestore.doc(`payments/${guest.paymentId}`).get()).data();
        const countsAfterSecond = await durableCounts();

        expect(linkedAfterSecond).toEqual(linkedAfterFirst);
        expect(paymentAfterSecond).toEqual(paymentAfterFirst);
        expect(countsAfterSecond.enrollments).toBe(countsAfterFirst.enrollments);
        expect(countsAfterSecond.payments).toBe(countsAfterFirst.payments);
        expect(countsAfterSecond.claims).toBe(countsAfterFirst.claims);
        expect(countsAfterSecond.enrollmentGuards).toBe(countsAfterFirst.enrollmentGuards);
        expect(countsAfterSecond.successfulIdempotency).toBe(countsAfterFirst.successfulIdempotency + 1);
      },
      30_000
    );
  }
);
