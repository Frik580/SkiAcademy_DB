import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_PROXY_PATH,
  isProxyableImageUrl,
  optimizedImageSrcSet,
  optimizedImageUrl,
} from '../../src/lib/optimizedImageUrl';
import {
  heroBackgroundSrcSet,
  resolveHeroBackgroundUrl,
  resolveHeroOriginUrl,
} from '../../src/lib/mediaAssets';

const CARVE_WALL = 'https://storage.yandexcloud.net/carve/wall.webp';
const CARVE_ABOUT = 'https://storage.yandexcloud.net/carve/images/about.jpg';

describe('optimizedImageUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allowlists only carve Object Storage HTTPS URLs', () => {
    expect(isProxyableImageUrl(CARVE_WALL)).toBe(true);
    expect(isProxyableImageUrl(CARVE_ABOUT)).toBe(true);
    expect(isProxyableImageUrl('https://images.unsplash.com/photo.jpg')).toBe(false);
    expect(isProxyableImageUrl('https://evil.com/carve/wall.webp')).toBe(false);
  });

  it('wraps carve URLs when proxy is enabled', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'true');
    const url = optimizedImageUrl(CARVE_WALL, 1500);
    expect(url.startsWith(`${IMAGE_PROXY_PATH}?`)).toBe(true);
    const params = new URLSearchParams(url.slice(IMAGE_PROXY_PATH.length + 1));
    expect(params.get('u')).toBe(CARVE_WALL);
    expect(params.get('w')).toBe('1920');
    expect(params.get('q')).toBe('72');
  });

  it('passes through when proxy is disabled', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'false');
    expect(optimizedImageUrl(CARVE_WALL, 1920)).toBe(CARVE_WALL);
  });

  it('builds srcset for proxyable origins', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'true');
    const srcSet = optimizedImageSrcSet(CARVE_WALL, [960, 1920]);
    expect(srcSet).toContain('960w');
    expect(srcSet).toContain('1920w');
    expect(srcSet).toContain(IMAGE_PROXY_PATH);
  });
});

describe('mediaAssets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps short keys to carve origins', () => {
    expect(resolveHeroOriginUrl('wall')).toBe(CARVE_WALL);
    expect(resolveHeroOriginUrl('about')).toBe(CARVE_ABOUT);
    expect(resolveHeroOriginUrl('wall99')).toBe(
      'https://storage.yandexcloud.net/carve/wall99.webp'
    );
  });

  it('leaves custom remote URLs as origin', () => {
    const custom = 'https://cdn.example.com/hero.jpg';
    expect(resolveHeroOriginUrl(custom)).toBe(custom);
  });

  it('returns proxied display URLs when proxy is on', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'true');
    expect(resolveHeroBackgroundUrl('wall')).toContain(IMAGE_PROXY_PATH);
    expect(heroBackgroundSrcSet('wall')).toContain('960w');
  });
});
