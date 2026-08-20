import { describe, expect, it } from 'vitest';
import {
  cacheObjectPath,
  isAllowedImageSource,
  parseOptimizeImageQuery,
} from './optimizeImage';

describe('optimizeImage allowlist', () => {
  it('allows carve Object Storage HTTPS URLs only', () => {
    expect(isAllowedImageSource('https://storage.yandexcloud.net/carve/wall.webp')).toBe(true);
    expect(isAllowedImageSource('https://storage.yandexcloud.net/carve/images/about.jpg')).toBe(
      true
    );
    expect(isAllowedImageSource('https://storage.yandexcloud.net/other/wall.webp')).toBe(false);
    expect(isAllowedImageSource('http://storage.yandexcloud.net/carve/wall.webp')).toBe(false);
    expect(isAllowedImageSource('https://evil.example/carve/wall.webp')).toBe(false);
  });

  it('builds stable cache object paths', () => {
    const a = cacheObjectPath('https://storage.yandexcloud.net/carve/wall.webp', 1920, 72);
    const b = cacheObjectPath('https://storage.yandexcloud.net/carve/wall.webp', 1920, 72);
    const c = cacheObjectPath('https://storage.yandexcloud.net/carve/wall.webp', 960, 72);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('image-cache/')).toBe(true);
    expect(a.endsWith('_w1920_q72.webp')).toBe(true);
  });

  it('parses query params', () => {
    const parsed = parseOptimizeImageQuery({
      u: 'https://storage.yandexcloud.net/carve/wall.webp',
      w: '960',
      q: '80',
    });
    expect(parsed).toEqual({
      sourceUrl: 'https://storage.yandexcloud.net/carve/wall.webp',
      width: 960,
      quality: 80,
    });
  });

  it('rejects missing u', () => {
    expect(parseOptimizeImageQuery({})).toEqual({ error: 'Missing u parameter' });
  });
});
