import { HttpsError } from 'firebase-functions/v2/https';
import sharp from 'sharp';

/**
 * CA-SEC-06A deny-by-default media type policy for LIVE user media.
 *
 * Client supplied `Content-Type`, file extension and file name are attacker
 * controlled. Every payload is therefore classified from its own bytes before it
 * is published to a Storage path that is served back to a browser.
 *
 * Images are classed by decoding their header with sharp inside a bounded
 * `limitInputPixels` window (no full rasterization, no metadata passthrough).
 * Videos are classed by container magic only: they are never transcoded and are
 * always served with `X-Content-Type-Options: nosniff`, so an HTML/SVG payload
 * must fail fast instead of reaching a media element.
 */
export const LIVE_CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const LIVE_CHAT_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
/** Public LIVE protected images: JPEG/PNG/WebP only. */
export const LIVE_PROTECTED_IMAGE_TYPES = LIVE_CHAT_IMAGE_TYPES;
/** Existing protected-image contract: GIF stays available to TEST session images. */
export const PROTECTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** Same bound the public image proxy already uses; header parsing only. */
export const MAX_IMAGE_PIXELS = 40_000_000;
const LIVE_PUBLIC_IMAGE_PREFIX = /^(participant-avatars|courses|instructors)\//;

const IMAGE_FORMAT_BY_TYPE: Record<string, 'jpeg' | 'png' | 'webp' | 'gif'> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

export function isLiveChatImageType(type: string): boolean {
  return (LIVE_CHAT_IMAGE_TYPES as readonly string[]).includes(type);
}

export function isLiveChatVideoType(type: string): boolean {
  return (LIVE_CHAT_VIDEO_TYPES as readonly string[]).includes(type);
}

/**
 * Scope-aware protected-image allowlist. LIVE public catalog/participant images
 * follow the ordinary image policy (no GIF); TEST session images keep the
 * historical GIF support.
 */
export function isAllowedProtectedImageType(path: string, type: string): boolean {
  const allowed: readonly string[] = LIVE_PUBLIC_IMAGE_PREFIX.test(path)
    ? LIVE_PROTECTED_IMAGE_TYPES
    : PROTECTED_IMAGE_TYPES;
  return allowed.includes(type);
}

/** Upload-only allowlist. Reading legacy objects keeps its own family check. */
export function assertSupportedChatMediaUploadType(type: string): void {
  if (!isLiveChatImageType(type) && !isLiveChatVideoType(type))
    invalid('Unsupported media format');
}

export function chatMediaUploadLimit(type: string): number {
  if (isLiveChatImageType(type)) return CHAT_IMAGE_MAX_BYTES;
  if (isLiveChatVideoType(type)) return CHAT_VIDEO_MAX_BYTES;
  return invalid('Unsupported media format');
}

/**
 * True when the bytes are a decodable raster image of exactly the declared
 * format. SVG/HTML/polyglot or re-labelled payloads report a different (or no)
 * format and are rejected. Extensions and file names are never consulted.
 */
export async function imageContentMatchesType(
  bytes: Buffer,
  declaredType: string
): Promise<boolean> {
  const expected = IMAGE_FORMAT_BY_TYPE[declaredType];
  if (!expected || bytes.length === 0) return false;
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
    }).metadata();
    return metadata.format === expected;
  } catch {
    return false;
  }
}

export async function assertImageContentMatchesType(
  bytes: Buffer,
  declaredType: string
): Promise<void> {
  if (!(await imageContentMatchesType(bytes, declaredType))) invalid('Invalid image content');
}

/** Container magic only: MP4/ISO-BMFF (`ftyp`) and WebM/Matroska (EBML). */
export function isChatVideoContainer(bytes: Buffer, declaredType: string): boolean {
  if (bytes.length < 12) return false;
  if (declaredType === 'video/webm') return bytes.subarray(0, 4).equals(EBML_MAGIC);
  // ISO-BMFF stores the `ftyp` box type at offset 4 of the first box.
  return bytes.toString('latin1', 4, 8) === 'ftyp';
}

export async function assertChatMediaContentMatchesType(
  bytes: Buffer,
  declaredType: string
): Promise<void> {
  assertSupportedChatMediaUploadType(declaredType);
  if (isLiveChatVideoType(declaredType)) {
    if (!isChatVideoContainer(bytes, declaredType))
      invalid('Media content does not match its declared type');
    return;
  }
  if (!(await imageContentMatchesType(bytes, declaredType)))
    invalid('Media content does not match its declared type');
}
