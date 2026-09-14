import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  accountCommandActor,
  courseRequiredDaySetIsFrozen,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const adminAccountId = AccountIdSchema.parse('account_course_day_freeze_admin');
const instructorId = InstructorIdSchema.parse('instructor_course_day_freeze');
const courseId = CourseIdSchema.parse('course_required_day_freeze');
const courseDayId = CourseDayIdSchema.parse('course_day_required_freeze_01');
const correlationId = CorrelationIdSchema.parse('correlation_course_day_freeze');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function fixture(withEnrollment: boolean): Record<string, unknown> {
  return {
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    }),
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Course freeze instructor',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`courses/${courseId}`]: {
      courseId,
      title: 'Required CourseDay freeze',
      price: 80_000,
      capacity: { totalSeats: 8, availableSeats: withEnrollment ? 7 : 8 },
      instructorRosterIds: [instructorId],
      startAt: timestampFromDate(new Date('2026-02-01T09:00:00.000Z')),
      scheduleProjection: {
        courseDayCount: 1,
        finalCourseDayEndsAt: timestampFromDate(new Date('2026-02-01T11:00:00.000Z')),
        courseScheduleRevision: 1,
      },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    },
    ...(withEnrollment
      ? {
          'course_enrollments/enrollment_course_day_freeze_01': {
            courseId,
            lifecycle: { status: 'confirmed' },
          },
        }
      : {}),
  };
}

function createDayEnvelope(): CommandEnvelope<'create_course_day'> {
  return {
    kind: 'create_course_day',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: 'idem-course-day-required-freeze',
      correlationId,
      source: 'admin_callable',
      expectedRevision: 1,
      calendarInput: {
        localDate: '2026-02-01',
        localTime: '09:00',
        durationMinutes: 120,
      },
      timezone: 'Asia/Almaty',
    },
    intent: { courseId, courseDayId, instructorId },
  };
}

describe('required CourseDay set freeze', () => {
  it('allows CourseDay creation before the first canonical CourseEnrollment', async () => {
    expect(courseRequiredDaySetIsFrozen(false)).toBe(false);
    const executor = createInMemoryCanonicalTransactionExecutor(fixture(false));
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-02T00:00:00.000Z')) },
      executor
    );
    expect((await commands.execute(createDayEnvelope())).status).toBe('success');
    expect(executor.snapshot().docs.has(`courses/${courseId}/days/${courseDayId}`)).toBe(true);
  });

  it('rejects an additional required CourseDay after the first canonical CourseEnrollment', async () => {
    expect(courseRequiredDaySetIsFrozen(true)).toBe(true);
    const executor = createInMemoryCanonicalTransactionExecutor(fixture(true));
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-01-02T00:00:00.000Z')) },
      executor
    );
    expect((await commands.execute(createDayEnvelope())).status).toBe('error');
    expect(executor.snapshot().docs.has(`courses/${courseId}/days/${courseDayId}`)).toBe(false);
  });
});
