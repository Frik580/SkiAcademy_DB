import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { parseCourse } from './courseStore';

const correlationId = CorrelationIdSchema.parse('correlation_course_admin_unit_01');
const adminAccountId = AccountIdSchema.parse('account_course_admin_unit_01');
const courseId = CourseIdSchema.parse('course_admin_unit_01');
const courseDayId = CourseDayIdSchema.parse('course_day_admin_unit_01');
const instructorId = InstructorIdSchema.parse('instructor_course_admin_unit_01');
const secondInstructorId = InstructorIdSchema.parse('instructor_course_admin_unit_02');
const thirdInstructorId = InstructorIdSchema.parse('instructor_course_admin_unit_03');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) };
}

function context(idempotencyKey: string, expectedRevision = 1) {
  return {
    actor: accountCommandActor(adminAccountId),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    expectedRevision,
  };
}

function fixture(availableSeats = 8) {
  const course = CourseSchema.parse({
    courseId,
    title: 'Canonical Course',
    lifecycle: 'active',
    price: 50_000,
    capacity: { totalSeats: 8, availableSeats },
    instructorRosterIds: [instructorId, secondInstructorId],
    startAt: timestampFromDate(new Date('2026-03-01T09:00:00.000Z')),
    scheduleProjection: {
      courseDayCount: 1,
      finalCourseDayEndsAt: timestampFromDate(new Date('2026-03-01T11:00:00.000Z')),
      courseScheduleRevision: 1,
    },
    provisioningManifestFingerprint: 'a'.repeat(64),
    provisioningExpectedCourseDayIds: [courseDayId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  const courseDay = CourseDaySchema.parse({
    courseId,
    courseDayId,
    dayOrder: 1,
    interval: {
      startsAt: timestampFromDate(new Date('2026-03-01T09:00:00.000Z')),
      endsAt: timestampFromDate(new Date('2026-03-01T11:00:00.000Z')),
    },
    timeZone: 'Asia/Almaty',
    actualInstructorIds: [instructorId],
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId,
    },
  });
  return {
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    }),
    [`courses/${courseId}`]: course,
    [`courses/${courseId}/days/${courseDayId}`]: courseDay,
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'First Instructor',
      pricePerHourKZT: 10_000,
      isAvailable: true,
    },
    [`instructors/${secondInstructorId}`]: {
      id: secondInstructorId,
      name: 'Second Instructor',
      pricePerHourKZT: 10_000,
      isAvailable: true,
    },
    [`instructors/${thirdInstructorId}`]: {
      id: thirdInstructorId,
      name: 'Third Instructor',
      pricePerHourKZT: 10_000,
      isAvailable: true,
    },
  };
}

describe('canonical Course administration commands', () => {
  it('changes price without touching enrollment or payment obligations', async () => {
    const docs = fixture();
    const paymentPath = 'payments/payment_course_admin_unit_01';
    const enrollmentPath = 'course_enrollments/enrollment_course_admin_unit_01';
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...docs,
      [paymentPath]: { price: 50_000, revision: 1 },
      [enrollmentPath]: { courseId, lifecycle: { status: 'confirmed' }, paymentId: 'payment_course_admin_unit_01' },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const result = await commands.execute({
      kind: 'change_course_price',
      context: context('idem-course-price-01'),
      intent: { courseId, price: 60_000 as never, reasonExplanation: 'Seasonal tariff' },
    });
    expect(result.status).toBe('success');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)?.price).toBe(60_000);
    expect(executor.snapshot().docs.get(paymentPath)?.data.price).toBe(50_000);
    expect(executor.snapshot().docs.get(enrollmentPath)?.data.paymentId).toBe('payment_course_admin_unit_01');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data))
      .not.toHaveProperty('provisioningManifestFingerprint');
  });

  it('derives available capacity and rejects a reduction below occupied seats', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture(3));
    const commands = createProductionCanonicalCommands(environment(), executor);
    const rejected = await commands.execute({
      kind: 'change_course_capacity',
      context: context('idem-course-capacity-invalid'),
      intent: { courseId, totalSeats: 4, reasonExplanation: 'Unsafe reduction' },
    });
    expect(rejected.status).toBe('error');
    const accepted = await commands.execute({
      kind: 'change_course_capacity',
      context: context('idem-course-capacity-valid'),
      intent: { courseId, totalSeats: 10, reasonExplanation: 'Open two seats' },
    });
    expect(accepted.status).toBe('success');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)?.capacity).toEqual({ totalSeats: 10, availableSeats: 5 });
  });

  it('rejects roster removal while a CourseDay still assigns the instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const envelope: CommandEnvelope<'remove_course_roster_instructor'> = {
      kind: 'remove_course_roster_instructor',
      context: context('idem-course-roster-remove'),
      intent: { courseId, instructorId, reasonExplanation: 'Roster cleanup' },
    };
    const result = await commands.execute(envelope);
    expect(result.status).toBe('error');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)?.instructorRosterIds).toContain(instructorId);
  });

  it('removes an unassigned roster instructor and adds a validated instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const removed = await commands.execute({
      kind: 'remove_course_roster_instructor',
      context: context('idem-course-roster-remove-safe'),
      intent: {
        courseId,
        instructorId: secondInstructorId,
        reasonExplanation: 'Remove unused roster member',
      },
    });
    expect(removed.status).toBe('success');
    const added = await commands.execute({
      kind: 'add_course_roster_instructor',
      context: context('idem-course-roster-add', 2),
      intent: {
        courseId,
        instructorId: thirdInstructorId,
        reasonExplanation: 'Add replacement roster member',
      },
    });
    expect(added.status).toBe('success');
    expect(
      parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)
        ?.instructorRosterIds
    ).toEqual([instructorId, thirdInstructorId]);
  });

  it('archives and reactivates without hard deletion and rejects stale concurrent edits', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const archived = await commands.execute({
      kind: 'archive_course',
      context: context('idem-course-archive'),
      intent: { courseId, reasonExplanation: 'Retired from catalog' },
    });
    expect(archived.status).toBe('success');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)?.lifecycle).toBe('archived');
    expect(executor.snapshot().docs.has(`courses/${courseId}`)).toBe(true);
    const reactivated = await commands.execute({
      kind: 'reactivate_course',
      context: context('idem-course-reactivate', 2),
      intent: { courseId, reasonExplanation: 'Return course to operations' },
    });
    expect(reactivated.status).toBe('success');
    expect(parseCourse(executor.snapshot().docs.get(`courses/${courseId}`)?.data)?.lifecycle).toBe('active');
    const stale = await commands.execute({
      kind: 'change_course_title',
      context: context('idem-course-title-stale', 1),
      intent: { courseId, title: 'Stale title', reasonExplanation: 'Concurrent edit' },
    });
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
  });

  it('writes catalog presentation only to course_catalog_content', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(fixture());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const result = await commands.execute({
      kind: 'update_course_catalog_content',
      context: context('idem-course-catalog', 0),
      intent: {
        courseId,
        reasonExplanation: 'Marketing refresh',
        content: {
          duration: 'One day',
          description: 'Separate presentation copy',
          dates: '1 March 2026',
          bgImageUrl: 'https://example.com/course.webp',
          titleRu: 'Каталог курса',
        },
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.description).toBe('Separate presentation copy');
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.revision).toBe(1);
    const course = executor.snapshot().docs.get(`courses/${courseId}`)?.data;
    expect(course).not.toHaveProperty('description');
    expect(course).not.toHaveProperty('dates');
    expect(course).not.toHaveProperty('priceKZT');

    const firstEdit = await commands.execute({
      kind: 'update_course_catalog_content',
      context: context('idem-course-catalog-edit-a', 1),
      intent: {
        courseId,
        reasonExplanation: 'First concurrent catalog edit',
        content: {
          duration: 'Two days',
          description: 'Winning presentation copy',
          dates: '1–2 March 2026',
          bgImageUrl: 'https://example.com/course.webp',
        },
      },
    });
    expect(firstEdit.status).toBe('success');
    const staleEdit = await commands.execute({
      kind: 'update_course_catalog_content',
      context: context('idem-course-catalog-edit-b', 1),
      intent: {
        courseId,
        reasonExplanation: 'Stale concurrent catalog edit',
        content: {
          duration: 'Three days',
          description: 'Losing presentation copy',
          dates: '1–3 March 2026',
          bgImageUrl: 'https://example.com/course.webp',
        },
      },
    });
    expect(staleEdit.status).toBe('error');
    if (staleEdit.status === 'error') expect(staleEdit.error.code).toBe('stale_version');
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.description).toBe('Winning presentation copy');
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.revision).toBe(2);
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data)
      .not.toHaveProperty('titleRu');
  });

  it('updates legacy catalog docs that omit embedded courseId using document identity', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...fixture(),
      [`course_catalog_content/${courseId}`]: {
        duration: 'One day',
        description: 'Presentation content',
        dates: '1 December',
        bgImageUrl: 'https://example.com/course.webp',
        isHidden: false,
        order: 2,
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const result = await commands.execute({
      kind: 'update_course_catalog_content',
      context: context('idem-course-catalog-legacy', 1),
      intent: {
        courseId,
        reasonExplanation: 'Admin course order',
        content: {
          duration: 'One day',
          description: 'Presentation content',
          dates: '1 December',
          bgImageUrl: 'https://example.com/course.webp',
          isHidden: false,
          order: 3,
        },
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.order).toBe(3);
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.courseId).toBe(courseId);
  });

  it('fails closed for CourseDay reschedule and removal while enrollment exists', async () => {
    const enrollment = {
      courseId,
      lifecycle: { status: 'confirmed' },
    };
    const rescheduleExecutor = createInMemoryCanonicalTransactionExecutor({
      ...fixture(),
      'course_enrollments/enrollment_course_admin_policy_01': enrollment,
    });
    const rescheduleCommands = createProductionCanonicalCommands(environment(), rescheduleExecutor);
    const reschedule = await rescheduleCommands.execute({
      kind: 'reschedule_course_day',
      context: {
        ...context('idem-course-day-reschedule-policy'),
        calendarInput: { localDate: '2026-03-02', localTime: '09:00', durationMinutes: 120 },
        timezone: 'Asia/Almaty',
      },
      intent: {
        courseId,
        courseDayId,
        expectedCourseDayRevision: 1,
        reasonExplanation: 'Move the delivery date',
      },
    });
    expect(reschedule.status).toBe('error');

    const removeExecutor = createInMemoryCanonicalTransactionExecutor({
      ...fixture(),
      'course_enrollments/enrollment_course_admin_policy_02': enrollment,
    });
    const removeCommands = createProductionCanonicalCommands(environment(), removeExecutor);
    const removal = await removeCommands.execute({
      kind: 'remove_course_day',
      context: context('idem-course-day-remove-policy'),
      intent: {
        courseId,
        courseDayId,
        expectedCourseDayRevision: 1,
        reasonExplanation: 'Remove unused day',
      },
    });
    expect(removal.status).toBe('error');
    expect(removeExecutor.snapshot().docs.has(`courses/${courseId}/days/${courseDayId}`)).toBe(true);
  });
});
