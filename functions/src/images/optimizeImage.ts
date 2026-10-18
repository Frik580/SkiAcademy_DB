import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { getOrInitApp } from '../adminApp';

/**
 * Public catalog image proxy. TEST and LIVE share the same Yandex `/carve/`
 * allowlist. This must not fetch Firebase Storage, private customer media, or
 * arbitrary URLs (no SSRF broadening).
 */
export const IMAGE_CACHE_PREFIX = 'image-cache';
export const ALLOWED_PROXY_WIDTHS = new Set([480, 960, 1280, 1920]);
export const DEFAULT_PROXY_QUALITY = 72;
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export const isAllowedImageSource = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'storage.yandexcloud.net' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      parsed.pathname.startsWith('/carve/')
    );
  } catch {
    return false;
  }
};

export const cacheObjectPath = (sourceUrl: string, width: number, quality: number): string => {
  const digest = createHash('sha256').update(`${sourceUrl}|${width}|${quality}|webp`).digest('hex');
  return `${IMAGE_CACHE_PREFIX}/${digest}_w${width}_q${quality}.webp`;
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export type OptimizeImageResult =
  | { ok: true; body: Buffer; contentType: string; cacheHit: boolean }
  | { ok: false; status: number; message: string };

export async function fetchImageSource(
  sourceUrl: string
): Promise<Buffer | Exclude<OptimizeImageResult, { ok: true }>> {
  const signal = AbortSignal.timeout(10_000);
  let url = sourceUrl;
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!isAllowedImageSource(url))
      return { ok: false, status: 400, message: 'Source URL is not allowlisted' };
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'image/*' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirect === 3)
        return { ok: false, status: 502, message: 'Invalid upstream redirect' };
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return { ok: false, status: 502, message: 'Upstream fetch failed' };
    }
    if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) {
      await response.body.cancel();
      return { ok: false, status: 413, message: 'Source image too large' };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES) {
          await reader.cancel();
          return { ok: false, status: 413, message: 'Source image too large' };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }
  return { ok: false, status: 502, message: 'Invalid upstream redirect' };
}

export async function optimizeImageFromParams(params: {
  sourceUrl: string;
  width: number;
  quality: number;
}): Promise<OptimizeImageResult> {
  const { sourceUrl, width, quality } = params;

  if (!isAllowedImageSource(sourceUrl)) {
    return { ok: false, status: 400, message: 'Source URL is not allowlisted' };
  }
  if (!ALLOWED_PROXY_WIDTHS.has(width)) {
    return { ok: false, status: 400, message: 'Unsupported width' };
  }
  if (quality < 40 || quality > 90) {
    return { ok: false, status: 400, message: 'Unsupported quality' };
  }

  getOrInitApp();
  const bucket = getStorage().bucket();
  const objectPath = cacheObjectPath(sourceUrl, width, quality);
  const cached = bucket.file(objectPath);

  const [exists] = await cached.exists();
  if (exists) {
    const [body] = await cached.download();
    return { ok: true, body, contentType: 'image/webp', cacheHit: true };
  }

  const sourceBuffer = await fetchImageSource(sourceUrl);
  if (!Buffer.isBuffer(sourceBuffer)) return sourceBuffer;

  const body = await sharp(sourceBuffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality, effort: 4 })
    .toBuffer();

  await cached.save(body, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        sourceUrl,
        width: String(width),
        quality: String(quality),
      },
    },
  });

  return { ok: true, body, contentType: 'image/webp', cacheHit: false };
}

export const parseOptimizeImageQuery = (
  query: Record<string, unknown>
): { sourceUrl: string; width: number; quality: number } | { error: string } => {
  const rawUrl = typeof query.u === 'string' ? query.u : '';
  if (!rawUrl) {
    return { error: 'Missing u parameter' };
  }

  let sourceUrl: string;
  try {
    sourceUrl = decodeURIComponent(rawUrl);
  } catch {
    return { error: 'Invalid u parameter' };
  }

  const width = parsePositiveInt(query.w, 1920);
  const quality = parsePositiveInt(query.q, DEFAULT_PROXY_QUALITY);
  return { sourceUrl, width, quality };
};
