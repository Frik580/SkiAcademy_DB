export type BannerMediaMode = 'image' | 'video';

const IMAGE_EXTENSIONS = /\.(webp|jpe?g|png|avif)$/i;

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

  if (IMAGE_EXTENSIONS.test(pathPart)) {
    const newPath = pathPart.replace(IMAGE_EXTENSIONS, '.mp4');
    return `${newPath}${query}${hash}`;
  }

  return `${pathPart}.mp4${query}${hash}`;
}
