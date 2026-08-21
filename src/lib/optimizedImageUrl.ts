/**
 * On-the-fly image optimization via Hosting rewrite → Cloud Function `/api/img`.
 * In local Vite dev the proxy is off unless VITE_IMAGE_PROXY=true (needs Hosting/Functions).
 */

export const IMAGE_PROXY_PATH = '/api/img';

export const IMAGE_PROXY_WIDTHS = [480, 960, 1280, 1920] as const;
export type ImageProxyWidth = (typeof IMAGE_PROXY_WIDTHS)[number];

const DEFAULT_QUALITY = 72;

/** Origins we are allowed to optimize (must match Cloud Function allowlist). */
export const isProxyableImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'storage.yandexcloud.net' &&
      parsed.pathname.startsWith('/carve/')
    );
  } catch {
    return false;
  }
};

const isImageProxyEnabled = (): boolean => {
  if (typeof import.meta === 'undefined' || !import.meta.env) return true;
  if (import.meta.env.VITE_IMAGE_PROXY === 'true') return true;
  if (import.meta.env.VITE_IMAGE_PROXY === 'false') return false;
  return Boolean(import.meta.env.PROD);
};

const snapWidth = (width: number): ImageProxyWidth => {
  for (const candidate of IMAGE_PROXY_WIDTHS) {
    if (width <= candidate) return candidate;
  }
  return 1920;
};

/**
 * Wrap an absolute image URL in the optimize proxy when enabled and allowlisted.
 * Non-carve URLs (e.g. Unsplash) pass through unchanged.
 */
export const optimizedImageUrl = (
  src: string,
  width: number,
  quality: number = DEFAULT_QUALITY
): string => {
  if (!src || !isProxyableImageUrl(src) || !isImageProxyEnabled()) {
    return src;
  }
  const w = snapWidth(width);
  const q = Math.min(90, Math.max(40, Math.round(quality)));
  const params = new URLSearchParams({
    u: src,
    w: String(w),
    q: String(q),
  });
  return `${IMAGE_PROXY_PATH}?${params.toString()}`;
};

export const optimizedImageSrcSet = (
  src: string,
  widths: readonly number[] = [960, 1920],
  quality: number = DEFAULT_QUALITY
): string | undefined => {
  if (!src || !isProxyableImageUrl(src) || !isImageProxyEnabled()) {
    return undefined;
  }
  return widths.map((w) => `${optimizedImageUrl(src, w, quality)} ${snapWidth(w)}w`).join(', ');
};
