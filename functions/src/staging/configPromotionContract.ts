import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  LESSON_PRICING_SETTINGS_ID,
  KztMinorUnitsSchema,
  canonicalJsonStringify,
  isSupportedResortSlideLogicalImageKey,
} from '@ski-academy/shared-domain';

export const STAGING_PROJECT_ID = 'ski-school-staging' as const;
export const PRODUCTION_PROJECT_ID = 'ski-school-8f3ca' as const;
export const PROMOTION_MANIFEST_VERSION = 2 as const;
export const PROMOTION_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

const LogicalConfigKeySchema = z.string().trim().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaPlaceholder = (mediaKey: string) => `promotion-media://${mediaKey}`;

const MediaReferenceSchema = z
  .object({
    mediaKey: LogicalConfigKeySchema,
    ownerKind: z.literal('resort'),
    ownerLogicalKey: LogicalConfigKeySchema,
    fieldPath: z.string().min(1).max(256),
    sourceBucket: z.string().min(1).max(255),
    sourceObjectPath: z.string().min(1).max(1024),
    sha256: hashSchema,
    contentType: z.string().min(1).max(128),
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

const LessonPricingPayloadSchema = z
  .object({
    additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema,
    maxParticipantsPerLesson: z.number().finite().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const SourceDocumentSchema = z.discriminatedUnion('kind', [
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
  readonly kind: PromotionSourceDocument['kind'] | 'media';
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROMOTION: manifest is not an object');
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== PROMOTION_MANIFEST_VERSION) {
    throw new Error(
      `PROMOTION: unsupported manifest schemaVersion ${String(record.schemaVersion)}; expected ${PROMOTION_MANIFEST_VERSION}. Re-export global configuration. Older business-entity promotion manifests are not accepted.`
    );
  }
  if ('mappings' in record) {
    throw new Error('PROMOTION: business-entity mappings are not part of the global configuration manifest');
  }
  const manifest = ManifestSchema.parse(value);
  if (manifest.sourceProjectId !== STAGING_PROJECT_ID) {
    throw new Error(`PROMOTION: manifest source must be ${STAGING_PROJECT_ID}`);
  }
  const paths = new Set<string>();
  const logicalKeys = new Set<string>();
  for (const sourceDocument of manifest.sourceDocuments) {
    if (paths.has(sourceDocument.sourcePath)) {
      throw new Error(`PROMOTION: duplicate source path ${sourceDocument.sourcePath}`);
    }
    paths.add(sourceDocument.sourcePath);
    if (logicalKeys.has(`${sourceDocument.kind}:${sourceDocument.logicalKey}`)) {
      throw new Error(`PROMOTION: duplicate logical key ${sourceDocument.kind}:${sourceDocument.logicalKey}`);
    }
    logicalKeys.add(`${sourceDocument.kind}:${sourceDocument.logicalKey}`);
    if (expectedSourceHash(sourceDocument) !== sourceDocument.sourceHash) {
      throw new Error(`PROMOTION: source payload hash mismatch at ${sourceDocument.sourcePath}`);
    }
    if (!sourceDocument.issues?.length) validateSourcePayload(sourceDocument);
    else assertAllowedPublicImageReferences(sourceDocument);
  }
  assertNoSecretOrRuntimeFields(manifest);
  const mediaKeys = new Set<string>();
  for (const media of manifest.media) {
    if (mediaKeys.has(media.mediaKey)) throw new Error(`PROMOTION: duplicate media key ${media.mediaKey}`);
    mediaKeys.add(media.mediaKey);
    const owner = manifest.sourceDocuments.find((item) => item.logicalKey === media.ownerLogicalKey);
    if (!owner || owner.kind !== 'resort_slides') {
      throw new Error(`PROMOTION: media owner is missing: ${media.mediaKey}`);
    }
    if (!/^slides\.\d+\.backgroundImage$/.test(media.fieldPath)) {
      throw new Error(`PROMOTION: media field is outside the promotion allowlist: ${media.fieldPath}`);
    }
    if (!/^banners\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:png|jpe?g|webp)$/i.test(media.sourceObjectPath)) {
      throw new Error(`PROMOTION: banner object is outside the source allowlist: ${media.mediaKey}`);
    }
    const allowedContentType = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedContentType.has(media.contentType)) {
      throw new Error(`PROMOTION: unsupported media content type: ${media.mediaKey}`);
    }
    const extension = media.contentType === 'image/jpeg' ? 'jpg' : media.contentType.split('/')[1];
    if (!media.sourceObjectPath.toLowerCase().endsWith(`.${extension}`)) {
      throw new Error(`PROMOTION: banner media content type does not match its path: ${media.mediaKey}`);
    }
  }
  const referencedMediaKeys = new Set<string>();
  for (const sourceDocument of manifest.sourceDocuments) {
    for (const entry of findMediaPlaceholderEntries(sourceDocument.payload)) {
      if (!mediaKeys.has(entry.mediaKey)) throw new Error(`PROMOTION: missing media reference ${entry.mediaKey}`);
      const media = manifest.media.find((item) => item.mediaKey === entry.mediaKey)!;
      referencedMediaKeys.add(entry.mediaKey);
      if (media.ownerLogicalKey !== sourceDocument.logicalKey || media.fieldPath !== entry.fieldPath) {
        throw new Error(`PROMOTION: media reference does not match its field: ${sourceDocument.sourcePath}`);
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
      case 'lesson_pricing_settings':
        return LessonPricingPayloadSchema;
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

export function isAllowedResortSlideYandexUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'storage.yandexcloud.net' ||
      !parsed.pathname.startsWith('/carve/') || parsed.search || parsed.hash) {
      return false;
    }
    const pathSegments = parsed.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment).toLowerCase());
    return pathSegments[0] === 'carve' && !['courses', 'instructors', 'image-cache'].includes(pathSegments[1] ?? '');
  } catch {
    return false;
  }
}

function assertAllowedPublicImageReferences(record: PromotionSourceDocument): void {
  if (record.kind !== 'resort_slides') return;
  const allowed = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    if (value === 'unsupported-media-reference') return Boolean(record.issues?.length);
    if (value.startsWith('promotion-media://')) return true;
    if (isSupportedResortSlideLogicalImageKey(value)) return true;
    return isAllowedResortSlideYandexUrl(value);
  };
  const payload = record.payload as Record<string, unknown>;
  if (Array.isArray(payload.slides) && payload.slides.some((slide) =>
    !slide || typeof slide !== 'object' || !allowed((slide as Record<string, unknown>).backgroundImage))) {
    throw new Error(`PROMOTION: banner image reference is not public/allowlisted at ${record.sourcePath}`);
  }
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
