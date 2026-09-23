import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CourseCatalogContentInputSchema,
  CourseProvisioningManifestSchema,
  CourseIdSchema,
  InstructorIdSchema,
  AccountIdSchema,
  LESSON_PRICING_SETTINGS_ID,
  KztMinorUnitsSchema,
  canonicalJsonStringify,
} from '@ski-academy/shared-domain';

export const STAGING_PROJECT_ID = 'ski-school-staging' as const;
export const PRODUCTION_PROJECT_ID = 'ski-school-8f3ca' as const;
export const PROMOTION_MANIFEST_VERSION = 1 as const;
export const PROMOTION_PAGE_SIZE = 200;
export const PROMOTION_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

const LogicalConfigKeySchema = z.string().trim().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaPlaceholder = (mediaKey: string) => `promotion-media://${mediaKey}`;

const MediaReferenceSchema = z
  .object({
    mediaKey: LogicalConfigKeySchema,
    ownerKind: z.enum(['course', 'instructor', 'resort']),
    ownerLogicalKey: LogicalConfigKeySchema,
    fieldPath: z.string().min(1).max(256),
    sourceBucket: z.string().min(1).max(255),
    sourceObjectPath: z.string().min(1).max(1024),
    sha256: hashSchema,
    contentType: z.string().min(1).max(128),
  })
  .strict();

const InstructorProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    specialty: z.enum(['ski', 'snowboard', 'both']).optional(),
    languages: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    bio: z.string().trim().max(4000).optional(),
    avatarUrl: z.string().trim().min(1).max(2000).optional(),
    pricePerHourKZT: KztMinorUnitsSchema,
  })
  .strict();

const SkillConfigSchema = z
  .object({
    passPercentage: z.number().finite().min(0).max(100),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            levelTarget: z.number().int().min(1).max(4),
            section: z.string().max(500),
            sectionEn: z.string().max(500).optional(),
            num: z.string().max(32),
            title: z.string().max(2000),
            titleEn: z.string().max(2000).optional(),
            maxPoints: z.number().finite().min(0),
            controlPoints: z.number().finite().min(0),
            speedPoints: z.number().finite().min(0),
            techniquePoints: z.number().finite().min(0),
            radarDimension: z.string().max(64).optional(),
          })
          .strict()
      )
      .min(1)
      .max(512),
  })
  .strict();

const AchievementConfigSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            labelRu: z.string().max(500),
            labelEn: z.string().max(500),
            icon: z.string().max(64),
            order: z.number().finite().int().min(0).max(100_000),
            rule: z
              .object({
                type: z.enum([
                  'lessons_completed',
                  'hours_completed',
                  'streak_weeks',
                  'exercises_mastered',
                  'level_up',
                  'feedback_given',
                  'homework_done',
                  'course_graduate',
                  'skill_items_max',
                ]),
                count: z.number().finite().optional(),
                skillItemIds: z.array(z.string().min(1).max(128)).max(512).optional(),
              })
              .strict(),
          })
          .strict()
      )
      .max(512),
  })
  .strict();

const ResortSlidesSchema = z
  .object({
    slides: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            line1En: z.string().max(500),
            line1Ru: z.string().max(500),
            line2En: z.string().max(2000),
            line2Ru: z.string().max(2000),
            line3En: z.string().max(2000),
            line3Ru: z.string().max(2000),
            backgroundImage: z.string().min(1).max(2000),
            hidden: z.boolean().optional(),
          })
          .strict()
      )
      .max(128),
    slideIntervalSeconds: z.number().finite().int().min(1).max(600),
    slidesRandomOrder: z.boolean(),
  })
  .strict();

const SourceDocumentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('instructor'),
    logicalKey: LogicalConfigKeySchema,
    sourcePath: z.string().regex(/^instructors\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    sourceId: InstructorIdSchema,
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('course'),
    logicalKey: LogicalConfigKeySchema,
    sourcePath: z.string().regex(/^courses\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    sourceId: CourseIdSchema,
    sourceDayPaths: z.array(z.string().regex(/^courses\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/days\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('course_catalog_content'),
    logicalKey: LogicalConfigKeySchema,
    sourcePath: z.string().regex(/^course_catalog_content\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    sourceId: CourseIdSchema,
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('lesson_pricing_settings'),
    logicalKey: z.literal('lesson_booking'),
    sourcePath: z.literal('lesson_pricing_settings/lesson_booking'),
    sourceId: z.literal(LESSON_PRICING_SETTINGS_ID),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('skill_config'),
    logicalKey: z.literal('skill_config'),
    sourcePath: z.literal('settings/skill_config'),
    sourceId: z.literal('skill_config'),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('achievements_config'),
    logicalKey: z.literal('achievements_config'),
    sourcePath: z.literal('settings/achievements_config'),
    sourceId: z.literal('achievements_config'),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('instructor_filters'),
    logicalKey: z.literal('instructor_filters'),
    sourcePath: z.literal('settings/instructor_filters'),
    sourceId: z.literal('instructor_filters'),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
  z.object({
    kind: z.literal('resort_slides'),
    logicalKey: z.literal('resort_slides'),
    sourcePath: z.literal('resort_data/config'),
    sourceId: z.literal('resort_config'),
    selected: z.boolean(),
    sourceHash: hashSchema,
    payload: z.unknown(),
    issues: z.array(z.string().max(160)).optional(),
  }).strict(),
]);

const ManifestSchema = z
  .object({
    schemaVersion: z.literal(PROMOTION_MANIFEST_VERSION),
    sourceProjectId: z.string().min(1),
    exportedAt: z.string().datetime({ offset: true }),
    sourceDocuments: z.array(SourceDocumentSchema),
    mappings: z
      .object({
        instructors: z.array(
          z.object({
            logicalKey: LogicalConfigKeySchema,
            stagingInstructorId: InstructorIdSchema,
            productionInstructorId: InstructorIdSchema.optional(),
            productionAccountId: AccountIdSchema.optional(),
          }).strict()
        ),
        courses: z.array(
          z.object({
            logicalKey: LogicalConfigKeySchema,
            stagingCourseId: CourseIdSchema,
            productionCourseId: CourseIdSchema.optional(),
          }).strict()
        ),
      })
      .strict(),
    media: z.array(MediaReferenceSchema),
    excludedSummary: z
      .object({
        collectionCounts: z.record(z.string(), z.number().finite().int().nonnegative()),
        reasonCounts: z.record(z.string(), z.number().finite().int().nonnegative()),
        fixtureOwnedDocumentCount: z.number().finite().int().nonnegative(),
        excludedPaths: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type PromotionMediaReference = z.infer<typeof MediaReferenceSchema>;
export type PromotionSourceDocument = z.infer<typeof SourceDocumentSchema>;
export type ConfigPromotionManifest = z.infer<typeof ManifestSchema>;
export type PromotionStatus = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'CONFLICT' | 'SKIP';

export interface PromotionOperation {
  readonly operationId: string;
  readonly kind: PromotionSourceDocument['kind'] | 'instructor_link' | 'media';
  readonly logicalKey: string;
  readonly targetPath: string;
  readonly status: PromotionStatus;
  readonly changedFields: readonly string[];
  readonly sourceHash: string;
  readonly targetHash?: string;
  readonly targetPreconditionHash?: string;
  readonly reason?: string;
  readonly dependencyOrder: number;
}

export function stableHash(value: unknown): string {
  const normalized = value === undefined ? ['config-promotion:undefined'] : value;
  return createHash('sha256').update(canonicalJsonStringify(normalized)).digest('hex');
}

export function expectedSourceHash(
  record: Pick<PromotionSourceDocument, 'payload'>
): string {
  return stableHash(record.payload);
}

export function parsePromotionManifest(value: unknown): ConfigPromotionManifest {
  const manifest = ManifestSchema.parse(value);
  if (manifest.sourceProjectId !== STAGING_PROJECT_ID) {
    throw new Error(`PROMOTION: manifest source must be ${STAGING_PROJECT_ID}`);
  }
  const paths = new Set<string>();
  const logicalKeys = new Set<string>();
  for (const record of manifest.sourceDocuments) {
    if (paths.has(record.sourcePath)) throw new Error(`PROMOTION: duplicate source path ${record.sourcePath}`);
    paths.add(record.sourcePath);
    if (record.kind === 'instructor' || record.kind === 'course' || record.kind === 'course_catalog_content') {
      if (record.sourcePath.split('/').at(-1) !== record.sourceId) {
        throw new Error(`PROMOTION: source id does not match path ${record.sourcePath}`);
      }
      if (record.kind === 'course' && record.sourceDayPaths.some((path) => !path.startsWith(`${record.sourcePath}/days/`))) {
        throw new Error(`PROMOTION: CourseDay source paths do not match Course ${record.sourcePath}`);
      }
    }
    if (logicalKeys.has(`${record.kind}:${record.logicalKey}`)) {
      throw new Error(`PROMOTION: duplicate logical key ${record.kind}:${record.logicalKey}`);
    }
    logicalKeys.add(`${record.kind}:${record.logicalKey}`);
    if (expectedSourceHash(record) !== record.sourceHash) {
      throw new Error(`PROMOTION: source payload hash mismatch at ${record.sourcePath}`);
    }
    if (!record.issues?.length) validateSourcePayload(record);
    else assertAllowedPublicImageReferences(record);
  }
  assertNoSecretOrRuntimeFields(manifest);
  for (const mapping of manifest.mappings.instructors) {
    const record = manifest.sourceDocuments.find((item) => item.kind === 'instructor' && item.sourceId === mapping.stagingInstructorId);
    if (!record || record.logicalKey !== mapping.logicalKey) {
      throw new Error(`PROMOTION: instructor mapping does not match its source logical key: ${mapping.logicalKey}`);
    }
  }
  for (const mapping of manifest.mappings.courses) {
    const record = manifest.sourceDocuments.find((item) => item.kind === 'course' && item.sourceId === mapping.stagingCourseId);
    if (!record || record.logicalKey !== mapping.logicalKey) {
      throw new Error(`PROMOTION: Course mapping does not match its source logical key: ${mapping.logicalKey}`);
    }
  }
  assertUnique(manifest.mappings.instructors.map((entry) => entry.stagingInstructorId), 'instructor source mapping');
  assertUnique(manifest.mappings.instructors.flatMap((entry) => entry.productionInstructorId ? [entry.productionInstructorId] : []), 'production instructor mapping');
  assertUnique(manifest.mappings.instructors.flatMap((entry) => entry.productionAccountId ? [entry.productionAccountId] : []), 'production Account mapping');
  assertUnique(manifest.mappings.courses.map((entry) => entry.stagingCourseId), 'course source mapping');
  assertUnique(manifest.mappings.courses.map((entry) => entry.productionCourseId ?? entry.stagingCourseId), 'production course mapping');
  const mediaKeys = new Set<string>();
  for (const media of manifest.media) {
    if (mediaKeys.has(media.mediaKey)) throw new Error(`PROMOTION: duplicate media key ${media.mediaKey}`);
    mediaKeys.add(media.mediaKey);
    const owner = manifest.sourceDocuments.find((record) => record.logicalKey === media.ownerLogicalKey);
    if (!owner) throw new Error(`PROMOTION: media owner is missing: ${media.mediaKey}`);
    const allowedField =
      (media.ownerKind === 'instructor' && owner.kind === 'instructor' && media.fieldPath === 'avatarUrl') ||
      (media.ownerKind === 'course' && owner.kind === 'course_catalog_content' && media.fieldPath === 'bgImageUrl') ||
      (media.ownerKind === 'resort' && owner.kind === 'resort_slides' && /^slides\.\d+\.backgroundImage$/.test(media.fieldPath));
    if (!allowedField) throw new Error(`PROMOTION: media field is outside the promotion allowlist: ${media.fieldPath}`);
    const expectedObjectPath = media.ownerKind === 'instructor'
      ? `instructors/${owner.sourceId}.jpg`
      : media.ownerKind === 'course'
        ? `courses/${owner.sourceId}.webp`
        : undefined;
    if (expectedObjectPath && media.sourceObjectPath !== expectedObjectPath) {
      throw new Error(`PROMOTION: media object is outside the source allowlist: ${media.mediaKey}`);
    }
    if (media.ownerKind === 'resort' && !/^banners\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:png|jpe?g|webp)$/i.test(media.sourceObjectPath)) {
      throw new Error(`PROMOTION: banner object is outside the source allowlist: ${media.mediaKey}`);
    }
    const allowedContentType = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedContentType.has(media.contentType)) throw new Error(`PROMOTION: unsupported media content type: ${media.mediaKey}`);
    if (expectedObjectPath?.endsWith('.webp') && media.contentType !== 'image/webp') {
      throw new Error(`PROMOTION: course media content type does not match its path: ${media.mediaKey}`);
    }
    if (expectedObjectPath?.endsWith('.jpg') && media.contentType !== 'image/jpeg') {
      throw new Error(`PROMOTION: instructor media content type does not match its path: ${media.mediaKey}`);
    }
    if (media.ownerKind === 'resort') {
      const extension = media.contentType === 'image/jpeg' ? 'jpg' : media.contentType.split('/')[1];
      if (!media.sourceObjectPath.toLowerCase().endsWith(`.${extension}`)) {
        throw new Error(`PROMOTION: banner media content type does not match its path: ${media.mediaKey}`);
      }
    }
  }
  const referencedMediaKeys = new Set<string>();
  for (const record of manifest.sourceDocuments) {
    for (const entry of findMediaPlaceholderEntries(record.payload)) {
      const ref = entry.mediaKey;
      if (!mediaKeys.has(ref)) throw new Error(`PROMOTION: missing media reference ${ref}`);
      const media = manifest.media.find((item) => item.mediaKey === ref)!;
      referencedMediaKeys.add(ref);
      if (media.ownerLogicalKey !== record.logicalKey || media.fieldPath !== entry.fieldPath) {
        throw new Error(`PROMOTION: media reference does not match its field: ${record.sourcePath}`);
      }
    }
  }
  if (referencedMediaKeys.size !== mediaKeys.size) throw new Error('PROMOTION: unreferenced media entry in manifest');
  return manifest;
}

function assertNoSecretOrRuntimeFields(value: unknown): void {
  const forbidden = /^(?:password|token|linkedAccountId|rating|reviewsCount|revision|audit|testSessionId|dataScope)$/i;
  const visit = (item: unknown): void => {
    if (typeof item === 'string' && /[?&]token=[^&#]+/i.test(item)) {
      throw new Error('PROMOTION: download tokens are forbidden in the manifest');
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== 'object') return;
    for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
      if (forbidden.test(key)) throw new Error(`PROMOTION: forbidden manifest field ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

export function validateSourcePayload(record: PromotionSourceDocument): void {
  const schema = (() => {
    switch (record.kind) {
      case 'instructor':
        return InstructorProfileSchema;
      case 'course':
        return CourseProvisioningManifestSchema;
      case 'course_catalog_content':
        return CourseCatalogContentInputSchema;
      case 'lesson_pricing_settings':
        return z.object({
          additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema,
          maxParticipantsPerLesson: z.number().finite().int().min(1).max(Number.MAX_SAFE_INTEGER),
        }).strict();
      case 'skill_config':
        return SkillConfigSchema;
      case 'achievements_config':
        return AchievementConfigSchema;
      case 'instructor_filters':
        return z.object({ enabled: z.boolean() }).strict();
      case 'resort_slides':
        return ResortSlidesSchema;
    }
  })();
  schema.parse(record.payload);
  assertAllowedPublicImageReferences(record);
}

function assertAllowedPublicImageReferences(record: PromotionSourceDocument): void {
  const allowed = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    if (value === 'unsupported-media-reference') return Boolean(record.issues?.length);
    if (value.startsWith('promotion-media://')) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.hostname === 'storage.yandexcloud.net' &&
        parsed.pathname.startsWith('/carve/') && !parsed.search && !parsed.hash;
    } catch {
      return false;
    }
  };
  const payload = record.payload as Record<string, unknown>;
  if (record.kind === 'instructor' && payload.avatarUrl !== undefined && !allowed(payload.avatarUrl)) {
    throw new Error(`PROMOTION: instructor image reference is not public/allowlisted at ${record.sourcePath}`);
  }
  if (record.kind === 'course_catalog_content') {
    if (!allowed(payload.bgImageUrl)) {
      throw new Error(`PROMOTION: course image reference is not public/allowlisted at ${record.sourcePath}`);
    }
    if (Array.isArray(payload.galleryPhotos) && payload.galleryPhotos.some((value) => !allowed(value))) {
      throw new Error(`PROMOTION: gallery image reference is not public/allowlisted at ${record.sourcePath}`);
    }
  }
  if (record.kind === 'resort_slides' && Array.isArray(payload.slides) && payload.slides.some((slide) =>
    !slide || typeof slide !== 'object' || !allowed((slide as Record<string, unknown>).backgroundImage))) {
    throw new Error(`PROMOTION: banner image reference is not public/allowlisted at ${record.sourcePath}`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`PROMOTION: duplicate ${label}`);
}

export function findMediaPlaceholders(value: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === 'string' && item.startsWith('promotion-media://')) {
      found.push(item.slice('promotion-media://'.length));
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return found;
}

function findMediaPlaceholderEntries(value: unknown): Array<{ mediaKey: string; fieldPath: string }> {
  const found: Array<{ mediaKey: string; fieldPath: string }> = [];
  const visit = (item: unknown, path: string): void => {
    if (typeof item === 'string' && item.startsWith('promotion-media://')) {
      found.push({ mediaKey: item.slice('promotion-media://'.length), fieldPath: path });
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((nested, index) => visit(nested, path ? `${path}.${index}` : String(index)));
      return;
    }
    if (item && typeof item === 'object') {
      Object.entries(item as Record<string, unknown>).forEach(([key, nested]) =>
        visit(nested, path ? `${path}.${key}` : key));
    }
  };
  visit(value, '');
  return found;
}

export function mediaPlaceholderUrl(mediaKey: string): string {
  return mediaPlaceholder(mediaKey);
}

export function classifyPromotionStatus(input: {
  readonly sourceExists: boolean;
  readonly targetExists: boolean;
  readonly sourceHash: string;
  readonly targetHash?: string;
  readonly conflictReason?: string;
}): PromotionStatus {
  if (input.conflictReason) return 'CONFLICT';
  if (!input.sourceExists) return 'SKIP';
  if (!input.targetExists) return 'CREATE';
  return input.sourceHash === input.targetHash ? 'UNCHANGED' : 'UPDATE';
}

export function changedFields(
  source: Readonly<Record<string, unknown>>,
  target: Readonly<Record<string, unknown>> | undefined
): string[] {
  const keys = [...new Set([...Object.keys(source), ...Object.keys(target ?? {})])].sort();
  return keys.filter((key) => stableHash(source[key]) !== stableHash(target?.[key]));
}

export function buildOperation(input: Omit<PromotionOperation, 'operationId'>): PromotionOperation {
  return {
    ...input,
    changedFields: [...input.changedFields].sort(),
    operationId: stableHash({
      kind: input.kind,
      logicalKey: input.logicalKey,
      targetPath: input.targetPath,
      sourceHash: input.sourceHash,
    }).slice(0, 32),
  };
}

export function sortOperations(operations: readonly PromotionOperation[]): PromotionOperation[] {
  return [...operations].sort(
    (left, right) =>
      left.dependencyOrder - right.dependencyOrder ||
      left.targetPath.localeCompare(right.targetPath) ||
      left.operationId.localeCompare(right.operationId)
  );
}
