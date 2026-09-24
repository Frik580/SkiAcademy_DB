import { parsePersistedCanonicalScope } from '@ski-academy/shared-domain';
import { parseLessonPricingSettings } from '../canonical/pricing/lessonPricingSettingsStore';
import {
  buildOperation,
  changedFields,
  sortOperations,
  stableHash,
  validateSourcePayload,
  type ConfigPromotionManifest,
  type PromotionMediaReference,
  type PromotionOperation,
  type PromotionSourceDocument,
} from './configPromotionContract';

export interface PromotionTargetState {
  readonly documents: Readonly<Record<string, Record<string, unknown> | undefined>>;
  readonly mediaHashes: Readonly<Record<string, string | undefined>>;
  readonly mediaVersions?: Readonly<Record<string, string | undefined>>;
  readonly mediaUrlReady?: Readonly<Record<string, boolean | undefined>>;
}

export interface PromotionPlan {
  readonly operations: readonly PromotionOperation[];
  readonly manifestHash: string;
  readonly hasConflicts: boolean;
}

export function planConfigPromotion(
  manifest: ConfigPromotionManifest,
  target: PromotionTargetState
): PromotionPlan {
  const operations: PromotionOperation[] = [];
  for (const record of manifest.sourceDocuments) {
    if (!record.selected) {
      operations.push(buildOperation({
        kind: record.kind, logicalKey: record.logicalKey, targetPath: record.sourcePath,
        status: 'SKIP', changedFields: [], sourceHash: record.sourceHash,
        reason: 'not_selected', dependencyOrder: 50,
      }));
      continue;
    }
    if (record.issues?.length) {
      operations.push(buildOperation({
        kind: record.kind,
        logicalKey: record.logicalKey,
        targetPath: record.sourcePath,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: record.sourceHash,
        reason: record.issues.join(','),
        dependencyOrder: 50,
      }));
      continue;
    }
    const source = record.payload as Record<string, unknown>;
    const targetPath = record.sourcePath;
    const raw = target.documents[targetPath];
    if (raw && isTestOrMalformedScope(raw)) {
      operations.push(buildOperation({
        kind: record.kind,
        logicalKey: record.logicalKey,
        targetPath,
        status: 'CONFLICT',
        changedFields: [],
        sourceHash: stableHash(source),
        reason: 'target_config_not_live',
        dependencyOrder: 50,
      }));
      continue;
    }
    const current = raw ? configProjection(record.kind, raw) : undefined;
    let targetShapeConflict = false;
    if (raw && current) {
      try {
        validateSourcePayload({ ...record, payload: current, sourceHash: stableHash(current) });
      } catch {
        targetShapeConflict = true;
      }
    }
    const comparable = current
      ? normalizeTargetMedia(current, source, manifest.media, record.logicalKey, target.mediaHashes)
      : undefined;
    const fields = changedFields(source, comparable);
    operations.push(buildOperation({
      kind: record.kind,
      logicalKey: record.logicalKey,
      targetPath,
      status: targetShapeConflict ? 'CONFLICT' : fields.length ? (raw ? 'UPDATE' : 'CREATE') : 'UNCHANGED',
      changedFields: targetShapeConflict ? [] : fields,
      sourceHash: stableHash(source),
      ...(comparable ? { targetHash: stableHash(comparable) } : {}),
      targetPreconditionHash: stableHash(raw ?? null),
      ...(targetShapeConflict ? { reason: 'target_config_shape_conflict' } : {}),
      dependencyOrder: 50,
    }));
  }

  for (const media of manifest.media) {
    const ownerRecord = manifest.sourceDocuments.find((item) =>
      item.kind === 'resort_slides' && item.logicalKey === media.ownerLogicalKey
    );
    if (!ownerRecord?.selected || ownerRecord.issues?.length) {
      operations.push(buildOperation({
        kind: 'media', logicalKey: media.mediaKey, targetPath: `media/${media.mediaKey}`,
        status: 'SKIP', changedFields: [], sourceHash: media.sha256,
        reason: ownerRecord?.issues?.length ? 'owner_source_conflict' : 'owner_not_selected', dependencyOrder: 5,
      }));
      continue;
    }
    const targetPath = destinationMediaPath(media);
    const targetHash = target.mediaHashes[targetPath];
    const ready = target.mediaUrlReady?.[targetPath] !== false;
    const status = targetHash === undefined ? 'CREATE' : targetHash === media.sha256 && ready ? 'UNCHANGED' : 'UPDATE';
    operations.push(buildOperation({
      kind: 'media',
      logicalKey: media.mediaKey,
      targetPath,
      status,
      changedFields: status === 'UNCHANGED' ? [] : targetHash === media.sha256 ? ['download_token'] : ['binary'],
      sourceHash: media.sha256,
      ...(targetHash ? { targetHash } : {}),
      targetPreconditionHash: stableHash({ hash: targetHash ?? null, generation: target.mediaVersions?.[targetPath] ?? null, ready }),
      dependencyOrder: 5,
    }));
  }

  const ordered = sortOperations(operations);
  return {
    operations: ordered,
    manifestHash: stableHash({
      schemaVersion: manifest.schemaVersion,
      sourceProjectId: manifest.sourceProjectId,
      sourceDocuments: manifest.sourceDocuments.map(({ sourcePath, sourceHash }) => ({ sourcePath, sourceHash })),
      media: manifest.media.map(({ mediaKey, sha256 }) => ({ mediaKey, sha256 })),
    }),
    hasConflicts: ordered.some((item) => item.status === 'CONFLICT'),
  };
}

export function configProjection(kind: PromotionSourceDocument['kind'], raw: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'lesson_pricing_settings': {
      const parsed = parseLessonPricingSettings(raw);
      return parsed
        ? {
            additionalParticipantSurchargePerHourKzt: parsed.additionalParticipantSurchargePerHourKzt,
            maxParticipantsPerLesson: parsed.maxParticipantsPerLesson,
          }
        : {};
    }
    case 'skill_config':
      return pick(raw, ['passPercentage', 'items']);
    case 'achievements_config':
      return pick(raw, ['items']);
    case 'instructor_filters':
      return pick(raw, ['enabled']);
    case 'resort_slides':
      return pick(raw, ['slides', 'slideIntervalSeconds', 'slidesRandomOrder']);
  }
}

function pick(raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]));
}

function isTestOrMalformedScope(raw: Record<string, unknown>): boolean {
  if (raw.testSessionId !== undefined) return true;
  try {
    return parsePersistedCanonicalScope(raw, { allowLegacyLive: true }).dataScope !== 'live';
  } catch {
    return true;
  }
}

export function destinationMediaPath(media: PromotionMediaReference): string {
  const extension = media.contentType === 'image/png' ? 'png' : media.contentType === 'image/jpeg' ? 'jpg' : 'webp';
  return `promotion-assets/config/${media.sha256}-${stableHash(media.mediaKey)}.${extension}`;
}

function normalizeTargetMedia(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  mediaReferences: readonly PromotionMediaReference[],
  ownerLogicalKey: string,
  targetMediaHashes: Readonly<Record<string, string | undefined>>
): Record<string, unknown> {
  const normalized = structuredClone(target) as Record<string, unknown>;
  for (const media of mediaReferences) {
    if (media.ownerKind !== 'resort' || media.ownerLogicalKey !== ownerLogicalKey) continue;
    const expected = getPathValue(source, media.fieldPath);
    const current = getPathValue(target, media.fieldPath);
    if (typeof expected !== 'string' || !expected.startsWith('promotion-media://') || typeof current !== 'string') continue;
    const destPath = destinationMediaPath(media);
    const parsed = parseFirebaseStorageUrl(current);
    if (parsed?.objectPath === destPath && targetMediaHashes[destPath] === media.sha256) {
      setPathValue(normalized, media.fieldPath, expected);
    }
  }
  return normalized;
}

function parseFirebaseStorageUrl(value: string): { bucket: string; objectPath: string } | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'firebasestorage.googleapis.com') return undefined;
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(parsed.pathname);
    if (!match) return undefined;
    return { bucket: decodeURIComponent(match[1]!), objectPath: decodeURIComponent(match[2]!) };
  } catch {
    return undefined;
  }
}

function getPathValue(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}

function setPathValue(value: Record<string, unknown>, path: string, replacement: unknown): void {
  const keys = path.split('.');
  let cursor: Record<string, unknown> | unknown[] = value;
  for (const key of keys.slice(0, -1)) {
    const next = Array.isArray(cursor) ? cursor[Number(key)] : cursor[key];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown> | unknown[];
  }
  const finalKey = keys[keys.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(finalKey)] = replacement;
  else cursor[finalKey] = replacement;
}
