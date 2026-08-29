import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  courseScheduleIsComplete,
  isCourseOperationalForEnrollment,
  deriveSchedulePlanFromManifest,
  legacyCourseDocumentFailsCanonicalParse,
  resolveProvisionedAvailableSeats,
  verifyProvisionedCourseSchedule,
  CourseProvisioningManifestSchema,
  buildCourseAggregateFromManifest,
  resolveManifestDayInterval,
  timestampFromDate,
  CourseDaySchema,
} from '@ski-academy/shared-domain';

const courseId = CourseIdSchema.parse('course_provision_manifest_01');
const instructorId = InstructorIdSchema.parse('instructor_provision_manifest_01');
const courseDayOneId = CourseDayIdSchema.parse('course_day_provision_manifest_01');
const courseDayTwoId = CourseDayIdSchema.parse('course_day_provision_manifest_02');

const baseManifest = CourseProvisioningManifestSchema.parse({
  courseId,
  title: 'Provision Manifest Course',
  price: KztMinorUnitsSchema.parse(50_000),
  totalSeats: 8,
  capacityPolicy: { kind: 'seed_full' },
  instructorRosterIds: [instructorId],
  timeZone: 'Asia/Almaty',
  days: [
    {
      courseDayId: courseDayOneId,
      dayOrder: 1,
      localDate: '2026-03-01',
      localTime: '09:00',
      durationMinutes: 120,
      instructorId,
    },
    {
      courseDayId: courseDayTwoId,
      dayOrder: 2,
      localDate: '2026-03-02',
      localTime: '09:00',
      durationMinutes: 120,
      instructorId,
    },
  ],
  presentation: {
    duration: '2 days',
    description: 'Manifest course description',
    dates: '1–2 March 2026, 09:00–11:00',
    bgImageUrl: 'https://example.com/course.webp',
  },
});

describe('course provisioning manifest', () => {
  it('rejects legacy course documents for canonical parse', () => {
    expect(
      legacyCourseDocumentFailsCanonicalParse({
        title: 'Legacy',
        duration: '2 days',
        description: 'Legacy course',
        dates: '1 March',
        totalSeats: 8,
        availableSeats: 8,
        price: 100,
        bgImageUrl: 'https://example.com/legacy.webp',
      })
    ).toBe(true);
  });

  it('derives schedule plan from reviewed manifest days', () => {
    const plan = deriveSchedulePlanFromManifest(baseManifest);
    expect(plan.courseDayCount).toBe(2);
    expect(plan.startAt).toBeDefined();
    expect(plan.finalCourseDayEndsAt).toBeDefined();
  });

  it('resolves seed_full capacity to total seats', () => {
    expect(
      resolveProvisionedAvailableSeats({
        totalSeats: 8,
        capacityPolicy: { kind: 'seed_full' },
      })
    ).toBe(8);
  });

  it('rejects duplicate day order', () => {
    const parsed = CourseProvisioningManifestSchema.safeParse({
      ...baseManifest,
      days: [baseManifest.days[0], { ...baseManifest.days[1], dayOrder: 1 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('builds canonical course aggregate with planned projection', () => {
    const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const course = buildCourseAggregateFromManifest({
      manifest: baseManifest,
      revision: 1,
      decidedAt,
      audit: {
        createdByCommandId: 'command_manifest_test',
        lastChangedByCommandId: 'command_manifest_test',
        correlationId: 'correlation_manifest_test' as never,
      },
    });
    expect(course.scheduleProjection.courseDayCount).toBe(2);
    expect(course.capacity.availableSeats).toBe(8);
    expect(course.provisioningManifestFingerprint).toBeDefined();
    expect(course.provisioningExpectedCourseDayIds).toEqual([courseDayOneId, courseDayTwoId]);
    expect(courseScheduleIsComplete(course, [])).toBe(false);
    expect(isCourseOperationalForEnrollment(course, [])).toBe(false);
  });

  it('keeps planned day count while only one manifest day is committed', () => {
    const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const course = buildCourseAggregateFromManifest({
      manifest: baseManifest,
      revision: 1,
      decidedAt,
      audit: {
        createdByCommandId: 'command_manifest_test',
        lastChangedByCommandId: 'command_manifest_test',
        correlationId: 'correlation_manifest_test' as never,
      },
    });
    const dayOneInterval = resolveManifestDayInterval(
      baseManifest.days[0]!,
      baseManifest.timeZone
    ).interval;
    const dayOne = CourseDaySchema.parse({
      courseId,
      courseDayId: courseDayOneId,
      dayOrder: 1,
      interval: dayOneInterval,
      timeZone: baseManifest.timeZone,
      actualInstructorIds: [instructorId],
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_manifest_test',
        lastChangedByCommandId: 'command_manifest_test',
        correlationId: 'correlation_manifest_test' as never,
      },
    });
    expect(course.scheduleProjection.courseDayCount).toBe(2);
    expect(courseScheduleIsComplete(course, [dayOne])).toBe(false);
    expect(isCourseOperationalForEnrollment(course, [dayOne])).toBe(false);
  });
});

describe('verifyProvisionedCourseSchedule', () => {
  it('requires complete schedule before verification passes', () => {
    const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const course = buildCourseAggregateFromManifest({
      manifest: baseManifest,
      revision: 3,
      decidedAt,
      audit: {
        createdByCommandId: 'command_manifest_test',
        lastChangedByCommandId: 'command_manifest_test',
        correlationId: 'correlation_manifest_test' as never,
      },
    });
    expect(verifyProvisionedCourseSchedule(course, [])).toBe(false);
  });
});
