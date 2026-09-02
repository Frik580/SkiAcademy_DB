import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  IdempotencyKeySchema,
  InstructorIdSchema,
  accountCommandActor,
  parseCommandEnvelope,
  timestampFromDate,
  type AdminCourseReadModel,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../../functions/src/canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../../functions/src/canonical/commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../../functions/src/canonical/transactions';
import { catalogContentInputFromCourse } from '../../src/features/admin/components/courses/adminCourseTableMapping';

const adminId = AccountIdSchema.parse('account_admin_course_cmd_01');
const correlationId = CorrelationIdSchema.parse('correlation_admin_course_cmd_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function baseCourse(overrides: Partial<AdminCourseReadModel> = {}): AdminCourseReadModel {
  return {
    courseId: 'course_cmd_01',
    title: 'Kids Camp',
    lifecycle: 'active',
    price: 90_000,
    capacity: { totalSeats: 10, availableSeats: 7, occupiedConfirmedSeats: 3 },
    revision: 4,
    scheduleRevision: 3,
    instructorRosterIds: ['ins_1'],
    instructors: [{ instructorId: 'ins_1', name: 'Anna' }],
    courseDays: [
      {
        courseId: 'course_cmd_01',
        courseDayId: 'course_day_cmd_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
          endsAt: { seconds: 1_788_256_800, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: ['ins_1'],
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId,
        },
      },
    ],
    activeEnrollmentCount: 1,
    totalEnrollmentCount: 1,
    provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
    catalogContent: {
      status: 'present',
      content: {
        courseId: 'course_cmd_01',
        revision: 1,
        duration: '3 days',
        description: 'Camp',
        dates: '1–3 Jan',
        bgImageUrl: 'https://example.com/c.png',
        level: 'beginner',
        isHidden: false,
        order: 2,
      },
    },
    authorizedActions: [{ kind: 'update_course_catalog_content', expectedRevision: 1 }],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  } as AdminCourseReadModel;
}

function buildUiTransport(course: AdminCourseReadModel, contentOverrides: Record<string, unknown> = {}) {
  const action = course.authorizedActions.find(
    (candidate) => candidate.kind === 'update_course_catalog_content'
  );
  if (!action) throw new Error('missing authorized action');
  const content = { ...catalogContentInputFromCourse(course), ...contentOverrides };
  return {
    kind: 'update_course_catalog_content' as const,
    idempotencyKey: IdempotencyKeySchema.parse('admin-course:update_course_catalog_content:test01'),
    correlationId,
    expectedRevision: action.expectedRevision,
    intent: {
      courseId: course.courseId,
      content,
      reasonExplanation: 'Admin course order',
    },
  };
}

function buildEnvelopeFromTransport(transport: ReturnType<typeof buildUiTransport>) {
  return {
    kind: transport.kind,
    context: {
      actor: accountCommandActor(adminId),
      exercisedCapability: 'administrator' as const,
      idempotencyKey: transport.idempotencyKey,
      correlationId: transport.correlationId,
      expectedRevision: transport.expectedRevision,
      source: 'admin_callable' as const,
      transportMetadata: { transport: 'firebase_callable' },
    },
    intent: transport.intent,
  };
}

describe('admin course catalog command UI payload', () => {
  it('parses move-order UI-equivalent envelope', () => {
    const course = baseCourse();
    const transport = buildUiTransport(course, { order: 3 });
    const parsed = parseCommandEnvelope(buildEnvelopeFromTransport(transport));
    expect(parsed.success).toBe(true);
  });

  it('parses visibility-toggle UI-equivalent envelope', () => {
    const course = baseCourse();
    const transport = buildUiTransport(course, { isHidden: true });
    const parsed = parseCommandEnvelope(buildEnvelopeFromTransport(transport));
    expect(parsed.success).toBe(true);
  });

  it('parses course without catalog presentation using expectedRevision 0', () => {
    const course = baseCourse({
      catalogContent: { status: 'missing' },
      authorizedActions: [{ kind: 'update_course_catalog_content', expectedRevision: 0 }],
    });
    const transport = buildUiTransport(course);
    const parsed = parseCommandEnvelope(buildEnvelopeFromTransport(transport));
    expect(parsed.success).toBe(true);
  });
});

describe('update_course_catalog_content handler with UI payload', () => {
  const adminAccountId = AccountIdSchema.parse('account_admin_course_cmd_01');
  const courseId = CourseIdSchema.parse('course_cmd_01');
  const courseDayId = CourseDayIdSchema.parse('course_day_cmd_01');
  const instructorId = InstructorIdSchema.parse('ins_1');

  function context(expectedRevision: number) {
    return {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator' as const,
      idempotencyKey: IdempotencyKeySchema.parse('admin-course:update_course_catalog_content:test01'),
      correlationId,
      source: 'admin_callable' as const,
      expectedRevision,
    };
  }

  function fixture(catalogDoc?: Record<string, unknown>) {
    const course = CourseSchema.parse({
      courseId,
      title: 'Kids Camp',
      lifecycle: 'active',
      price: 90_000,
      capacity: { totalSeats: 10, availableSeats: 7 },
      instructorRosterIds: [instructorId],
      startAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
        courseScheduleRevision: 1,
      },
      revision: 4,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    });
    const day = CourseDaySchema.parse({
      courseId,
      courseDayId,
      dayOrder: 1,
      interval: {
        startsAt: timestampFromDate(new Date('2026-12-01T05:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-12-01T07:00:00.000Z')),
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
  const account = {
      ...AccountSchema.parse({
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
      role: 'admin',
    };
    return {
      [`users/${adminAccountId}`]: account,
      [`courses/${courseId}`]: course,
      [`courses/${courseId}/days/${courseDayId}`]: day,
      ...(catalogDoc ? { [`course_catalog_content/${courseId}`]: catalogDoc } : {}),
    };
  }

  it('executes move-order UI-equivalent payload against canonical catalog revision', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixture({
        duration: '3 days',
        description: 'Camp',
        dates: '1–3 Jan',
        bgImageUrl: 'https://example.com/c.png',
        level: 'beginner',
        isHidden: false,
        order: 2,
      })
    );
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );
    const course = baseCourse();
    const content = { ...catalogContentInputFromCourse(course), order: 3 };
    const envelope = {
      kind: 'update_course_catalog_content' as const,
      context: context(1),
      intent: {
        courseId,
        content,
        reasonExplanation: 'Admin course order',
      },
    };
    expect(parseCommandEnvelope(envelope).success).toBe(true);
    const result = await commands.execute(envelope);
    if (result.status === 'error') {
      throw new Error(`move-order failed: ${result.error.code} ${JSON.stringify(result.error)}`);
    }
    expect(result).toMatchObject({ status: 'success' });
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.order).toBe(3);
  });

  it('executes visibility toggle for legacy catalog docs without embedded courseId', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      fixture({
        duration: '3 days',
        description: 'Camp',
        dates: '1–3 Jan',
        bgImageUrl: 'https://example.com/c.png',
        isHidden: false,
        order: 2,
      })
    );
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) },
      executor
    );
    const course = baseCourse({
      catalogContent: {
        status: 'present',
        content: {
          courseId,
          revision: 1,
          duration: '3 days',
          description: 'Camp',
          dates: '1–3 Jan',
          bgImageUrl: 'https://example.com/c.png',
          isHidden: false,
          order: 2,
        },
      },
      authorizedActions: [{ kind: 'update_course_catalog_content', expectedRevision: 1 }],
    });
    const content = { ...catalogContentInputFromCourse(course), isHidden: true };
    const result = await commands.execute({
      kind: 'update_course_catalog_content',
      context: context(1),
      intent: { courseId, content, reasonExplanation: 'Admin course visibility' },
    });
    if (result.status === 'error') {
      throw new Error(`legacy catalog toggle failed: ${result.error.code} ${JSON.stringify(result.error)}`);
    }
    expect(result).toMatchObject({ status: 'success' });
    expect(executor.snapshot().docs.get(`course_catalog_content/${courseId}`)?.data.isHidden).toBe(true);
  });
});
