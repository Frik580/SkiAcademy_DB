/**
 * Hero / journey marketing backgrounds from Yandex Object Storage,
 * served through `/api/img` (Cloud Function + sharp + Storage cache).
 *
 * New slide keys (`wall8`, …) need only exist at
 * `https://storage.yandexcloud.net/carve/{key}.webp` — no files in `public/`.
 * Custom HTTPS carve URLs are proxied the same way.
 */

import { optimizedImageSrcSet, optimizedImageUrl } from './optimizedImageUrl';

const YANDEX_CARVE = 'https://storage.yandexcloud.net/carve';

/** Short keys that are not `/carve/{key}.webp`. */
const HERO_KEY_ORIGIN: Record<string, string> = {
  about: `${YANDEX_CARVE}/images/about.jpg`,
};

/** Absolute origin URL for a slide background key or custom URL. */
export const resolveHeroOriginUrl = (bg: string): string => {
  if (bg === 'random') {
    return `${YANDEX_CARVE}/wall.webp`;
  }
  if (bg.startsWith('http://') || bg.startsWith('https://')) {
    return bg;
  }
  return HERO_KEY_ORIGIN[bg] ?? `${YANDEX_CARVE}/${bg}.webp`;
};

/** Display URL for hero (proxied WebP at ~1920w when proxy is on). */
export const resolveHeroBackgroundUrl = (bg: string): string =>
  optimizedImageUrl(resolveHeroOriginUrl(bg), 1920);

/** Responsive srcset for a slide background key or origin URL. */
export const heroBackgroundSrcSet = (bgOrOrigin: string): string | undefined => {
  const origin =
    bgOrOrigin.startsWith('http://') || bgOrOrigin.startsWith('https://')
      ? bgOrOrigin
      : resolveHeroOriginUrl(bgOrOrigin);
  return optimizedImageSrcSet(origin, [960, 1920]);
};

const LCP_PRELOAD_ATTR = 'data-hero-lcp-preload';

/**
 * Preload whichever image is actually the first (LCP) slide — not a hard-coded wall.
 */
export const preloadHeroLcpImage = (href: string, srcSet?: string): (() => void) => {
  if (typeof document === 'undefined' || !href) return () => {};

  document.querySelectorAll(`link[${LCP_PRELOAD_ATTR}]`).forEach((el) => el.remove());

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  link.setAttribute(LCP_PRELOAD_ATTR, '1');
  link.setAttribute('fetchpriority', 'high');
  if (srcSet) {
    link.setAttribute('imagesrcset', srcSet);
    link.setAttribute('imagesizes', '100vw');
  }
  document.head.appendChild(link);

  return () => {
    link.remove();
  };
};
