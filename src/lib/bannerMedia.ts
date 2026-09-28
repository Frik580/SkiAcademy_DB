export type BannerMediaMode = 'image' | 'video';

/** Shared default for horizontal and a future vertical mobile focal point. */
export const DEFAULT_BANNER_FOCAL_POINT_PERCENT = 50;

/**
 * Safe mobile focal coordinate. Missing, null, and non-finite values stay centered.
 * Out-of-range numbers clamp to 0–100 so CSS never receives NaN.
 */
export function resolveBannerFocalPoint(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BANNER_FOCAL_POINT_PERCENT;
  }
  return Math.min(100, Math.max(0, value));
}

const IMAGE_EXTENSIONS = /\.(webp|jpe?g|png|avif)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov)$/i;

const splitUrlPath = (url: string): string => {
  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
};

/** True when the URL path already points at a video file (extension fallback). */
export function isBannerVideoUrl(url: string): boolean {
  if (!url) return false;
  return VIDEO_EXTENSIONS.test(splitUrlPath(url));
}

/** Missing or invalid values default to static image (backward compatible). */
export function normalizeBannerMediaMode(value: unknown): BannerMediaMode {
  return value === 'video' ? 'video' : 'image';
}

/**
 * Derive a sibling `.mp4` URL from a banner image URL.
 * Replaces a trailing image extension; preserves query string and hash.
 */
export function deriveBannerVideoUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;

  const hashIndex = imageUrl.indexOf('#');
  const withoutHash = hashIndex === -1 ? imageUrl : imageUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : imageUrl.slice(hashIndex);

  const queryIndex = withoutHash.indexOf('?');
  const pathPart = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : withoutHash.slice(queryIndex);

  if (isBannerVideoUrl(imageUrl)) {
    return imageUrl;
  }

  if (IMAGE_EXTENSIONS.test(pathPart)) {
    const newPath = pathPart.replace(IMAGE_EXTENSIONS, '.mp4');
    return `${newPath}${query}${hash}`;
  }

  return `${pathPart}.mp4${query}${hash}`;
}
