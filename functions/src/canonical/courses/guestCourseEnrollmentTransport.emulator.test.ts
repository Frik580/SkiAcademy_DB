import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_DEFAULT,
  AggregateRevisionSchema,
  AccountIdSchema,
  canonicalPaths,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  GUEST_ACTION_TOKEN_VERSION,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  InstructorIdSchema,
  InstructorRelationshipSchema,
  ParticipantIdSchema,
  parseCommandResultPayload,
  SystemActorIdSchema,
  deriveGuestSubjectIdFromCourseEnrollmentIntent,
  guestCommandActor,
  guestSubjectIdFromCourseEnrollmentId,
  systemCommandActor,
  signGuestCourseEnrollmentActionCredential,
  timestampFromDate,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type CourseId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  GUEST_RESERVATION_ACTIVE_LIMITS,
  type GuestReservationAdmissionPolicy,
} from '../commands/guestReservationAdmission';
import {
  buildGuestCommandEnvelopeFromCallable,
  deriveGuestSubjectIdForIntent,
  parseCallableGuestCommandTransportInput,
} from '../commands/guestCallableTransportAdapter';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { queryCourseEnrollmentReadModels } from '../readModels/courseEnrollmentReadModels';
import { queryCourseCatalogReadModels } from '../readModels/courseCatalogReadModels';
import { parseCourse } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { parsePayment } from '../finance/financeStore';
import { parseGuestContact, guestContactPath } from '../guestContact/guestContactStore';
import { queryAdminCourseEnrollmentReadModels } from '../readModels/adminCourseEnrollmentReadModels';

const PROJECT_ID = 'ski-academy-guest-course-transport-emulator-test';
const guestActionTokenSecret = 'guest-course-transport-emulator-secret';
const correlationId = CorrelationIdSchema.parse('correlation_guest_transport_emulator_01');
const courseId = CourseIdSchema.parse('course_guest_transport_emulator_01');
const courseDayId = CourseDayIdSchema.parse('course_day_guest_transport_emulator_01');
const participantId = ParticipantIdSchema.parse('participant_guest_transport_emulator_01');
const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_guest_transport_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_transport_emulator_01');
const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
const adminActor = {
  accountId: AccountIdSchema.parse('account_guest_transport_admin'),
  role: 'admin' as const,
};
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

function createCommands(
  at = '2026-01-01T00:00:00.000Z',
  guestReservationAdmission?: GuestReservationAdmissionPolicy
) {
  return createProductionCanonicalCommands(
    environment(at),
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret, guestReservationAdmission }
  );
}

function guestEnrollmentEnvelope(
  idempotencyKey: string
): CommandEnvelope<'create_course_enrollments'> {
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
      'instructor_relationships',
      'guest_contacts',
      'payments',
      'monetary_events',
      'resource_claims',
      'resource_claim_guards',
      'active_course_enrollment_guards',
      'command_idempotency',
      'guest_reservation_admission',
      'admin_runtime',
    ];
    for (const collection of collections) {
      const snapshot = await firestore.collection(collection).get();
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await seedCourse();
  });

  it('synchronizes a reused browser guest profile across courses and both read models', async () => {
    const commands = createCommands();
    const firstEnvelope = guestEnrollmentEnvelope('idem-browser-profile-first');
    const first = await commands.execute({
      ...firstEnvelope,
      context: {
        ...firstEnvelope.context,
        transportMetadata: {
          ...firstEnvelope.context.transportMetadata,
          participant_display_name: 'Petr',
          participant_age_years: '30',
        },
      },
    });
    expect(first.status).toBe('success');
    const participantRef = firestore.doc(`participants/${participantId}`);
    await participantRef.update({
      avatarUrl: 'https://example.com/guest-avatar.png',
      instructorComment: 'Keep the existing instructor comment',
    });
    const before = (await participantRef.get()).data()!;
    expect(parseParticipant(before)).toMatchObject({
      participantId,
      displayName: 'Petr',
      age: { kind: 'age_years', years: 30 },
      discipline: 'ski',
      skillLevel: 'beginner',
      management: { kind: 'unmanaged_guest' },
    });
    const secondCourseId = await seedSecondCourse();
    const secondEnrollmentId = CourseEnrollmentIdSchema.parse('enrollment_browser_profile_second');
    const secondEnvelope = guestEnrollmentAttemptEnvelope({
      idempotencyKey: 'idem-browser-profile-second',
      participantId,
      enrollmentId: secondEnrollmentId,
      courseId: secondCourseId,
    });
    const updatedEnvelope = {
      ...secondEnvelope,
      context: {
        ...secondEnvelope.context,
        transportMetadata: {
          ...secondEnvelope.context.transportMetadata,
          participant_display_name: 'Ars',
          participant_age_years: '43',
          participant_skill_level: 'intermediate',
        },
      },
    };
    const peopleRef = firestore.doc(canonicalPaths.adminPeopleRevision().replace(/^\//, ''));
    const peopleBefore = (await peopleRef.get()).data()!.revision;
    const second = await createCommands('2026-01-02T00:00:00.000Z').execute(updatedEnvelope);
    expect(second.status).toBe('success');
    const after = (await participantRef.get()).data()!;
    expect(parseParticipant(after)).toMatchObject({
      participantId,
      displayName: 'Ars',
      age: { kind: 'age_years', years: 43 },
      discipline: 'ski',
      skillLevel: 'intermediate',
      management: { kind: 'unmanaged_guest' },
      revision: before.revision + 1,
    });
    expect(after).toEqual({
      ...before,
      displayName: 'Ars',
      age: { kind: 'age_years', years: 43 },
      skillLevel: 'intermediate',
      revision: before.revision + 1,
      updatedAt: timestampFromDate(new Date('2026-01-02T00:00:00.000Z')),
      audit: {
        ...before.audit,
        lastChangedByCommandId: expect.any(String),
        correlationId,
      },
    });
    expect(after.audit.lastChangedByCommandId).not.toBe(before.audit.lastChangedByCommandId);
    expect(second.payload?.adminPeopleRevision).toBe(peopleBefore + 1);
    expect((await peopleRef.get()).data()?.revision).toBe(peopleBefore + 1);

    const queryGuest = async (created: typeof first, id: CourseEnrollmentId) => {
      const credential = created.payload!.guestLinkCredentials![0]!;
      return queryCourseEnrollmentReadModels(
        firestore,
        {
          scope: 'guest_single',
          enrollmentId: id,
          guestActionNonce: credential.nonce,
          guestActionSignature: credential.signature,
        },
        { guestActionSecret: guestActionTokenSecret, now: new Date('2026-01-02T00:00:00.000Z') }
      );
    };
    expect((await queryGuest(second, secondEnrollmentId)).items).toEqual([
      expect.objectContaining({
        enrollmentId: secondEnrollmentId,
        participant: expect.objectContaining({ participantId, displayName: 'Ars' }),
      }),
    ]);
    expect((await queryGuest(first, enrollmentId)).items[0]).toMatchObject({
      participant: { participantId, displayName: 'Ars' },
    });
    const admin = await queryAdminCourseEnrollmentReadModels(firestore, adminActor, {
      scope: 'admin_pending_guest',
    });
    if (admin.scope === 'admin_enrollment_detail') throw new Error('Unexpected detail');
    expect(admin.items).toHaveLength(2);
    for (const id of [enrollmentId, secondEnrollmentId]) {
      expect(admin.items.find((item) => item.enrollmentId === id)).toMatchObject({
        participant: { participantId, displayName: 'Ars' },
      });
    }
    expect(await commands.execute(updatedEnvelope)).toEqual(second);
    expect((await participantRef.get()).data()).toEqual(after);
    expect((await peopleRef.get()).data()?.revision).toBe(peopleBefore + 1);
  });

  it('leaves an unchanged guest profile and people revision untouched on a new enrollment', async () => {
    const commands = createCommands();
    expect(
      (await commands.execute(guestEnrollmentEnvelope('idem-same-profile-first'))).status
    ).toBe('success');
    const participantRef = firestore.doc(`participants/${participantId}`);
    const before = (await participantRef.get()).data();
    const peopleRef = firestore.doc(canonicalPaths.adminPeopleRevision().replace(/^\//, ''));
    const peopleBefore = (await peopleRef.get()).data();
    const secondCourseId = await seedSecondCourse();
    const second = await createCommands('2026-01-02T00:00:00.000Z').execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'idem-same-profile-second',
        participantId,
        enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_same_profile_second'),
        courseId: secondCourseId,
      })
    );
    expect(second.status).toBe('success');
    expect(second.payload).not.toHaveProperty('adminPeopleRevision');
    expect((await participantRef.get()).data()).toEqual(before);
    expect((await peopleRef.get()).data()).toEqual(peopleBefore);
  });

  it.each([
    'managed',
    'archived',
    'malformed',
    'mismatched-id',
    'unsupported-type',
    'instructor-linked',
  ])(
    'rejects a guest profile update of an existing %s participant without changing it',
    async (invalid) => {
      expect(
        (await createCommands().execute(guestEnrollmentEnvelope(`idem-protected-seed-${invalid}`)))
          .status
      ).toBe('success');
      const participantRef = firestore.doc(`participants/${participantId}`);
      if (invalid === 'instructor-linked') {
        await firestore.doc('instructor_relationships/relationship_protected_guest').set(
          InstructorRelationshipSchema.parse({
            instructorRelationshipId: 'relationship_protected_guest',
            participantId,
            instructorId,
            basis: { kind: 'administration_assignment', assignedByAccountId: adminActor.accountId },
            status: 'active',
            validFrom: decidedAt,
            expiresAt: dayOneEnd,
            revision: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit: {
              createdByCommandId: 'command_seed',
              lastChangedByCommandId: 'command_seed',
              correlationId,
            },
          })
        );
      }
      const patch =
        invalid === 'managed'
          ? {
              management: {
                kind: 'managed',
                participantManagementId: 'management_protected_guest',
              },
            }
          : invalid === 'archived'
            ? { lifecycle: { status: 'archived', archivedAt: decidedAt } }
            : invalid === 'malformed'
              ? { age: { kind: 'age_years', years: -1 } }
              : invalid === 'mismatched-id'
                ? { participantId: 'participant_another_guest' }
                : invalid === 'unsupported-type'
                  ? { management: { kind: 'instructor' } }
                  : {};
      if (Object.keys(patch).length > 0) await participantRef.update(patch);
      const before = (await participantRef.get()).data();
      const countsBefore = await durableGuestCounts();
      const peopleRef = firestore.doc(canonicalPaths.adminPeopleRevision().replace(/^\//, ''));
      const peopleBefore = (await peopleRef.get()).data();
      const secondCourseId = await seedSecondCourse();
      const secondEnvelope = guestEnrollmentAttemptEnvelope({
        idempotencyKey: `idem-protected-update-${invalid}`,
        participantId,
        enrollmentId: CourseEnrollmentIdSchema.parse(`enrollment_protected_${invalid}`),
        courseId: secondCourseId,
      });
      const rejected = await createCommands().execute({
        ...secondEnvelope,
        context: {
          ...secondEnvelope.context,
          transportMetadata: {
            ...secondEnvelope.context.transportMetadata,
            participant_display_name: 'Ars',
          },
        },
      });
      expect(rejected).toMatchObject({
        status: 'error',
        error: {
          code:
            invalid === 'managed' || invalid === 'instructor-linked'
              ? 'forbidden'
              : invalid === 'mismatched-id'
                ? 'validation'
                : 'invalid_transition',
        },
      });
      expect((await participantRef.get()).data()).toEqual(before);
      expect((await peopleRef.get()).data()).toEqual(peopleBefore);
      expect(await durableGuestCounts()).toEqual(countsBefore);
    }
  );

  it('projects a newly created pending guest to admin exactly once and bumps the realtime revision', async () => {
    const queryPending = () =>
      queryAdminCourseEnrollmentReadModels(firestore, adminActor, { scope: 'admin_pending_guest' });
    expect(await queryPending()).toMatchObject({ items: [], hasMore: false });
    const revisionRef = firestore.doc(canonicalPaths.adminCoursesRevision().replace(/^\//, ''));
    const beforeRevision = (await revisionRef.get()).data()?.revision ?? 0;
    const commands = createCommands();
    const envelope = guestEnrollmentEnvelope('idem-guest-admin-visible');
    const created = await commands.execute(envelope);
    expect(created.status).toBe('success');
    expect(parseCommandResultPayload('create_course_enrollments', created.payload).success).toBe(
      true
    );
    expect(created.payload?.adminCoursesRevision).toBe(beforeRevision + 1);
    expect((await revisionRef.get()).data()?.revision).toBe(beforeRevision + 1);

    const enrollment = parseCourseEnrollment(
      (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data()
    );
    expect(enrollment).toMatchObject({
      attribution: { bookingOrigin: 'guest' },
      lifecycle: { status: 'pending' },
    });
    expect(
      parseParticipant((await firestore.doc(`participants/${participantId}`).get()).data())
    ).toMatchObject({
      management: { kind: 'unmanaged_guest' },
      lifecycle: { status: 'active' },
    });
    const pending = await queryPending();
    expect(pending.scope).toBe('admin_pending_guest');
    if (pending.scope === 'admin_enrollment_detail') throw new Error('Unexpected detail');
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      enrollmentId,
      course: { courseId, title: 'Guest Transport Course' },
      participant: { participantId, displayName: 'Guest Transport Student' },
      guestState: 'pending_unlinked',
      lifecycleStatus: 'pending',
      payment: { paymentId: enrollment!.paymentId, outstanding: 50_000 },
      guestContact: { phone: '+7 701 123 45 67', email: 'course@example.com' },
    });
    expect(await commands.execute(envelope)).toEqual(created);
    expect((await revisionRef.get()).data()?.revision).toBe(beforeRevision + 1);
    expect(await queryPending()).toMatchObject({ items: [pending.items[0]] });

    // Keep the full canonical document shape while changing only the query discriminators.
    const accountEnrollmentId = CourseEnrollmentIdSchema.parse('enrollment_account_admin_filter');
    await firestore.doc(`course_enrollments/${accountEnrollmentId}`).set({
      ...(await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data(),
      enrollmentId: accountEnrollmentId,
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: adminActor.accountId },
      },
    });
    expect(await queryPending()).toMatchObject({ items: [pending.items[0]] });
    await firestore.doc(`course_enrollments/${enrollmentId}`).update({
      lifecycle: { status: 'confirmed', confirmedAt: decidedAt },
    });
    expect(await queryPending()).toMatchObject({ items: [] });
  });

  it('traces a successful guest create through canonical documents and both read models', async () => {
    const transport = parseCallableGuestCommandTransportInput({
      data: {
        kind: 'create_course_enrollments',
        intent: { courseId, participantIds: [participantId], enrollmentIds: [enrollmentId] },
        idempotencyKey: 'idem-guest-visibility-diagnostic',
        correlationId,
        guestParticipantDisplayName: 'LLL',
        guestParticipantAgeYears: 30,
        guestParticipantDiscipline: 'ski',
        guestParticipantSkillLevel: 'beginner',
        guestPhone: '+555',
      },
    } as never);
    const created = await createCommands().execute(
      buildGuestCommandEnvelopeFromCallable(
        deriveGuestSubjectIdForIntent(transport.intent)!,
        transport
      )
    );
    expect(created).toMatchObject({ status: 'success', payload: { outcome: 'created' } });
    const payload = parseCommandResultPayload('create_course_enrollments', created.payload);
    expect(payload.success, 'create response canonical parse').toBe(true);
    const credential = created.payload!.guestLinkCredentials![0]!;
    const rawEnrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const enrollment = parseCourseEnrollment(rawEnrollment);
    expect(enrollment, 'persisted enrollment canonical parse').toMatchObject({
      enrollmentId,
      courseId,
      participantId,
      revision: 1,
      attribution: { bookingOrigin: 'guest' },
      lifecycle: { status: 'pending' },
    });
    expect(rawEnrollment?.updatedAt).toEqual(decidedAt);
    expect(
      parseParticipant((await firestore.doc(`participants/${participantId}`).get()).data()),
      'persisted participant canonical parse'
    ).toMatchObject({ participantId, displayName: 'LLL' });
    expect(
      parsePayment((await firestore.doc(`payments/${enrollment!.paymentId}`).get()).data()),
      'persisted payment canonical parse'
    ).toMatchObject({ subjectId: enrollmentId, currency: 'KZT' });
    expect(
      parseGuestContact(
        (
          await firestore.doc(guestContactPath({ kind: 'course_enrollment', enrollmentId })).get()
        ).data()
      ),
      'persisted contact canonical parse'
    ).toMatchObject({ phone: '+555' });
    expect(
      parseCourse((await firestore.doc(`courses/${courseId}`).get()).data()),
      'persisted course canonical parse'
    ).toBeDefined();
    expect(credential.guestSubjectId).toBe(guestSubjectIdFromCourseEnrollmentId(enrollmentId));
    const guest = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential.nonce,
        guestActionSignature: credential.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: new Date('2026-01-01T00:00:00.000Z') }
    );
    expect(guest.items, 'guest_single after successful create').toHaveLength(1);
    expect(guest.items[0]).toMatchObject({ enrollmentId, lifecycle: { status: 'pending' } });
    const matched = await firestore
      .collection('course_enrollments')
      .where('attribution.bookingOrigin', '==', 'guest')
      .where('lifecycle.status', '==', 'pending')
      .orderBy('updatedAt.seconds', 'desc')
      .orderBy('updatedAt.nanoseconds', 'desc')
      .orderBy('enrollmentId', 'asc')
      .limit(ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_DEFAULT + 1)
      .get();
    expect(
      matched.docs.map((doc) => doc.id),
      'admin query before builder'
    ).toContain(enrollmentId);
    const admin = await queryAdminCourseEnrollmentReadModels(firestore, adminActor, {
      scope: 'admin_pending_guest',
    });
    expect(admin).toMatchObject({
      items: [expect.objectContaining({ enrollmentId, lifecycleStatus: 'pending' })],
    });
  });

  it('cancels through parsed guest callable transport, refreshes guest/admin reads, and replays without another mutation', async () => {
    const commands = createCommands();
    const created = await commands.execute(guestEnrollmentEnvelope('idem-guest-cancel-create'));
    expect(created.status).toBe('success');
    const credential = created.payload!.guestLinkCredentials![0]!;
    expect(credential.cancellationCredential).toBeDefined();
    const transport = parseCallableGuestCommandTransportInput({
      data: {
        kind: 'request_course_enrollment_cancellation',
        intent: { courseEnrollmentId: enrollmentId },
        idempotencyKey: `request-course-enrollment-cancellation:${enrollmentId}:1`,
        correlationId,
        expectedRevision: 1,
        guestActionNonce: credential.cancellationCredential!.nonce,
        guestActionSignature: credential.cancellationCredential!.signature,
      },
    } as never);
    const subject = deriveGuestSubjectIdForIntent(transport.intent);
    expect(subject).toBe(guestSubjectId);
    const envelope = buildGuestCommandEnvelopeFromCallable(subject!, transport);
    const cancelled = await commands.execute(envelope);
    expect(cancelled.status).toBe('success');
    expect(cancelled.payload).toMatchObject({
      adminCoursesRevision: (created.payload!.adminCoursesRevision ?? 0) + 1,
    });
    expect(
      parseCourseEnrollment(
        (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data()
      )
    ).toMatchObject({
      revision: 2,
      lifecycle: { status: 'cancelled', reasonCode: 'guest_cancelled' },
    });
    expect(await commands.execute(envelope)).toEqual(cancelled);
    const read = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential.nonce,
        guestActionSignature: credential.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: new Date('2026-01-01T00:00:00.000Z') }
    );
    expect(read.items[0]?.lifecycle.status).toBe('cancelled');
    expect(
      await queryAdminCourseEnrollmentReadModels(firestore, adminActor, {
        scope: 'admin_pending_guest',
      })
    ).toMatchObject({ items: [] });
    const history = await queryAdminCourseEnrollmentReadModels(firestore, adminActor, {
      scope: 'admin_history',
    });
    expect(history).toMatchObject({
      items: [expect.objectContaining({ enrollmentId, lifecycleStatus: 'cancelled' })],
    });
  });

  it.each([
    'other-enrollment',
    'tampered-signature',
    'link-purpose',
    'expired',
    'stale-revision',
  ] as const)('rejects guest cancellation with %s without changing lifecycle', async (invalid) => {
    const commands = createCommands();
    const created = await commands.execute(
      guestEnrollmentEnvelope(`idem-guest-negative-create-${invalid}`)
    );
    const credential = created.payload!.guestLinkCredentials![0]!;
    let targetId = enrollmentId;
    if (invalid === 'other-enrollment') {
      targetId = CourseEnrollmentIdSchema.parse('enrollment_guest_cancel_other');
      expect(
        (
          await commands.execute(
            guestEnrollmentAttemptEnvelope({
              enrollmentId: targetId,
              participantId: ParticipantIdSchema.parse('participant_guest_cancel_other'),
              idempotencyKey: 'idem-guest-negative-other-create',
            })
          )
        ).status
      ).toBe('success');
    }
    const action = invalid === 'link-purpose' ? credential : credential.cancellationCredential!;
    const transport = parseCallableGuestCommandTransportInput({
      data: {
        kind: 'request_course_enrollment_cancellation',
        intent: { courseEnrollmentId: targetId },
        correlationId,
        idempotencyKey: `guest-negative-cancel-${invalid}`,
        expectedRevision: invalid === 'stale-revision' ? 2 : 1,
        guestActionNonce: action.nonce,
        guestActionSignature: invalid === 'tampered-signature' ? 'a'.repeat(64) : action.signature,
      },
    } as never);
    const subject = deriveGuestSubjectIdForIntent(transport.intent);
    expect(subject).toBe(guestSubjectIdFromCourseEnrollmentId(targetId));
    const result = await (
      invalid === 'expired' ? createCommands('2026-01-02T01:00:00.000Z') : commands
    ).execute(buildGuestCommandEnvelopeFromCallable(subject!, transport));
    expect(result.status).toBe('error');
    expect(
      parseCourseEnrollment((await firestore.doc(`course_enrollments/${targetId}`).get()).data())
    ).toMatchObject({
      revision: 1,
      lifecycle: { status: 'pending' },
    });
  });

  it('admits two active course holds per network source and rejects the third', async () => {
    const commands = createCommands('2026-01-01T00:00:00.000Z', {
      actorKey: 'actor_production_limit',
      ...GUEST_RESERVATION_ACTIVE_LIMITS,
    });
    for (const index of [0, 1]) {
      const result = await commands.execute(
        guestEnrollmentAttemptEnvelope({
          idempotencyKey: `guest-course-production-limit-${index}`,
          participantId: ParticipantIdSchema.parse(`participant_guest_course_production_${index}`),
          enrollmentId: CourseEnrollmentIdSchema.parse(
            `enrollment_guest_course_production_${index}`
          ),
        })
      );
      expect(result.status).toBe('success');
    }
    const excess = await commands.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'guest-course-production-limit-2',
        participantId: ParticipantIdSchema.parse('participant_guest_course_production_2'),
        enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_production_2'),
      })
    );
    expect(excess.status === 'error' && excess.error.code).toBe('guest_reservation_limit');
    expect((await firestore.collection('course_enrollments').get()).size).toBe(2);
  }, 30_000);

  it('limits active course holds while preserving replay and terminal release', async () => {
    const policy = { actorKey: 'actor_a', maxActiveLesson: 1, maxActiveCourse: 1 };
    const commands = createCommands('2026-01-01T00:00:00.000Z', policy);
    const firstEnvelope = guestEnrollmentAttemptEnvelope({
      idempotencyKey: 'guest-course-limit-1',
      participantId: ParticipantIdSchema.parse('participant_guest_course_limit_1'),
      enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_limit_1'),
    });
    const first = await commands.execute(firstEnvelope);
    expect(first.status).toBe('success');
    expect(await commands.execute(firstEnvelope)).toEqual(first);

    const secondEnvelope = guestEnrollmentAttemptEnvelope({
      idempotencyKey: 'guest-course-limit-2',
      participantId: ParticipantIdSchema.parse('participant_guest_course_limit_2'),
      enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_limit_2'),
    });
    const excess = await commands.execute(secondEnvelope);
    expect(excess.status === 'error' && excess.error.code).toBe('guest_reservation_limit');
    expect((await firestore.collection('course_enrollments').get()).size).toBe(1);

    expect(
      (
        await createCommands('2026-01-01T00:00:00.000Z', {
          ...policy,
          actorKey: 'actor_b',
        }).execute(secondEnvelope)
      ).status
    ).toBe('success');

    await firestore.doc('course_enrollments/enrollment_guest_course_limit_1').update({
      lifecycle: { status: 'cancelled', cancelledAt: decidedAt, reasonCode: 'guest_cancelled' },
    });
    const third = await commands.execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'guest-course-limit-3',
        participantId: ParticipantIdSchema.parse('participant_guest_course_limit_3'),
        enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_limit_3'),
      })
    );
    expect(third.status).toBe('success');
    const guard = await firestore.doc('guest_reservation_admission/course_actor_a').get();
    expect(guard.data()?.reservationPaths).toEqual([
      'course_enrollments/enrollment_guest_course_limit_3',
    ]);

    const afterExpiry = await createCommands('2026-01-02T01:00:00.000Z', policy).execute(
      guestEnrollmentAttemptEnvelope({
        idempotencyKey: 'guest-course-limit-4',
        participantId: ParticipantIdSchema.parse('participant_guest_course_limit_4'),
        enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_limit_4'),
      })
    );
    expect(afterExpiry.status).toBe('success');
  }, 30_000);

  it('serializes simultaneous course admissions at the quota boundary', async () => {
    const commands = createCommands('2026-01-01T00:00:00.000Z', {
      actorKey: 'actor_race',
      maxActiveLesson: 1,
      maxActiveCourse: 1,
    });
    const attempts = await Promise.all([
      commands.execute(
        guestEnrollmentAttemptEnvelope({
          idempotencyKey: 'guest-course-limit-race-1',
          participantId: ParticipantIdSchema.parse('participant_guest_course_race_1'),
          enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_race_1'),
        })
      ),
      commands.execute(
        guestEnrollmentAttemptEnvelope({
          idempotencyKey: 'guest-course-limit-race-2',
          participantId: ParticipantIdSchema.parse('participant_guest_course_race_2'),
          enrollmentId: CourseEnrollmentIdSchema.parse('enrollment_guest_course_race_2'),
        })
      ),
    ]);
    expect(attempts.filter((result) => result.status === 'success')).toHaveLength(1);
    expect((await firestore.collection('course_enrollments').get()).size).toBe(1);
  }, 30_000);

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
    const credential =
      result.status === 'success' ? result.payload?.guestLinkCredentials?.[0] : undefined;
    expect(credential?.enrollmentId).toBe(enrollmentId);
    expect(credential?.guestSubjectId).toBe(guestSubjectId);

    const participantSnap = await firestore.doc(`participants/${participantId}`).get();
    const participant = participantSnap.data();
    expect(participantSnap.exists).toBe(true);
    expect(participant?.management?.kind).toBe('unmanaged_guest');
    expect(
      (await firestore.doc(`guest_contacts/course_enrollment_${enrollmentId}`).get()).data()
    ).toMatchObject({ phone: '+7 701 123 45 67', email: 'course@example.com' });

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
    expect(read.items[0]?.guestPaymentSummary).toMatchObject({
      currency: 'KZT',
      paymentSatisfied: false,
      unpaidCancellationEligible: true,
    });
    const payment = (await firestore.doc(`payments/${enrollment!.paymentId}`).get()).data();
    expect(read.items[0]?.guestPaymentSummary?.price).toBe(payment?.price);
    expect(read.items[0]?.lifecycle.reservationExpiresAt).toEqual(
      enrollment?.lifecycle.reservationExpiresAt
    );

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

  it('rejects guest course status credential when guest action secret is unavailable', async () => {
    const commands = createCommands();
    const result = await commands.execute(
      guestEnrollmentEnvelope('idem-guest-course-missing-secret')
    );
    expect(result.status).toBe('success');
    const credential =
      result.status === 'success' ? result.payload?.guestLinkCredentials?.[0] : undefined;
    expect(credential).toBeDefined();

    const courseSnap = await firestore.doc(`courses/${courseId}`).get();
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    expect(course).toBeDefined();
    const expiresAt = course!.scheduleProjection.finalCourseDayEndsAt;
    const emptyKeySignature = signGuestCourseEnrollmentActionCredential('', {
      version: GUEST_ACTION_TOKEN_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce: credential!.nonce,
    });

    const emptyKeyReadInput = {
      scope: 'guest_single' as const,
      enrollmentId,
      guestActionNonce: credential!.nonce,
      guestActionSignature: emptyKeySignature,
    };
    for (const guestActionSecret of [undefined, '', '   ']) {
      const read = await queryCourseEnrollmentReadModels(firestore, emptyKeyReadInput, {
        guestActionSecret,
        now: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(read.items).toHaveLength(0);
    }
    const oldCredentialRead = await queryCourseEnrollmentReadModels(
      firestore,
      { ...emptyKeyReadInput, guestActionSignature: credential!.signature },
      { guestActionSecret: undefined, now: new Date('2026-01-01T00:00:00.000Z') }
    );
    expect(oldCredentialRead.items).toHaveLength(0);
  }, 30_000);

  it('cancels an unpaid guest hold with one canonical write-off and one seat release', async () => {
    const commands = createCommands();
    const created = await commands.execute(guestEnrollmentEnvelope('idem-guest-course-cancel-01'));
    expect(created.status).toBe('success');
    const cancellationCredential =
      created.status === 'success'
        ? created.payload?.guestLinkCredentials?.[0]?.cancellationCredential
        : undefined;
    expect(cancellationCredential).toBeDefined();

    const cancelEnvelope: CommandEnvelope<'request_course_enrollment_cancellation'> = {
      kind: 'request_course_enrollment_cancellation',
      context: {
        actor: guestCommandActor(guestSubjectId),
        exercisedCapability: 'guest',
        idempotencyKey: 'idem-guest-course-cancel-02',
        correlationId,
        source: 'guest_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
        transportMetadata: {
          [GUEST_ACTION_NONCE_TRANSPORT_KEY]: cancellationCredential!.nonce,
          [GUEST_ACTION_SIGNATURE_TRANSPORT_KEY]: cancellationCredential!.signature,
        },
      },
      intent: { courseEnrollmentId: enrollmentId },
    };
    expect((await commands.execute(cancelEnvelope)).status).toBe('success');
    expect((await commands.execute(cancelEnvelope)).status).toBe('success');

    const enrollment = (await firestore.doc(`course_enrollments/${enrollmentId}`).get()).data();
    const payment = (await firestore.doc(`payments/${enrollment?.paymentId}`).get()).data();
    expect(enrollment?.lifecycle).toMatchObject({
      status: 'cancelled',
      reasonCode: 'guest_cancelled',
    });
    expect(payment).toMatchObject({
      paidAmount: 0,
      refundedAmount: 0,
      writtenOffAmount: 50_000,
      outstandingAmount: 0,
      revision: 2,
    });
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
    expect((await firestore.doc(`courses/${courseId}`).get()).data()?.capacity.availableSeats).toBe(
      8
    );
  }, 30_000);

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
      (attempt) =>
        attempt.status === 'error' && attempt.error.code === 'duplicate_active_enrollment'
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

    const otherParticipantId = ParticipantIdSchema.parse('participant_guest_transport_emulator_02');
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
      throw new Error(
        `course Y enroll failed: ${second.error.code} ${JSON.stringify(second.error.details)}`
      );
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

    const credential = created.payload?.guestLinkCredentials?.[0];
    expect(credential).toBeDefined();
    const expiredRead = await queryCourseEnrollmentReadModels(
      firestore,
      {
        scope: 'guest_single',
        enrollmentId,
        guestActionNonce: credential!.nonce,
        guestActionSignature: credential!.signature,
      },
      { guestActionSecret: guestActionTokenSecret, now: new Date('2026-01-02T01:05:00.000Z') }
    );
    expect(expiredRead.items[0]?.lifecycle).toMatchObject({
      status: 'cancelled',
      reasonCode: 'reservation_expired',
    });
    expect(expiredRead.items[0]?.guestPaymentSummary?.paymentSatisfied).toBe(false);

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
