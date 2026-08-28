import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  deriveGuestSubjectIdFromCourseEnrollmentIntent,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { deriveGuestSubjectIdForIntent } from '../commands/guestCallableTransportAdapter';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { queryCourseEnrollmentReadModels } from '../readModels/courseEnrollmentReadModels';
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
  return {
    kind: 'create_course_enrollments',
    context: {
      actor: guestCommandActor(guestSubjectId),
      exercisedCapability: 'guest',
      idempotencyKey,
      correlationId,
      source: 'guest_callable',
      transportMetadata: {
        participant_display_name: 'Guest Transport Student',
        participant_skill_level: 'beginner',
        participant_discipline: 'ski',
        participant_age_years: '25',
      },
    },
    intent: {
      courseId,
      participantIds: [participantId],
      enrollmentIds: [enrollmentId],
    },
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
    const derivedSubject = deriveGuestSubjectIdForIntent(
      {
        courseId,
        participantIds: [participantId],
        enrollmentIds: [enrollmentId],
      },
      'idem-guest-transport-01'
    );
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
});
