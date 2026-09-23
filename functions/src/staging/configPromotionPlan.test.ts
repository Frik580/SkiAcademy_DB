import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseProvisioningManifestSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  buildCourseAggregateFromManifest,
  resolveManifestDayInterval,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  mediaPlaceholderUrl,
  parsePromotionManifest,
  stableHash,
  type PromotionSourceDocument,
} from './configPromotionContract';
import { planConfigPromotion, type PromotionTargetState } from './configPromotionPlan';

const stageInstructorId = InstructorIdSchema.parse('instructor_stage_alpha');
const prodInstructorId = InstructorIdSchema.parse('instructor_prod_alpha');
const prodAccountId = AccountIdSchema.parse('account_prod_alpha');
const stageCourseId = CourseIdSchema.parse('course_stage_alpha');
const prodCourseId = CourseIdSchema.parse('course_prod_alpha');
const courseDayId = CourseDayIdSchema.parse('course_day_alpha');
const instant = timestampFromDate(new Date('2026-09-01T00:00:00.000Z'));
const correlationId = CorrelationIdSchema.parse('correlation_promotion_test');
const commandId = CommandIdSchema.parse('command_promotion_test');

const instructorPayload = { name: 'Alpine Instructor', specialty: 'ski' as const, pricePerHourKZT: 15_000 };
const coursePayload = CourseProvisioningManifestSchema.parse({
  courseId: stageCourseId,
  title: 'Alpine Basics',
  price: KztMinorUnitsSchema.parse(50_000),
  totalSeats: 8,
  capacityPolicy: { kind: 'seed_full' },
  instructorRosterIds: [stageInstructorId],
  timeZone: 'Asia/Qyzylorda',
  days: [{
    courseDayId,
    dayOrder: 1,
    localDate: '2026-10-01',
    localTime: '10:00',
    durationMinutes: 120,
    instructorId: stageInstructorId,
  }],
});

function records(includeCourse = true): PromotionSourceDocument[] {
  const result: PromotionSourceDocument[] = [{
    kind: 'instructor',
    logicalKey: `instructor:${stageInstructorId}`,
    sourcePath: `instructors/${stageInstructorId}`,
    sourceId: stageInstructorId,
    selected: true,
    sourceHash: stableHash(instructorPayload),
    payload: instructorPayload,
  }];
  if (includeCourse) result.push({
    kind: 'course',
    logicalKey: `course:${stageCourseId}`,
    sourcePath: `courses/${stageCourseId}`,
    sourceDayPaths: [`courses/${stageCourseId}/days/${courseDayId}`],
    sourceId: stageCourseId,
    selected: true,
    sourceHash: stableHash(coursePayload),
    payload: coursePayload,
  });
  return result;
}

function manifest(input: {
  includeCourse?: boolean;
  includeContent?: boolean;
  selectedInstructor?: boolean;
  selectedCourse?: boolean;
  instructorMapping?: boolean;
  productionIdentity?: boolean;
} = {}) {
  const sourceDocuments = records(input.includeCourse !== false);
  if (input.includeContent) {
    const payload = {
      duration: 'One day',
      description: 'A presentation-only course description',
      dates: '1 October 2026',
      bgImageUrl: 'https://storage.yandexcloud.net/carve/course.webp',
    };
    sourceDocuments.push({
      kind: 'course_catalog_content',
      logicalKey: `course:${stageCourseId}`,
      sourcePath: `course_catalog_content/${stageCourseId}`,
      sourceId: stageCourseId,
      selected: true,
      sourceHash: stableHash(payload),
      payload,
    });
  }
  if (input.selectedInstructor === false) {
    const instructor = sourceDocuments[0]!;
    sourceDocuments[0] = { ...instructor, selected: false } as PromotionSourceDocument;
  }
  if (input.selectedCourse === false) {
    const index = sourceDocuments.findIndex((record) => record.kind === 'course');
    if (index >= 0) sourceDocuments[index] = { ...sourceDocuments[index]!, selected: false } as PromotionSourceDocument;
  }
  return parsePromotionManifest({
    schemaVersion: 1,
    sourceProjectId: 'ski-school-staging',
    exportedAt: '2026-09-24T00:00:00.000Z',
    sourceDocuments,
    mappings: {
      instructors: input.instructorMapping === false ? [] : [{
        logicalKey: `instructor:${stageInstructorId}`,
        stagingInstructorId: stageInstructorId,
        ...(input.productionIdentity === false ? {} : {
          productionInstructorId: prodInstructorId,
          productionAccountId: prodAccountId,
        }),
      }],
      courses: input.includeCourse === false ? [] : [{
        logicalKey: `course:${stageCourseId}`,
        stagingCourseId: stageCourseId,
        productionCourseId: prodCourseId,
      }],
    },
    media: [],
    excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
  });
}

function targetState(options: {
  instructor?: Record<string, unknown>;
  account?: Record<string, unknown>;
  course?: Record<string, unknown>;
  days?: readonly Record<string, unknown>[];
  config?: Record<string, unknown>;
  unknown?: Record<string, unknown>;
} = {}): PromotionTargetState {
  const account = AccountSchema.parse({
    accountId: prodAccountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
    audit: { createdByCommandId: commandId, lastChangedByCommandId: commandId, correlationId },
  });
  const instructor = {
    id: prodInstructorId,
    ...instructorPayload,
    linkedAccountId: prodAccountId,
    revision: 1,
    updatedAt: instant,
  };
  return {
    documents: {
      [`instructors/${prodInstructorId}`]: options.instructor ?? instructor,
      [`users/${prodAccountId}`]: options.account ?? { ...account, instructorId: prodInstructorId },
      ...(options.course ? { [`courses/${prodCourseId}`]: options.course } : {}),
      ...(options.config ? { 'settings/instructor_filters': options.config } : {}),
      ...(options.unknown ? { 'bookings/untouched': options.unknown } : {}),
    },
    courseDaysById: options.days ? { [prodCourseId]: options.days } : { [prodCourseId]: [] },
    mediaHashes: {},
  };
}

function existingCourseFixture(options: { totalSeats?: number; localDate?: string; availableSeats?: number } = {}) {
  const mappedManifest = CourseProvisioningManifestSchema.parse({
    ...coursePayload,
    courseId: prodCourseId,
    totalSeats: options.totalSeats ?? 8,
    capacityPolicy: { kind: 'explicit', availableSeats: options.availableSeats ?? 2 },
    instructorRosterIds: [prodInstructorId],
    days: [{
      ...coursePayload.days[0]!,
      localDate: options.localDate ?? coursePayload.days[0]!.localDate,
      instructorId: prodInstructorId,
    }],
  });
  const course = buildCourseAggregateFromManifest({
    manifest: mappedManifest,
    revision: 1,
    decidedAt: instant,
    audit: { createdByCommandId: commandId, lastChangedByCommandId: commandId, correlationId },
  });
  const dayInput = mappedManifest.days[0]!;
  const day = CourseDaySchema.parse({
    courseId: prodCourseId,
    courseDayId: courseDayId,
    dayOrder: dayInput.dayOrder,
    interval: resolveManifestDayInterval(dayInput, mappedManifest.timeZone).interval,
    timeZone: mappedManifest.timeZone,
    actualInstructorIds: [prodInstructorId],
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
    audit: { createdByCommandId: commandId, lastChangedByCommandId: commandId, correlationId },
  });
  return { course: course as unknown as Record<string, unknown>, day: day as unknown as Record<string, unknown> };
}

describe('staging configuration promotion plan', () => {
  it('reports a missing instructor mapping as CONFLICT', () => {
    const plan = planConfigPromotion(manifest({ instructorMapping: false }), targetState());
    expect(plan.operations.find((operation) => operation.kind === 'instructor')?.status).toBe('CONFLICT');
  });

  it('requires production instructor and Account identity bootstrap before promotion', () => {
    const plan = planConfigPromotion(manifest({ productionIdentity: false }), targetState());
    expect(plan.operations.find((operation) => operation.kind === 'instructor')?.reason).toBe('production_identity_mapping_required');
    const missingTarget = planConfigPromotion(manifest(), { documents: {}, courseDaysById: {}, mediaHashes: {} });
    expect(missingTarget.operations.find((operation) => operation.kind === 'instructor')?.reason).toBe('production_identity_bootstrap_required');
  });

  it('conflicts when an operator mapping points at an incompatible production Account', () => {
    const state = targetState({ account: { ...targetState().documents[`users/${prodAccountId}`], instructorId: 'instructor_other' } });
    const plan = planConfigPromotion(manifest(), state);
    expect(plan.operations.find((operation) => operation.kind === 'instructor')?.reason).toBe('production_identity_mapping_conflict');
    expect(plan.operations.find((operation) => operation.kind === 'course')?.status).toBe('CONFLICT');
  });

  it('rejects TEST-scoped production Instructor and Account identity records', () => {
    const instructor = { ...targetState().documents[`instructors/${prodInstructorId}`], dataScope: 'test' };
    const instructorPlan = planConfigPromotion(manifest(), targetState({ instructor }));
    expect(instructorPlan.operations.find((operation) => operation.kind === 'instructor')?.reason)
      .toBe('production_identity_mapping_conflict');
    const account = { ...targetState().documents[`users/${prodAccountId}`], testSessionId: 'test-session' };
    const accountPlan = planConfigPromotion(manifest(), targetState({ account }));
    expect(accountPlan.operations.find((operation) => operation.kind === 'instructor')?.reason)
      .toBe('production_identity_mapping_conflict');
  });

  it('conflicts when the mapped production Instructor is unavailable for a new Course', () => {
    const fixture = targetState({ instructor: { ...targetState().documents[`instructors/${prodInstructorId}`], isAvailable: false } });
    const plan = planConfigPromotion(manifest(), fixture);
    expect(plan.operations.find((operation) => operation.kind === 'course')).toMatchObject({
      status: 'CONFLICT',
      reason: 'production_instructor_unavailable',
    });
  });

  it('plans Course creation only when production Course is absent and dependencies map', () => {
    const plan = planConfigPromotion(manifest(), targetState());
    expect(plan.operations.find((operation) => operation.kind === 'course')).toMatchObject({ status: 'CREATE', targetPath: `courses/${prodCourseId}` });
  });

  it('copies an Instructor avatar before applying its public profile reference', () => {
    const base = manifest({ includeCourse: false });
    const source = base.sourceDocuments[0]!;
    const mediaKey = 'media:instructor:alpha-avatar';
    const payload = { ...instructorPayload, avatarUrl: mediaPlaceholderUrl(mediaKey) };
    const sourceWithAvatar = { ...source, payload, sourceHash: stableHash(payload) };
    const withMedia = parsePromotionManifest({
      ...base,
      sourceDocuments: [sourceWithAvatar],
      media: [{
        mediaKey,
        ownerKind: 'instructor',
        ownerLogicalKey: source.logicalKey,
        fieldPath: 'avatarUrl',
        sourceBucket: 'ski-school-staging.firebasestorage.app',
        sourceObjectPath: `instructors/${stageInstructorId}.jpg`,
        sha256: 'a'.repeat(64),
        contentType: 'image/jpeg',
      }],
    });
    const plan = planConfigPromotion(withMedia, targetState());
    const mediaIndex = plan.operations.findIndex((operation) => operation.kind === 'media');
    const profileIndex = plan.operations.findIndex((operation) => operation.kind === 'instructor');
    expect(plan.operations[mediaIndex]?.status).toBe('CREATE');
    expect(mediaIndex).toBeLessThan(profileIndex);
  });

  it('gives repeated banner binaries distinct destinations within one apply plan', () => {
    const ownerKey = 'resort_slides';
    const firstKey = 'media:banner:first';
    const secondKey = 'media:banner:second';
    const slide = (id: string, backgroundImage: string) => ({
      id,
      line1En: '', line1Ru: '', line2En: '', line2Ru: '', line3En: '', line3Ru: '', backgroundImage,
    });
    const payload = {
      slides: [
        slide('first', mediaPlaceholderUrl(firstKey)),
        slide('second', mediaPlaceholderUrl(secondKey)),
      ],
      slideIntervalSeconds: 12,
      slidesRandomOrder: false,
    };
    const hash = 'c'.repeat(64);
    const sourceRecord: PromotionSourceDocument = {
      kind: 'resort_slides',
      logicalKey: ownerKey,
      sourcePath: 'resort_data/config',
      sourceId: 'resort_config',
      selected: true,
      sourceHash: stableHash(payload),
      payload,
    };
    const withMedia = parsePromotionManifest({
      schemaVersion: 1,
      sourceProjectId: 'ski-school-staging',
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceDocuments: [sourceRecord],
      mappings: { instructors: [], courses: [] },
      media: [firstKey, secondKey].map((mediaKey, index) => ({
        mediaKey,
        ownerKind: 'resort',
        ownerLogicalKey: ownerKey,
        fieldPath: `slides.${index}.backgroundImage`,
        sourceBucket: 'ski-school-staging.firebasestorage.app',
        sourceObjectPath: `banners/banner-${index + 1}.webp`,
        sha256: hash,
        contentType: 'image/webp',
      })),
      excludedSummary: { collectionCounts: {}, reasonCounts: {}, fixtureOwnedDocumentCount: 0, excludedPaths: [] },
    });
    const plan = planConfigPromotion(withMedia, targetState());
    const mediaOperations = plan.operations.filter((operation) => operation.kind === 'media');
    expect(mediaOperations).toHaveLength(2);
    expect(mediaOperations[0]?.targetPath).not.toBe(mediaOperations[1]?.targetPath);
    expect(mediaOperations.map((operation) => operation.targetPath)).toEqual(
      [firstKey, secondKey].map((mediaKey) => `promotion-assets/config/${hash}-${stableHash(mediaKey)}.webp`)
    );
  });

  it('allows an existing Course when only transactional available-seat state differs', () => {
    const fixture = existingCourseFixture({ availableSeats: 2 });
    const plan = planConfigPromotion(manifest(), targetState({ course: fixture.course, days: [fixture.day] }));
    expect(plan.operations.find((operation) => operation.kind === 'course')?.status).toBe('UNCHANGED');
  });

  it('conflicts on an existing Course capacity change', () => {
    const fixture = existingCourseFixture({ totalSeats: 7, availableSeats: 2 });
    const plan = planConfigPromotion(manifest(), targetState({ course: fixture.course, days: [fixture.day] }));
    expect(plan.operations.find((operation) => operation.kind === 'course')?.reason).toBe('existing_course_core_change_requires_separate_workflow');
  });

  it('conflicts on an existing Course schedule change', () => {
    const fixture = existingCourseFixture({ localDate: '2026-10-02' });
    const plan = planConfigPromotion(manifest(), targetState({ course: fixture.course, days: [fixture.day] }));
    expect(plan.operations.find((operation) => operation.kind === 'course')?.reason).toBe('existing_course_core_change_requires_separate_workflow');
  });

  it('allows presentation-only content after a new Course is canonically planned', () => {
    const plan = planConfigPromotion(manifest({ includeContent: true }), targetState());
    expect(plan.operations.find((operation) => operation.kind === 'course')?.status).toBe('CREATE');
    expect(plan.operations.find((operation) => operation.kind === 'course_catalog_content')?.status).toBe('CREATE');
  });

  it('never enumerates or deletes unknown production documents', () => {
    const state = targetState({ unknown: { transaction: 'do-not-touch' } });
    const plan = planConfigPromotion(manifest(), state);
    expect(plan.operations.some((operation) => operation.targetPath === 'bookings/untouched')).toBe(false);
    expect(plan.operations.every((operation) => !String(operation.status).includes('DELETE'))).toBe(true);
  });

  it('makes a second plan UNCHANGED after an allowlisted settings update', () => {
    const source = manifest({ includeCourse: false });
    const configSource = {
      kind: 'instructor_filters' as const,
      logicalKey: 'instructor_filters' as const,
      sourcePath: 'settings/instructor_filters' as const,
      sourceId: 'instructor_filters' as const,
      selected: true,
      sourceHash: stableHash({ enabled: true }),
      payload: { enabled: true },
    };
    const withConfig = parsePromotionManifest({ ...source, sourceDocuments: [configSource], mappings: { instructors: [], courses: [] } });
    const first = planConfigPromotion(withConfig, { documents: { 'settings/instructor_filters': { enabled: false, unrelated: 'preserved' } }, courseDaysById: {}, mediaHashes: {} });
    expect(first.operations[0]?.status).toBe('UPDATE');
    const second = planConfigPromotion(withConfig, { documents: { 'settings/instructor_filters': { enabled: true, unrelated: 'preserved' } }, courseDaysById: {}, mediaHashes: {} });
    expect(second.operations[0]?.status).toBe('UNCHANGED');
  });

  it('emits only allowlisted public instructor fields and excludes staging Account IDs', () => {
    const value = manifest();
    const encoded = JSON.stringify(value.sourceDocuments);
    expect(encoded).not.toContain('linkedAccountId');
    expect(encoded).not.toContain('account_prod_alpha');
    expect(value.sourceDocuments[0]?.payload).toEqual(instructorPayload);
  });
});
