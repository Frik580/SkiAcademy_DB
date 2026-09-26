import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  SystemActorIdSchema,
  deriveGuestSubjectIdFromCourseEnrollmentIntent,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  systemCommandActor,
  timestampFromDate,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type CourseId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { deriveGuestSubjectIdForIntent } from '../commands/guestCallableTransportAdapter';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { queryCourseEnrollmentReadModels } from '../readModels/courseEnrollmentReadModels';
import { queryCourseCatalogReadModels } from '../readModels/courseCatalogReadModels';
import { parseCourse } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';

const PROJECT_ID = 'ski-academy-guest-course-transport-emulator-test';
const guestActionTokenSecret = 'guest-course-transport-emulator-secret';
const correlationId = CorrelationIdSchema.parse('correlation_guest_transport_emulator_01');
const courseId = CourseIdSchema.parse('course_guest_transport_emulator_01');
const courseDayId = CourseDayIdSchema.parse('course_day_guest_transport_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_guest_transport_emulator_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_guest_transport_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_transport_emulator_01');
const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const dayOneStart = timestampFromDate(new Date('2026-02-01T03:00:00.000Z'));
const dayOneEnd = timestampFromDate(new Date('2026-02-01T05:00:00.000Z'));

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)), guestActionTokenSecret };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  return createProductionCanonicalCommands(
    environment(at),
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret }
  );
}

function guestEnrollmentEnvelope(idempotencyKey: string): CommandEnvelope<'create_course_enrollments'> {
  return guestEnrollmentAttemptEnvelope({
    idempotencyKey,
    participantId,
    enrollmentId,
  });
}

function guestEnrollmentAttemptEnvelope(input: {
  readonly idempotencyKey: string;
  readonly participantId: ParticipantId;
  readonly enrollmentId: CourseEnrollmentId;
  readonly courseId?: CourseId;
  readonly correlationId?: ReturnType<typeof CorrelationIdSchema.parse>;
}): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      actor: guestCommandActor(guestSubjectIdFromCourseEnrollmentId(input.enrollmentId)),
      exercisedCapability: 'guest',
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId ?? correlationId,
      source: 'guest_callable',
      transportMetadata: {
        participant_display_name: 'Guest Transport Student',
        participant_skill_level: 'beginner',
        participant_discipline: 'ski',
        participant_age_years: '25',
        guest_contact_phone: '+7 701 123 45 67',
        guest_contact_email: 'course@example.com',
      },
    },
    intent: {
      courseId: input.courseId ?? courseId,
      participantIds: [input.participantId],
      enrollmentIds: [input.enrollmentId],
    },
  };
}

function expireGuestEnrollmentEnvelope(input: {
  readonly enrollmentId: CourseEnrollmentId;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
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

async function seedSecondCourse() {
  const secondCourseId = CourseIdSchema.parse('course_guest_transport_emulator_02');
  const secondDayId = CourseDayIdSchema.parse('course_day_guest_transport_emulator_02');
  const secondDayStart = timestampFromDate(new Date('2026-03-01T03:00:00.000Z'));
  const secondDayEnd = timestampFromDate(new Date('2026-03-01T05:00:00.000Z'));
  await firestore.doc(`courses/${secondCourseId}`).set({
    courseId: secondCourseId,
    title: 'Guest Transport Course B',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats: 8 },
    instructorRosterIds: [instructorId],
    startAt: secondDayStart,
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: secondDayEnd,
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
  await firestore.doc(`courses/${secondCourseId}/days/${secondDayId}`).set({
    courseId: secondCourseId,
    courseDayId: secondDayId,
    dayOrder: 1,
    interval: { startsAt: secondDayStart, endsAt: secondDayEnd },
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
  return secondCourseId;
}

async function durableGuestCounts(targetCourseId = courseId) {
  const [enrollments, courseSnap, payments, guards] = await Promise.all([
    firestore.collection('course_enrollments').get(),
    firestore.doc(`courses/${targetCourseId}`).get(),
    firestore.collection('payments').get(),
    firestore.collection('active_course_enrollment_guards').get(),
  ]);
  return {
    enrollments: enrollments.size,
    availableSeats: courseSnap.data()?.capacity?.availableSeats as number | undefined,
    payments: payments.size,
    enrollmentGuards: guards.size,
  };
}

async function seedCourse() {
  await firestore.doc(`courses/${courseId}`).set({
    courseId,
    title: 'Guest Transport Course',
    price: 50_000,
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
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
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
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Guest Transport Instructor',
    pricePerHourKZT: 10_000,
    isAvailable: true,
  });
}

describe.runIf(runsOnFirestoreEmulator)('guest course enrollment transport emulator', () => {
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
    const collections = [
      'courses',
      'course_enrollments',
      'participants',
      'guest_contacts',
      'payments',
      'resource_claims',
      'resource_claim_guards',
      'active_course_enrollment_guards',
      'command_idempotency',
    ];
    for (const collection of collections) {
      const snapshot = await firestore.collection(collection).get();
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await seedCourse();
  });

  it('provisions guest participant, enrolls, returns credentials, and authorizes guest_single read', async () => {
    const derivedSubject = deriveGuestSubjectIdForIntent({
      courseId,
      participantIds: [participantId],
      enrollmentIds: [enrollmentId],
    });
    expect(derivedSubject).toBe(guestSubjectId);
    expect(
      deriveGuestSubjectIdFromCourseEnrollmentIntent({
        courseId,
        participantIds: [participantId],
        enrollmentIds: [enrollmentId],
      })
    ).toBe(guestSubjectId);

    const commands = createCommands();
    const result = await commands.execute(guestEnrollmentEnvelope('idem-guest-transport-01'));
    expect(result.status).toBe('success');
    const credential = result.status === 'success' ? result.payload?.guestLinkCredentials?.[0] : undefined;
    expect(credential?.enrollmentId).toBe(enrollmentId);
    expect(credential?.guestSubjectId).toBe(guestSubjectId);

    const participantSnap = await firestore.doc(`participants/${participantId}`).get();
    const participant = participantSnap.data();
    expect(participantSnap.exists).toBe(true);
    expect(participant?.management?.kind).toBe('unmanaged_guest');
    expect((await firestore.doc(`guest_contacts/course_enrollment_${enrollmentId}`).get()).data())
      .toMatchObject({ phone: '+7 701 123 45 67', email: 'course@example.com' });

    const enrollmentSnap = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
    const enrollment = parseCourseEnrollment(
      enrollmentSnap.data() as Record<string, unknown> | undefined
    );
    expect(enrollmentSnap.exists).toBe(true);
    expect(enrollment?.enrollmentId).toBe(enrollmentId);
    expect(enrollment?.participantId).toBe(participantId);
    expect(enrollment?.attribution.bookingOrigin).toBe('guest');
    expect(enrollment?.attribution.bookedBy).toEqual({
      kind: 'guest',
      guestSubjectId,
    });

    const courseSnap = await firestore.doc(`courses/${courseId}`).get();
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    expect(course).toBeDefined();

    const readNow = new Date('2026-01-01T00:00:00.000Z');
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret: guestActionTokenSecret,
      nonce: credential!.nonce,
      signature: credential!.signature,
      now: timestampFromDate(readNow),
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt: course!.scheduleProjection.finalCourseDayEndsAt,
    });
    expect(verification.valid).toBe(true);
    expect(credential?.expiresAt).toEqual(course!.scheduleProjection.finalCourseDayEndsAt);

    const read = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: readNow }
    );
    expect(read.items).toHaveLength(1);
    expect(read.items[0]?.enrollmentId).toBe(enrollmentId);

    const tampered = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: 'a'.repeat(64),
      },
      { guestActionSecret: guestActionTokenSecret, now: readNow }
    );
    expect(tampered.items).toHaveLength(0);

    const otherEnrollmentId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_02'
    );
    const crossEnrollment = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId: otherEnrollmentId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: readNow }
    );
    expect(crossEnrollment.items).toHaveLength(0);

    const expired = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: new Date('2026-03-01T00:00:00.000Z') }
    );
    expect(expired.items).toHaveLength(0);
  });

  it('refreshes targeted public catalog seats after guest enrollment', async () => {
    const commands = createCommands();
    const before = await queryCourseCatalogReadModels(firestore, { scope: 'public', courseId });
    expect(before.items[0]?.capacity.availableSeats).toBe(8);

    const result = await commands.execute(guestEnrollmentEnvelope('idem-guest-seat-refresh'));
    expect(result.status).toBe('success');

    const after = await queryCourseCatalogReadModels(firestore, { scope: 'public', courseId });
    expect(after.items[0]?.capacity.availableSeats).toBe(7);
    expect(after.items).toHaveLength(1);
  });

  it('rejects a second active enrollment for the same guest participant and course', async () => {
    const commands = createCommands();
    const first = await commands.execute(guestEnrollmentEnvelope('idem-guest-dup-first'));
    expect(first.status).toBe('success');

    const secondEnrollmentId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_dup'
    );
    const second = await commands.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'idem-guest-dup-second',
        participantId,
        enrollmentId: secondEnrollmentId,
        correlationId: CorrelationIdSchema.parse('correlation_guest_transport_emulator_dup'),
      })
    );
    expect(second.status).toBe('error');
    if (second.status === 'error') {
      expect(second.error.code).toBe('duplicate_active_enrollment');
    }

    const state = await durableGuestCounts();
    expect(state.enrollments).toBe(1);
    expect(state.payments).toBe(1);
    expect(state.availableSeats).toBe(7);
    expect(state.enrollmentGuards).toBe(1);
  });

  it('serializes concurrent same-guest enrollments to one seat and one payment', async () => {
    const commands = createCommands();
    const secondEnrollmentId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_race'
    );
    const attempts = await Promise.all([
      commands.execute(guestEnrollmentEnvelope('idem-guest-race-a')),
      commands.execute(
        guestEnrollmentAttemptEnvelope({
          idempotencyKey: 'idem-guest-race-b',
          participantId,
          enrollmentId: secondEnrollmentId,
          correlationId: CorrelationIdSchema.parse('correlation_guest_transport_emulator_race'),
        })
      ),
    ]);

    const successes = attempts.filter((attempt) => attempt.status === 'success');
    const duplicates = attempts.filter(
      (attempt) => attempt.status === 'error' && attempt.error.code === 'duplicate_active_enrollment'
    );
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);

    const state = await durableGuestCounts();
    expect(state.enrollments).toBe(1);
    expect(state.payments).toBe(1);
    expect(state.availableSeats).toBe(7);
    expect(state.enrollmentGuards).toBe(1);
  });

  it('allows a different guest to enroll the same course when seats remain', async () => {
    const commands = createCommands();
    const first = await commands.execute(guestEnrollmentEnvelope('idem-guest-other-first'));
    expect(first.status).toBe('success');

    const otherParticipantId = ParticipantIdSchema.parse(
      'participant_guest_transport_emulator_02'
    );
    const otherEnrollmentId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_other'
    );
    const second = await commands.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'idem-guest-other-second',
        participantId: otherParticipantId,
        enrollmentId: otherEnrollmentId,
        correlationId: CorrelationIdSchema.parse('correlation_guest_transport_emulator_other'),
      })
    );
    expect(second.status).toBe('success');

    const state = await durableGuestCounts();
    expect(state.enrollments).toBe(2);
    expect(state.payments).toBe(2);
    expect(state.availableSeats).toBe(6);
  });

  it('allows the same guest to enroll a different course', async () => {
    const secondCourseId = await seedSecondCourse();
    const commands = createCommands();
    const first = await commands.execute(guestEnrollmentEnvelope('idem-guest-course-x'));
    expect(first.status).toBe('success');

    const secondEnrollmentId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_course_y'
    );
    const second = await commands.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'idem-guest-course-y',
        participantId,
        enrollmentId: secondEnrollmentId,
        courseId: secondCourseId,
        correlationId: CorrelationIdSchema.parse('correlation_guest_transport_emulator_y'),
      })
    );
    if (second.status === 'error') {
      throw new Error(`course Y enroll failed: ${second.error.code} ${JSON.stringify(second.error.details)}`);
    }

    const firstCourse = await durableGuestCounts(courseId);
    const secondCourse = await durableGuestCounts(secondCourseId);
    expect(firstCourse.enrollments).toBe(2);
    expect(firstCourse.availableSeats).toBe(7);
    expect(secondCourse.availableSeats).toBe(7);
  });

  it('allows the same guest to re-enroll after reservation expiry', async () => {
    const createAt = createCommands('2026-01-01T00:00:00.000Z');
    const created = await createAt.execute(guestEnrollmentEnvelope('idem-guest-expire-create'));
    expect(created.status).toBe('success');

    const expireAt = createCommands('2026-01-02T01:00:00.000Z');
    const expired = await expireAt.execute(
      expireGuestEnrollmentEnvelope({
        enrollmentId,
        idempotencyKey: 'idem-guest-expire',
        expectedRevision: 1,
      })
    );
    expect(expired.status).toBe('success');

    const afterExpiry = await durableGuestCounts();
    expect(afterExpiry.availableSeats).toBe(8);
    expect(afterExpiry.enrollmentGuards).toBe(0);

    const reenrollId = CourseEnrollmentIdSchema.parse(
      'enrollment_guest_transport_emulator_reenter'
    );
    const reenroll = await createAt.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'idem-guest-expire-reenter',
        participantId,
        enrollmentId: reenrollId,
        correlationId: CorrelationIdSchema.parse('correlation_guest_transport_emulator_reenter'),
      })
    );
    expect(reenroll.status).toBe('success');
    const afterReenroll = await durableGuestCounts();
    expect(afterReenroll.enrollments).toBe(2);
    expect(afterReenroll.availableSeats).toBe(7);
    expect(afterReenroll.enrollmentGuards).toBe(1);
  });
});
