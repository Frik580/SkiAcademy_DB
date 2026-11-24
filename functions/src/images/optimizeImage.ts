import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { getOrInitApp } from '../adminApp';
import { MAX_IMAGE_PIXELS } from '../security/mediaTypePolicy';
import { canonicalImageSource, fetchImageSource, type ImageFailure } from './imageSource';
import type { ImageMissAdmission } from './imageMissAdmission';

const IMAGE_CACHE_PREFIX = 'image-cache';
const ALLOWED_WIDTHS = new Set([480, 960, 1280, 1920]);
const PROXY_QUALITY = 72;
export const CACHE_CONTROL =
  'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400';

type ImageParams = { sourceUrl: string; width: number };
type OptimizeImageResult = { ok: true; body: Buffer; cacheHit: boolean } | ImageFailure;

const pending = new Map<string, Promise<OptimizeImageResult>>();
let transforming = false;

function cacheObjectPath({ sourceUrl, width }: ImageParams): string {
  // Keep existing q72 objects for canonical URLs. Other quality variants expire
  // from the request path without a cache migration.
  const digest = createHash('sha256')
    .update(`${sourceUrl}|${width}|${PROXY_QUALITY}|webp`)
    .digest('hex');
  return `${IMAGE_CACHE_PREFIX}/${digest}_w${width}_q${PROXY_QUALITY}.webp`;
}

const parsePositiveInt = (value: unknown, fallback: number): number =>
  value === undefined
    ? fallback
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : NaN;

export function parseOptimizeImageQuery(
  query: Record<string, unknown>
): ImageParams | { error: string } {
  if (Object.keys(query).some((key) => !['u', 'w', 'q'].includes(key))) {
    return { error: 'Unsupported query parameter' };
  }
  // The Functions emulator readiness probe uses the no-input response.
  if (typeof query.u !== 'string' || !query.u) return { error: 'Missing u parameter' };
  const sourceUrl = canonicalImageSource(query.u);
  const width = parsePositiveInt(query.w, 1920);
  const legacyQuality = parsePositiveInt(query.q, PROXY_QUALITY);
  if (
    !sourceUrl ||
    !ALLOWED_WIDTHS.has(width) ||
    !Number.isInteger(legacyQuality) ||
    legacyQuality < 40 ||
    legacyQuality > 90
  ) {
    return { error: 'Unsupported image parameters' };
  }
  return { sourceUrl, width };
}

function isSupportedRaster(buffer: Buffer): boolean {
  // Check bytes before passing input to libvips. Ignore the remote MIME and extension.
  return (
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') ||
    ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) ||
    (buffer.toString('ascii', 4, 8) === 'ftyp' &&
      ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12)))
  );
}

function storageErrorCode(error: unknown): number {
  return error instanceof Object && 'code' in error ? Number(error.code) : NaN;
}

async function readOrGenerate(
  params: ImageParams,
  objectPath: string,
  admitCacheMiss: (key: string) => Promise<ImageMissAdmission>
): Promise<OptimizeImageResult> {
  getOrInitApp();
  const cached = getStorage().bucket().file(objectPath);
  try {
    const [body] = await cached.download();
    return { ok: true, body, cacheHit: true };
  } catch (error) {
    if (storageErrorCode(error) !== 404) throw error;
  }

  if (transforming) {
    return { ok: false, status: 503, message: 'Image optimizer busy', retryAfter: 1 };
  }
  transforming = true;
  try {
    const admission = await admitCacheMiss(objectPath);
    if (admission.status === 'in-flight') {
      return { ok: false, status: 503, message: 'Image variant pending', retryAfter: 1 };
    }
    if (admission.status === 'quota-full') {
      return {
        ok: false,
        status: 429,
        message: 'Image rate limit exceeded',
        retryAfter: Math.max(1, Math.ceil((admission.until - Date.now()) / 1000)),
      };
    }

    const source = await fetchImageSource(params.sourceUrl);
    if ('ok' in source) return source;
    if (!isSupportedRaster(source.body)) {
      return { ok: false, status: 415, message: 'Unsupported source image format' };
    }

    let body: Buffer;
    try {
      body = await sharp(source.body, { limitInputPixels: MAX_IMAGE_PIXELS })
        .timeout({ seconds: 8 })
        .rotate()
        .resize({
          width: params.width,
          height: params.width * 2,
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({ quality: PROXY_QUALITY, effort: 4 })
        .toBuffer();
    } catch {
      return { ok: false, status: 422, message: 'Source image could not be processed' };
    }

    // Aliases can render without persisting a duplicate of the terminal object.
    if (source.url !== params.sourceUrl) return { ok: true, body, cacheHit: false };

    const uploadBudget = Math.min(5_000, admission.until - Date.now());
    if (uploadBudget <= 0) {
      return { ok: false, status: 503, message: 'Image generation lease expired', retryAfter: 1 };
    }
    try {
      // Use a single streaming upload with a bounded wait. Publication still
      // requires that no live generation exists for the immutable source URL.
      const output = cached.createWriteStream({
        resumable: false,
        timeout: uploadBudget,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            sourceUrl: params.sourceUrl,
            width: String(params.width),
            quality: String(PROXY_QUALITY),
          },
        },
      });
      await pipeline(Readable.from([body]), output, { signal: AbortSignal.timeout(uploadBudget) });
    } catch (error) {
      if (storageErrorCode(error) !== 412) throw error;
      const [winner] = await cached.download();
      return { ok: true, body: winner, cacheHit: true };
    }
    return { ok: true, body, cacheHit: false };
  } finally {
    transforming = false;
  }
}

export async function optimizeImageFromParams(
  params: ImageParams,
  admitCacheMiss: (key: string) => Promise<ImageMissAdmission>
): Promise<OptimizeImageResult> {
  const objectPath = cacheObjectPath(params);
  const existing = pending.get(objectPath);
  if (existing) return existing;

  const generation = readOrGenerate(params, objectPath, admitCacheMiss);
  pending.set(objectPath, generation);
  try {
    return await generation;
  } finally {
    pending.delete(objectPath);
  }
}
