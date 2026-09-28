import { describe, expect, it } from 'vitest';
import {
  deriveBannerVideoUrl,
  isBannerVideoUrl,
  normalizeBannerMediaMode,
  resolveBannerFocalPoint,
} from '../../src/lib/bannerMedia';

describe('resolveBannerFocalPoint', () => {
  it('defaults missing values to the centered 50% position', () => {
    expect(resolveBannerFocalPoint(undefined)).toBe(50);
    expect(resolveBannerFocalPoint(null)).toBe(50);
    expect(resolveBannerFocalPoint('76')).toBe(50);
    expect(resolveBannerFocalPoint(Number.NaN)).toBe(50);
    expect(resolveBannerFocalPoint(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it('clamps out-of-range numbers and keeps in-range values', () => {
    expect(resolveBannerFocalPoint(-10)).toBe(0);
    expect(resolveBannerFocalPoint(0)).toBe(0);
    expect(resolveBannerFocalPoint(76)).toBe(76);
    expect(resolveBannerFocalPoint(100)).toBe(100);
    expect(resolveBannerFocalPoint(120)).toBe(100);
  });
});

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

  it('keeps direct video URLs unchanged', () => {
    const girl =
      'https://storage.yandexcloud.net/carve/images/girl.mp4';
    expect(deriveBannerVideoUrl(girl)).toBe(girl);
    expect(deriveBannerVideoUrl('https://cdn.example.com/clip.webm?v=1')).toBe(
      'https://cdn.example.com/clip.webm?v=1'
    );
    expect(deriveBannerVideoUrl('https://cdn.example.com/intro.MOV')).toBe(
      'https://cdn.example.com/intro.MOV'
    );
  });
});

describe('isBannerVideoUrl', () => {
  it('detects common video extensions on the path', () => {
    expect(
      isBannerVideoUrl('https://storage.yandexcloud.net/carve/images/girl.mp4')
    ).toBe(true);
    expect(isBannerVideoUrl('https://cdn.example.com/a.webm')).toBe(true);
    expect(isBannerVideoUrl('https://cdn.example.com/a.mov?x=1')).toBe(true);
    expect(isBannerVideoUrl('https://cdn.example.com/a.jpg')).toBe(false);
  });
});
