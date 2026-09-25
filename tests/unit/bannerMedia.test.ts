import { describe, expect, it } from 'vitest';
import { deriveBannerVideoUrl, normalizeBannerMediaMode } from '../../src/lib/bannerMedia';

describe('normalizeBannerMediaMode', () => {
  it('defaults missing values to image', () => {
    expect(normalizeBannerMediaMode(undefined)).toBe('image');
    expect(normalizeBannerMediaMode(null)).toBe('image');
    expect(normalizeBannerMediaMode('image')).toBe('image');
    expect(normalizeBannerMediaMode('video')).toBe('video');
    expect(normalizeBannerMediaMode('other')).toBe('image');
  });
});

describe('deriveBannerVideoUrl', () => {
  it('converts common image extensions to .mp4', () => {
    expect(deriveBannerVideoUrl('/banners/hero.webp')).toBe('/banners/hero.mp4');
    expect(deriveBannerVideoUrl('/images/banners/home.webp')).toBe('/images/banners/home.mp4');
    expect(deriveBannerVideoUrl('/assets/about.jpg')).toBe('/assets/about.mp4');
    expect(deriveBannerVideoUrl('/assets/about.JPG')).toBe('/assets/about.mp4');
    expect(deriveBannerVideoUrl('/x/file.jpeg')).toBe('/x/file.mp4');
    expect(deriveBannerVideoUrl('/x/file.png')).toBe('/x/file.mp4');
    expect(deriveBannerVideoUrl('/x/file.avif')).toBe('/x/file.mp4');
  });

  it('preserves query strings and hashes', () => {
    expect(deriveBannerVideoUrl('https://example.com/banner.webp?token=123')).toBe(
      'https://example.com/banner.mp4?token=123'
    );
    expect(deriveBannerVideoUrl('https://example.com/banner.webp#section')).toBe(
      'https://example.com/banner.mp4#section'
    );
    expect(deriveBannerVideoUrl('https://example.com/banner.webp?token=123#section')).toBe(
      'https://example.com/banner.mp4?token=123#section'
    );
  });

  it('appends .mp4 when no known image extension is present', () => {
    expect(deriveBannerVideoUrl('https://cdn.example.com/banner')).toBe(
      'https://cdn.example.com/banner.mp4'
    );
  });
});
