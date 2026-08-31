import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  accountCommandActor,
  courseEnrollmentIdFromCommandParticipant,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  participantManagementIdFromGuestLink,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const PROJECT_ID = 'ski-academy-admin-guest-enroll-link-emulator';
const correlationId = CorrelationIdSchema.parse('correlation_admin_guest_enroll_link_em_01');
const adminAccountId = AccountIdSchema.parse('account_admin_guest_enroll_link_em_admin');
const targetAccountId = AccountIdSchema.parse('account_admin_guest_enroll_link_em_target');
const guestParticipantId = ParticipantIdSchema.parse('participant_admin_guest_enroll_link_em_guest');
const managedParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_enroll_link_em_managed'
);
const instructorId = InstructorIdSchema.parse('instructor_admin_guest_enroll_link_em_01');
const courseId = CourseIdSchema.parse('course_admin_guest_enroll_link_em_01');
const courseDayId = CourseDayIdSchema.parse('course_day_admin_guest_enroll_link_em_01');
const managementId = participantManagementIdFromGuestLink({
  participantId: managedParticipantId,
  accountId: targetAccountId,
});
const guestSeedSubjectId = GuestSubjectIdSchema.parse(
  'guest_subject_admin_guest_enroll_link_em_actor'
);
const tokenSecret = 'admin-guest-enroll-link-emulator-secret';
const COURSE_PRICE_KZT = 50_000;
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

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

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret: tokenSecret }
  );
}

async function clearCollections() {
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
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedFixture() {
  for (const accountId of [adminAccountId, targetAccountId]) {
    await firestore.doc(`users/${accountId}`).set(
      AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_account',
          lastChangedByCommandId: 'command_seed_account',
          correlationId,
        },
      })
    );
  }
  await firestore.doc(`participants/${guestParticipantId}`).set({
    participantId: guestParticipantId,
    displayName: 'Guest Enrollment Emulator',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_guest',
      lastChangedByCommandId: 'command_seed_guest',
      correlationId,
    },
  });
  await firestore.doc(`participants/${managedParticipantId}`).set({
    participantId: managedParticipantId,
    displayName: 'Managed Enrollment Target',
    age: { kind: 'age_years', years: 18 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_managed',
      lastChangedByCommandId: 'command_seed_managed',
      correlationId,
    },
  });
  await firestore.doc(`participant_management/${managementId}`).set({
    participantManagementId: managementId,
    participantId: managedParticipantId,
    accountId: targetAccountId,
    role: 'owner',
    authority: 'self',
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_management',
      lastChangedByCommandId: 'command_seed_management',
      correlationId,
    },
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Admin Enrollment Link Coach',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Admin Enrollment Link Course',
    price: COURSE_PRICE_KZT,
    capacity: { totalSeats: 8, availableSeats: 8 },
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
      createdByCommandId: 'command_seed_course',
      lastChangedByCommandId: 'command_seed_course',
      correlationId,
    },
  });
  await firestore.doc(`courses/${courseId}/days/${courseDayId}`).set({
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: { startsAt: dayOneStart, endsAt: dayOneEnd },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_day',
      lastChangedByCommandId: 'command_seed_day',
      correlationId,
    },
  });
}

function guestCreateEnvelope(): CommandEnvelope<'create_course_enrollments'> {
  const sharedContext = {
    exercisedCapability: 'guest' as const,
    idempotencyKey: 'admin-guest-enroll-em-create',
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
      actor: guestCommandActor(guestSeedSubjectId),
    },
    intent: { courseId, participantIds: [guestParticipantId] },
  };
  const enrollmentId = courseEnrollmentIdFromCommandParticipant({
    commandId: resolveCommandIdempotencyIdentity(draft).commandKey,
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

function adminLinkEnvelope(
  enrollmentId: ReturnType<typeof courseEnrollmentIdFromCommandParticipant>,
  idempotencyKey: string,
  expectedRevision = 1
): CommandEnvelope<'link_guest_course_enrollment_to_account_as_administrator'> {
  return {
    kind: 'link_guest_course_enrollment_to_account_as_administrator',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      enrollmentId,
      targetAccountId,
      targetParticipantId: managedParticipantId,
      reasonExplanation: 'Emulator existing managed identity',
    },
  };
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'link_guest_course_enrollment_to_account_as_administrator (firestore emulator)',
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
      await clearCollections();
      await seedFixture();
    }, 30_000);

    it(
      'links existing_managed without consuming capacity, charging, or recreating the enrollment',
      async () => {
        const commands = createCommands();
        const createEnvelope = guestCreateEnvelope();
        expect((await commands.execute(createEnvelope)).status).toBe('success');
        const enrollmentId = createEnvelope.intent.enrollmentIds![0]!;
        const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
        const beforeCourse = (await firestore.doc(`courses/${courseId}`).get()).data();
        const paymentBefore = (await firestore.doc(`payments/${paymentId}`).get()).data();
        const enrollmentBefore = (
          await firestore.doc(`course_enrollments/${enrollmentId}`).get()
        ).data();

        const envelope = adminLinkEnvelope(enrollmentId, 'admin-guest-enroll-em-link');
        expect((await commands.execute(envelope)).status).toBe('success');
        expect((await commands.execute(envelope)).status).toBe('success');

        const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
        const payment = (await firestore.doc(`payments/${paymentId}`).get()).data();
        expect(enrollment?.participantId).toBe(managedParticipantId);
        expect(enrollment?.guestAccountLink).toMatchObject({
          linkedAccountId: targetAccountId,
          linkedParticipantId: managedParticipantId,
        });
        expect(enrollment?.guestAccountLink?.credentialNonce).toBeUndefined();
        expect(enrollment?.attribution).toEqual(enrollmentBefore?.attribution);
        expect(payment?.payerAccountId).toBe(targetAccountId);
        expect(payment?.paidAmount).toBe(paymentBefore?.paidAmount);
        expect(payment?.paymentStatus).toBe(paymentBefore?.paymentStatus);
        expect((await firestore.doc(`courses/${courseId}`).get()).data()?.capacity.availableSeats).toBe(
          beforeCourse?.capacity.availableSeats
        );
        expect((await firestore.collection('course_enrollments').get()).size).toBe(1);
        expect(
          (await firestore.doc(`participants/${guestParticipantId}`).get()).data()?.management
        ).toEqual({ kind: 'unmanaged_guest' });
      },
      30_000
    );

    it(
      'serializes concurrent Admin enrollment link attempts to one effect',
      async () => {
        const commands = createCommands();
        const createEnvelope = guestCreateEnvelope();
        expect((await commands.execute(createEnvelope)).status).toBe('success');
        const enrollmentId = createEnvelope.intent.enrollmentIds![0]!;
        const [first, second] = await Promise.all([
          commands.execute(adminLinkEnvelope(enrollmentId, 'admin-guest-enroll-em-race-a')),
          commands.execute(adminLinkEnvelope(enrollmentId, 'admin-guest-enroll-em-race-b')),
        ]);
        const successes = [first, second].filter((result) => result.status === 'success');
        expect(successes.length).toBe(1);
        expect(
          (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data()?.participantId
        ).toBe(managedParticipantId);
      },
      30_000
    );
  }
);
