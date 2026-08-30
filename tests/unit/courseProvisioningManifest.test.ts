import { describe, expect, it } from 'vitest';
import {
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  courseScheduleIsComplete,
  isCourseOperationalForEnrollment,
  computeCourseProvisioningManifestFingerprint,
  deriveSchedulePlanFromManifest,
  legacyCourseDocumentFailsCanonicalParse,
  courseDocumentExtraKeys,
  isCanonicalCourseProtectedFromLegacyAdminWrites,
  buildCourseDocumentShapeRepairPlan,
  classifyCourseDocumentExtraKey,
  buildCourseAggregateFromShapeRepair,
  parseCanonicalCourseOperationalStateFromDocument,
  validatePersistedCourseOperationalStateAgainstManifest,
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

  it('classifies hybrid extra keys and builds repair plan', () => {
    const hybrid = {
      ...buildCourseAggregateFromManifest({
        manifest: baseManifest,
        revision: 7,
        decidedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        audit: {
          createdByCommandId: 'command_hybrid',
          lastChangedByCommandId: 'command_hybrid',
          correlationId: 'correlation_hybrid' as never,
        },
      }),
      instructorIds: [instructorId],
      totalSeats: 8,
      availableSeats: 8,
      duration: '2 days',
      description: 'On course doc',
      dates: 'March',
      bgImageUrl: 'https://example.com/hybrid.webp',
    };
    expect(legacyCourseDocumentFailsCanonicalParse(hybrid)).toBe(true);
    expect(classifyCourseDocumentExtraKey('duration')).toBe('presentation');
    expect(classifyCourseDocumentExtraKey('instructorIds')).toBe('legacy_operational');
    const plan = buildCourseDocumentShapeRepairPlan({
      courseId,
      courseDocument: hybrid,
      catalogContentDocument: baseManifest.presentation,
      repairedCourseDocument: buildCourseAggregateFromShapeRepair({
        persistedOperational: parseCanonicalCourseOperationalStateFromDocument(hybrid)!,
        manifest: baseManifest,
        revision: 7,
        audit: {
          createdByCommandId: 'command_hybrid',
          lastChangedByCommandId: 'command_hybrid',
          correlationId: 'correlation_hybrid' as never,
        },
      }),
    });
    expect(plan.extraKeys).toContain('instructorIds');
    expect(plan.keysMovedToCatalogContent).toContain('duration');
    expect(plan.passesStrictCourseSchemaAfterRepair).toBe(true);
  });

  it('blocks legacy admin writes when provisioning fingerprint is present', () => {
    expect(
      isCanonicalCourseProtectedFromLegacyAdminWrites({
        title: 'Hybrid',
        provisioningManifestFingerprint: computeCourseProvisioningManifestFingerprint(baseManifest),
        instructorIds: ['ins_legacy'],
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

  it('preserves occupied capacity during shape repair with seed_full manifest', () => {
    const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const hybrid = {
      ...buildCourseAggregateFromManifest({
        manifest: baseManifest,
        revision: 7,
        decidedAt,
        audit: {
          createdByCommandId: 'command_hybrid_capacity',
          lastChangedByCommandId: 'command_hybrid_capacity',
          correlationId: 'correlation_hybrid_capacity' as never,
        },
      }),
      capacity: { totalSeats: 8, availableSeats: 7 },
      instructorIds: [instructorId],
      totalSeats: 8,
      availableSeats: 7,
      duration: '2 days',
    };
    const persisted = parseCanonicalCourseOperationalStateFromDocument(hybrid);
    expect(persisted?.capacity).toEqual({ totalSeats: 8, availableSeats: 7 });
    expect(
      validatePersistedCourseOperationalStateAgainstManifest(persisted!, baseManifest)
    ).toEqual([]);
    const repaired = buildCourseAggregateFromShapeRepair({
      persistedOperational: persisted!,
      manifest: baseManifest,
      revision: 7,
      audit: {
        createdByCommandId: 'command_hybrid_capacity',
        lastChangedByCommandId: 'command_hybrid_capacity',
        correlationId: 'correlation_hybrid_capacity' as never,
      },
    });
    expect(repaired.capacity).toEqual({ totalSeats: 8, availableSeats: 7 });
    expect(
      buildCourseAggregateFromManifest({
        manifest: baseManifest,
        revision: 7,
        decidedAt,
        audit: {
          createdByCommandId: 'command_seed_full',
          lastChangedByCommandId: 'command_seed_full',
          correlationId: 'correlation_seed_full' as never,
        },
      }).capacity.availableSeats
    ).toBe(8);
  });

  it('preserves schedule projection revision during shape repair', () => {
    const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
    const hybrid = {
      ...buildCourseAggregateFromManifest({
        manifest: baseManifest,
        revision: 6,
        decidedAt,
        audit: {
          createdByCommandId: 'command_hybrid_schedule',
          lastChangedByCommandId: 'command_hybrid_schedule',
          correlationId: 'correlation_hybrid_schedule' as never,
        },
      }),
      scheduleProjection: {
        courseDayCount: 2,
        finalCourseDayEndsAt: deriveSchedulePlanFromManifest(baseManifest).finalCourseDayEndsAt,
        courseScheduleRevision: 6,
      },
      description: 'legacy contamination',
    };
    const persisted = parseCanonicalCourseOperationalStateFromDocument(hybrid);
    const repaired = buildCourseAggregateFromShapeRepair({
      persistedOperational: persisted!,
      manifest: baseManifest,
      revision: 6,
      audit: {
        createdByCommandId: 'command_hybrid_schedule',
        lastChangedByCommandId: 'command_hybrid_schedule',
        correlationId: 'correlation_hybrid_schedule' as never,
      },
    });
    expect(repaired.scheduleProjection.courseScheduleRevision).toBe(6);
    expect(
      buildCourseAggregateFromManifest({
        manifest: baseManifest,
        revision: 6,
        decidedAt,
        audit: {
          createdByCommandId: 'command_initial',
          lastChangedByCommandId: 'command_initial',
          correlationId: 'correlation_initial' as never,
        },
      }).scheduleProjection.courseScheduleRevision
    ).toBe(1);
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
