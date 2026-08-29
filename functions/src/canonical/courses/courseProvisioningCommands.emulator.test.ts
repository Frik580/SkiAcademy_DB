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
  InstructorIdSchema,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  activityLogIdFromCommandId,
  accountCommandActor,
  compareCanonicalTimestamps,
  courseEnrollmentIdFromCommandParticipant,
  courseScheduleIsComplete,
  isCourseOperationalForEnrollment,
  legacyCourseDocumentFailsCanonicalParse,
  parseCommandResultPayload,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  resolveManifestDayInterval,
  resolveProvisionedAvailableSeats,
  timestampFromDate,
  verifyProvisionedCourseSchedule,
  CourseProvisioningManifestSchema,
  type CommandEnvelope,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import {
  parseCourse,
  parseCourseDays,
  courseDaysCollectionPath,
} from './courseStore';
import {
  parseCourseCatalogContent,
  courseCatalogContentPath,
} from './courseCatalogContentStore';
import { queryCourseCatalogReadModels } from '../readModels/courseCatalogReadModels';
import { queryCourseEnrollmentReadModels } from '../readModels/courseEnrollmentReadModels';

const PROJECT_ID = 'ski-academy-course-provision-emulator-test';
const correlationId = CorrelationIdSchema.parse('correlation_course_provision_emulator_01');
const adminAccountId = AccountIdSchema.parse('account_course_provision_emulator_admin');
const accountId = AccountIdSchema.parse('account_course_provision_emulator_owner');
const participantId = ParticipantIdSchema.parse('participant_course_provision_emulator');
const participantIdB = ParticipantIdSchema.parse('participant_course_provision_emulator_b');
const managementId = ParticipantManagementIdSchema.parse('management_course_provision_emulator');
const managementIdB = ParticipantManagementIdSchema.parse('management_course_provision_emulator_b');
const instructorId = InstructorIdSchema.parse('instructor_course_provision_emulator');
const instructorTwoId = InstructorIdSchema.parse('instructor_course_provision_emulator_02');
const courseId = CourseIdSchema.parse('course_course_provision_emulator');
const legacyOnlyCourseId = CourseIdSchema.parse('course_course_provision_legacy_only');
const courseDayId = CourseDayIdSchema.parse('course_day_provision_emulator_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_provision_emulator_02');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const catalogNow = new Date('2026-01-15T00:00:00.000Z');

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const manifest = CourseProvisioningManifestSchema.parse({
  courseId,
  title: 'Provision Emulator Course',
  price: KztMinorUnitsSchema.parse(50_000),
  totalSeats: 8,
  capacityPolicy: { kind: 'seed_full' },
  instructorRosterIds: [instructorId],
  timeZone: 'Asia/Almaty',
  days: [
    {
      courseDayId,
      dayOrder: 1,
      localDate: '2026-02-01',
      localTime: '09:00',
      durationMinutes: 120,
      instructorId,
    },
  ],
  presentation: {
    duration: '1 day',
    description: 'Provision emulator description',
    dates: '1 February 2026, 09:00–11:00',
    bgImageUrl: 'https://example.com/provision-emulator.webp',
  },
});

let app: App;
let firestore: Firestore;

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createCommands(at = '2026-01-01T00:00:00.000Z') {
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  return createProductionCanonicalCommands(environment(at), executor);
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

function applyEnvelope(
  idempotencyKey: string,
  manifestInput: CourseProvisioningManifest = manifest
): CommandEnvelope<'apply_canonical_course_provisioning_manifest'> {
  return {
    kind: 'apply_canonical_course_provisioning_manifest',
    context: adminContext(idempotencyKey),
    intent: { manifest: manifestInput, dryRun: false },
  };
}

function twoDayManifest(): CourseProvisioningManifest {
  return CourseProvisioningManifestSchema.parse({
    ...manifest,
    days: [
      manifest.days[0]!,
      {
        courseDayId: courseDayTwoId,
        dayOrder: 2,
        localDate: '2026-02-02',
        localTime: '09:00',
        durationMinutes: 120,
        instructorId,
      },
    ],
  });
}

async function removeConflictingCourseDayStub() {
  await firestore.doc(`${courseDaysCollectionPath(courseId)}/${courseDayTwoId}`).delete();
}

function enrollmentEnvelope(
  idempotencyKey: string,
  expectedRevision: number,
  targetParticipantId = participantId
): CommandEnvelope<'create_course_enrollments'> {
  return {
    kind: 'create_course_enrollments',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId: CorrelationIdSchema.parse(`correlation_${idempotencyKey}`),
      source: 'client_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      courseId,
      participantIds: [targetParticipantId],
    },
  };
}

async function seedConflictingCourseDayStub() {
  await firestore.doc(`${courseDaysCollectionPath(courseId)}/${courseDayTwoId}`).set({
    courseId,
    courseDayId: courseDayTwoId,
    placeholder: true,
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
    'participant_management',
    'instructors',
    'courses',
    'course_catalog_content',
    'course_enrollments',
    'payments',
    'monetary_events',
    'resource_claims',
    'resource_claim_guards',
    'active_course_enrollment_guards',
    'activity_logs',
    'command_idempotency',
    'domain_outbox',
  ]) {
    const snapshot = await database.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedBase() {
  await firestore.doc(`users/${adminAccountId}`).set(
    AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
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
  await firestore.doc(`users/${accountId}`).set(
    AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
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
  await firestore.doc(`users/${accountId}/wallet/state`).set(
    WalletSchema.parse({
      accountId,
      currency: 'KZT',
      balance: 100_000,
      revision: 1,
      eventRevision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })
  );
  await firestore.doc(`participants/${participantId}`).set({
    participantId,
    displayName: 'Provision Emulator Participant',
    age: { kind: 'age_years', years: 20 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
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
  await firestore.doc(`participants/${participantIdB}`).set({
    participantId: participantIdB,
    displayName: 'Provision Emulator Participant B',
    age: { kind: 'age_years', years: 22 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementIdB },
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
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  await firestore.doc(`participant_management/${managementIdB}`).set({
    participantManagementId: managementIdB,
    participantId: participantIdB,
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
  });
  await firestore.doc(`instructors/${instructorId}`).set({
    id: instructorId,
    name: 'Provision Emulator Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.doc(`instructors/${instructorTwoId}`).set({
    id: instructorTwoId,
    name: 'Provision Emulator Instructor Two',
    pricePerHourKZT: 12_000,
    isAvailable: false,
  });
  await firestore.doc(`courses/${courseId}`).set({
    title: 'Legacy Emulator Course',
    duration: '1 day',
    description: 'Legacy emulator description',
    dates: '1 February',
    totalSeats: 8,
    availableSeats: 8,
    price: 50_000,
    bgImageUrl: 'https://example.com/legacy-emulator.webp',
    instructorIds: [instructorId],
  });
  await firestore.doc(`courses/${legacyOnlyCourseId}`).set({
    title: 'Legacy Only Emulator Course',
    duration: '1 day',
    description: 'Legacy only description',
    dates: '2 February',
    totalSeats: 4,
    availableSeats: 4,
    price: 40_000,
    bgImageUrl: 'https://example.com/legacy-only.webp',
    instructorIds: [instructorId],
  });
}

async function countProvisioningEffects() {
  const [claims, activityLogs, idempotency, outbox, days] = await Promise.all([
    firestore.collection('resource_claims').get(),
    firestore.collection('activity_logs').get(),
    firestore.collection('command_idempotency').get(),
    firestore.collection('domain_outbox').get(),
    firestore.collection(courseDaysCollectionPath(courseId)).get(),
  ]);
  return {
    claims: claims.size,
    activityLogs: activityLogs.size,
    idempotency: idempotency.size,
    outbox: outbox.size,
    courseDays: days.size,
  };
}

async function loadProvisionedCourse() {
  const courseSnap = await firestore.doc(`courses/${courseId}`).get();
  const course = parseCourse(courseSnap.data() as Record<string, unknown>);
  const dayDocuments = await firestore.collection(courseDaysCollectionPath(courseId)).get();
  const courseDays = parseCourseDays(
    dayDocuments.docs.map((doc) => ({ data: doc.data() as Record<string, unknown> }))
  );
  return { courseSnap, course, courseDays };
}

describe.sequential.runIf(runsOnFirestoreEmulator)(
  'course provisioning emulator e2e',
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
      await seedBase();
    });

    it(
      'A. provisions legacy course through full persistence chain and enrolls participant',
      async () => {
        const commands = createCommands();
        const envelope = applyEnvelope('idem-provision-emulator-apply-a');
        const legacySnapBefore = await firestore.doc(`courses/${courseId}`).get();
        expect(legacyCourseDocumentFailsCanonicalParse(legacySnapBefore.data())).toBe(true);

        const applyResult = await commands.execute(envelope);
        expect(applyResult.status).toBe('success');

        const { courseSnap, course, courseDays } = await loadProvisionedCourse();
        expect(courseSnap.exists).toBe(true);
        expect(course).toBeDefined();
        expect(legacyCourseDocumentFailsCanonicalParse(courseSnap.data())).toBe(false);
        expect(courseSnap.data()).not.toHaveProperty('availableSeats');
        expect(courseSnap.data()).not.toHaveProperty('duration');
        expect(courseSnap.data()).not.toHaveProperty('instructorIds');
        expect(course!.revision).toBeGreaterThanOrEqual(1);
        expect(course!.audit.createdByCommandId).toBeDefined();
        expect(course!.audit.lastChangedByCommandId).toBeDefined();
        expect(course!.createdAt).toBeDefined();
        expect(course!.updatedAt).toBeDefined();
        expect(course!.instructorRosterIds).toEqual([instructorId]);
        expect(course!.capacity.totalSeats).toBe(8);
        expect(course!.capacity.availableSeats).toBe(
          resolveProvisionedAvailableSeats({
            totalSeats: manifest.totalSeats,
            capacityPolicy: manifest.capacityPolicy,
          })
        );

        const contentSnap = await firestore.doc(courseCatalogContentPath(courseId)).get();
        const content = parseCourseCatalogContent(contentSnap.data() as Record<string, unknown>);
        expect(content).toBeDefined();
        expect(content?.description).toBe('Provision emulator description');
        expect(contentSnap.data()).not.toHaveProperty('totalSeats');
        expect(contentSnap.data()).not.toHaveProperty('availableSeats');

        expect(courseDays).toHaveLength(1);
        expect(courseDays[0]?.courseDayId).toBe(courseDayId);
        expect(courseDays[0]?.dayOrder).toBe(1);
        expect(courseDays[0]?.actualInstructorIds).toEqual([instructorId]);
        const expectedInterval = resolveManifestDayInterval(manifest.days[0]!, manifest.timeZone)
          .interval;
        expect(compareCanonicalTimestamps(courseDays[0]!.interval.startsAt, expectedInterval.startsAt)).toBe(0);
        expect(compareCanonicalTimestamps(courseDays[0]!.interval.endsAt, expectedInterval.endsAt)).toBe(0);

        expect(course!.scheduleProjection.courseDayCount).toBe(courseDays.length);
        expect(verifyProvisionedCourseSchedule(course!, courseDays)).toBe(true);
        expect(courseScheduleIsComplete(course!, courseDays)).toBe(true);

        const instructorClaims = await firestore.collection('resource_claims').get();
        expect(
          instructorClaims.docs.some(
            (doc) =>
              doc.data()?.claimKind === 'instructor_course_day' &&
              doc.data()?.ownerKind === 'course_day' &&
              doc.data()?.ownerId === (courseDayId as string)
          )
        ).toBe(true);

        const provisionIdentity = resolveCommandIdempotencyIdentity({
          kind: 'provision_canonical_course',
          context: envelope.context,
          intent: { manifest },
        });
        expect(
          (
            await firestore
              .doc(`activity_logs/${activityLogIdFromCommandId(provisionIdentity.commandKey)}`)
              .get()
          ).exists
        ).toBe(true);

        const catalog = await queryCourseCatalogReadModels(
          firestore,
          { scope: 'public' },
          { now: catalogNow }
        );
        const catalogItem = catalog.items.find((item) => item.courseId === courseId);
        expect(catalogItem).toBeDefined();
        expect(catalogItem?.capacity.isEnrollmentEligible).toBe(true);

        const enrollmentEnvelope: CommandEnvelope<'create_course_enrollments'> = {
          kind: 'create_course_enrollments',
          context: {
            actor: accountCommandActor(accountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'idem-provision-emulator-enroll',
            correlationId: CorrelationIdSchema.parse('correlation_provision_emulator_enroll'),
            source: 'client_callable',
            expectedRevision: AggregateRevisionSchema.parse(course!.revision),
          },
          intent: {
            courseId,
            participantIds: [participantId],
          },
        };
        const enrollmentResult = await commands.execute(enrollmentEnvelope);
        expect(enrollmentResult.status).toBe('success');
        const enrollmentIdentity = resolveCommandIdempotencyIdentity(enrollmentEnvelope);
        const enrollmentId = courseEnrollmentIdFromCommandParticipant({
          commandId: enrollmentIdentity.commandKey,
          participantId,
        });
        const enrollmentSnap = await firestore.doc(`course_enrollments/${enrollmentId}`).get();
        expect(enrollmentSnap.exists).toBe(true);
        expect(enrollmentSnap.data()?.lifecycle).toEqual({ status: 'confirmed' });
        expect(enrollmentSnap.data()?.courseId).toBe(courseId);
        expect(enrollmentSnap.data()?.participantId).toBe(participantId);

        const paymentSnap = await firestore
          .doc(`payments/${paymentIdFromCourseEnrollmentId(enrollmentId)}`)
          .get();
        expect(paymentSnap.exists).toBe(true);

        const walletSnap = await firestore.doc(`users/${accountId}/wallet/state`).get();
        expect(walletSnap.data()?.balance).toBe(100_000 - manifest.price);

        const customerRead = await queryCourseEnrollmentReadModels(
          firestore,
          { scope: 'account_hot' },
          { accountId, now: catalogNow }
        );
        expect(customerRead.items.some((item) => item.enrollmentId === enrollmentId)).toBe(true);

        const payload = parseCommandResultPayload(
          'apply_canonical_course_provisioning_manifest',
          applyResult.payload
        );
        expect(payload.success).toBe(true);
        if (payload.success) {
          expect(payload.data.scheduleComplete).toBe(true);
        }
      },
      30_000
    );

    it(
      'B. is idempotent on replay with same command identity',
      async () => {
        const commands = createCommands();
        const envelope = applyEnvelope('idem-provision-emulator-idempotent');
        const first = await commands.execute(envelope);
        const afterFirst = await countProvisioningEffects();
        const { course: courseAfterFirst } = await loadProvisionedCourse();

        const second = await commands.execute(envelope);
        const afterSecond = await countProvisioningEffects();
        const { course: courseAfterSecond, courseDays } = await loadProvisionedCourse();

        expect(first.status).toBe('success');
        expect(second.status).toBe('success');
        expect(afterSecond.courseDays).toBe(afterFirst.courseDays);
        expect(afterSecond.claims).toBe(afterFirst.claims);
        expect(afterSecond.activityLogs).toBe(afterFirst.activityLogs);
        expect(courseAfterSecond?.revision).toBe(courseAfterFirst?.revision);
        expect(courseDays).toHaveLength(1);
      },
      30_000
    );

    it(
      'C. rejects conflicting manifest for already provisioned course',
      async () => {
        const commands = createCommands();
        expect((await commands.execute(applyEnvelope('idem-provision-emulator-conflict-a'))).status).toBe(
          'success'
        );

        const conflicting = CourseProvisioningManifestSchema.parse({
          ...manifest,
          title: 'Conflicting Title',
        });
        const conflictResult = await commands.execute(
          applyEnvelope('idem-provision-emulator-conflict-b', conflicting)
        );
        expect(conflictResult.status).toBe('error');
        if (conflictResult.status === 'error') {
          expect(conflictResult.error.code).toBe('validation');
        }

        const { course } = await loadProvisionedCourse();
        expect(course?.title).toBe(manifest.title);
      },
      30_000
    );

    it(
      'D. blocks operational catalog and enrollment after partial day provisioning failure',
      async () => {
        const commands = createCommands();
        await seedConflictingCourseDayStub();
        const partialManifest = twoDayManifest();
        const envelope = applyEnvelope('idem-provision-emulator-partial', partialManifest);
        const firstAttempt = await commands.execute(envelope);
        expect(firstAttempt.status).toBe('error');

        const { course, courseDays } = await loadProvisionedCourse();
        expect(course).toBeDefined();
        expect(courseDays).toHaveLength(1);
        expect(course!.scheduleProjection.courseDayCount).toBe(2);
        expect(isCourseOperationalForEnrollment(course!, courseDays)).toBe(false);

        const catalog = await queryCourseCatalogReadModels(
          firestore,
          { scope: 'public' },
          { now: catalogNow }
        );
        expect(catalog.items.some((item) => item.courseId === courseId)).toBe(false);

        const partialEnrollment = await commands.execute(
          enrollmentEnvelope('idem-provision-emulator-partial-enroll', course!.revision)
        );
        expect(partialEnrollment.status).toBe('error');
        if (partialEnrollment.status === 'error') {
          expect(partialEnrollment.error.code).toBe('validation');
        }

        const afterPartial = await countProvisioningEffects();
        const retry = await commands.execute(envelope);
        expect(retry.status).toBe('error');
        const afterRetry = await countProvisioningEffects();
        expect(afterRetry.courseDays).toBe(afterPartial.courseDays);
        expect(afterRetry.claims).toBe(afterPartial.claims);
      },
      30_000
    );

    it(
      'E. exposes legacy-only course outside operational catalog and canonical course as eligible',
      async () => {
        const commands = createCommands();
        expect((await commands.execute(applyEnvelope('idem-provision-emulator-catalog'))).status).toBe(
          'success'
        );

        const catalog = await queryCourseCatalogReadModels(
          firestore,
          { scope: 'public' },
          { now: catalogNow }
        );
        const canonicalItem = catalog.items.find((item) => item.courseId === courseId);
        const legacyItem = catalog.items.find((item) => item.courseId === legacyOnlyCourseId);

        expect(canonicalItem).toBeDefined();
        expect(canonicalItem?.capacity.isEnrollmentEligible).toBe(true);
        expect(legacyItem).toBeUndefined();
      },
      30_000
    );

    it(
      'F. rejects enrollment for legacy course and when no course days exist',
      async () => {
        const commands = createCommands();
        await firestore.doc(`${courseDaysCollectionPath(courseId)}/${courseDayId}`).set({
          courseId,
          courseDayId,
          placeholder: true,
        });
        await commands.execute(applyEnvelope('idem-provision-emulator-incomplete'));

        const legacyEnrollment = await commands.execute({
          kind: 'create_course_enrollments',
          context: {
            actor: accountCommandActor(accountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'idem-provision-emulator-legacy-enroll',
            correlationId: CorrelationIdSchema.parse('correlation_provision_legacy_enroll'),
            source: 'client_callable',
          },
          intent: {
            courseId: legacyOnlyCourseId,
            participantIds: [participantId],
          },
        });
        expect(legacyEnrollment.status).toBe('error');

        const { course, courseDays } = await loadProvisionedCourse();
        expect(courseDays).toHaveLength(0);
        expect(courseScheduleIsComplete(course!, courseDays)).toBe(false);

        const incompleteEnrollment = await commands.execute({
          kind: 'create_course_enrollments',
          context: {
            actor: accountCommandActor(accountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'idem-provision-emulator-incomplete-enroll',
            correlationId: CorrelationIdSchema.parse('correlation_provision_incomplete_enroll'),
            source: 'client_callable',
            expectedRevision: AggregateRevisionSchema.parse(course!.revision),
          },
          intent: {
            courseId,
            participantIds: [participantId],
          },
        });
        expect(incompleteEnrollment.status).toBe('error');
        if (incompleteEnrollment.status === 'error') {
          expect(incompleteEnrollment.error.code).toBe('validation');
        }
      },
      30_000
    );

    it(
      'G. rejects provision when roster instructor is missing from catalog',
      async () => {
        const commands = createCommands();
        const missingInstructorId = InstructorIdSchema.parse('instructor_course_provision_missing');
        const badManifest = CourseProvisioningManifestSchema.parse({
          ...manifest,
          instructorRosterIds: [missingInstructorId],
          days: [
            {
              ...manifest.days[0]!,
              instructorId: missingInstructorId,
            },
          ],
        });
        const result = await commands.execute(
          applyEnvelope('idem-provision-emulator-missing-instructor', badManifest)
        );
        expect(result.status).toBe('error');
        expect(legacyCourseDocumentFailsCanonicalParse((await firestore.doc(`courses/${courseId}`).get()).data())).toBe(
          true
        );
      },
      30_000
    );

    it(
      'H. rejects enrollment when capacity is exhausted',
      async () => {
        const commands = createCommands();
        const singleSeatManifest = CourseProvisioningManifestSchema.parse({
          ...manifest,
          totalSeats: 1,
          capacityPolicy: { kind: 'seed_full' },
        });
        expect(
          (await commands.execute(applyEnvelope('idem-provision-emulator-capacity', singleSeatManifest)))
            .status
        ).toBe('success');

        const { course } = await loadProvisionedCourse();
        const firstEnrollment = await commands.execute({
          kind: 'create_course_enrollments',
          context: {
            actor: accountCommandActor(accountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'idem-provision-emulator-capacity-a',
            correlationId: CorrelationIdSchema.parse('correlation_provision_capacity_a'),
            source: 'client_callable',
            expectedRevision: AggregateRevisionSchema.parse(course!.revision),
          },
          intent: {
            courseId,
            participantIds: [participantId],
          },
        });
        expect(firstEnrollment.status).toBe('success');

        const courseAfterFirst = (await loadProvisionedCourse()).course!;
        const secondEnrollment = await commands.execute({
          kind: 'create_course_enrollments',
          context: {
            actor: accountCommandActor(accountId),
            exercisedCapability: 'account_owner',
            idempotencyKey: 'idem-provision-emulator-capacity-b',
            correlationId: CorrelationIdSchema.parse('correlation_provision_capacity_b'),
            source: 'client_callable',
            expectedRevision: AggregateRevisionSchema.parse(courseAfterFirst.revision),
          },
          intent: {
            courseId,
            participantIds: [participantIdB],
          },
        });
        expect(secondEnrollment.status).toBe('error');
        if (secondEnrollment.status === 'error') {
          expect(secondEnrollment.error.code).toBe('unavailable');
        }
      },
      30_000
    );

    it(
      'I. replaces legacy course document inside a single transaction without leaving it absent',
      async () => {
        const commands = createCommands();
        const legacyRef = firestore.doc(`courses/${courseId}`);
        expect((await legacyRef.get()).exists).toBe(true);
        expect(legacyCourseDocumentFailsCanonicalParse((await legacyRef.get()).data())).toBe(true);

        expect((await commands.execute(applyEnvelope('idem-provision-emulator-replace'))).status).toBe(
          'success'
        );

        const replaced = await legacyRef.get();
        expect(replaced.exists).toBe(true);
        expect(legacyCourseDocumentFailsCanonicalParse(replaced.data())).toBe(false);
        expect(parseCourse(replaced.data() as Record<string, unknown>)?.courseId).toBe(courseId);
      },
      30_000
    );

    it(
      'J. resumes partial provisioning with same apply identity after blocker removal',
      async () => {
        const commands = createCommands();
        await seedConflictingCourseDayStub();
        const partialManifest = twoDayManifest();
        const envelope = applyEnvelope('idem-provision-emulator-resume', partialManifest);
        expect((await commands.execute(envelope)).status).toBe('error');

        const partial = await loadProvisionedCourse();
        expect(partial.courseDays).toHaveLength(1);
        expect(partial.course!.scheduleProjection.courseDayCount).toBe(2);

        await removeConflictingCourseDayStub();
        const countsBeforeResume = await countProvisioningEffects();
        const resume = await commands.execute(envelope);
        expect(resume.status).toBe('success');

        const completed = await loadProvisionedCourse();
        expect(completed.courseDays).toHaveLength(2);
        expect(isCourseOperationalForEnrollment(completed.course!, completed.courseDays)).toBe(true);
        expect(verifyProvisionedCourseSchedule(completed.course!, completed.courseDays)).toBe(true);

        const countsAfterResume = await countProvisioningEffects();
        expect(countsAfterResume.courseDays).toBe(2);
        expect(countsAfterResume.claims).toBe(countsBeforeResume.claims + 1);

        const catalog = await queryCourseCatalogReadModels(
          firestore,
          { scope: 'public' },
          { now: catalogNow }
        );
        const catalogItem = catalog.items.find((item) => item.courseId === courseId);
        expect(catalogItem?.capacity.isEnrollmentEligible).toBe(true);

        const enrollmentResult = await commands.execute(
          enrollmentEnvelope('idem-provision-emulator-resume-enroll', completed.course!.revision)
        );
        expect(enrollmentResult.status).toBe('success');
      },
      30_000
    );

    it(
      'K. rejects conflicting manifest fingerprint while partially provisioned',
      async () => {
        const commands = createCommands();
        await seedConflictingCourseDayStub();
        const partialManifest = twoDayManifest();
        expect(
          (await commands.execute(applyEnvelope('idem-provision-emulator-partial-conflict-a', partialManifest)))
            .status
        ).toBe('error');

        const alternateDayTwoId = CourseDayIdSchema.parse('course_day_provision_emulator_alt_02');
        const conflictingManifest = CourseProvisioningManifestSchema.parse({
          ...partialManifest,
          days: [
            partialManifest.days[0]!,
            {
              ...partialManifest.days[1]!,
              courseDayId: alternateDayTwoId,
            },
          ],
        });
        const conflict = await commands.execute(
          applyEnvelope('idem-provision-emulator-partial-conflict-b', conflictingManifest)
        );
        expect(conflict.status).toBe('error');
        if (conflict.status === 'error') {
          expect(conflict.error.code).toBe('validation');
        }

        const { courseDays } = await loadProvisionedCourse();
        expect(courseDays).toHaveLength(1);
        expect(courseDays[0]?.courseDayId).toBe(courseDayId);
      },
      30_000
    );
  }
);
