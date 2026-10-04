import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { resolve } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_CROSSFADE_MS, HeroCarousel } from '../../src/app/components/HeroCarousel';
import { BANNER_VIDEO_STARTUP_WATCHDOG_MS } from '../../src/ui/BannerMedia';
import type { CustomHeroSlide } from '../../src/types';
import { mockBannerVideoFrames } from './helpers/bannerVideoFrames';

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: pause,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const originalLoad = HTMLMediaElement.prototype.load;

afterEach(() => {
  document.querySelectorAll('link[data-hero-lcp-preload]').forEach((node) => node.remove());
  vi.useRealTimers();
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: originalLoad,
  });
  play.mockImplementation(() => Promise.resolve());
});

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' as const }),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

const slide = (
  id: string,
  mode: 'image' | 'video',
  image = `https://cdn.example.com/${id}.webp`
): CustomHeroSlide => ({
  id,
  line1En: 'Eyebrow',
  line1Ru: 'А',
  line2En: 'Title',
  line2Ru: 'З',
  line3En: 'Body',
  line3Ru: 'Т',
  backgroundImage: image,
  backgroundMediaMode: mode,
});

function renderCarousel(slides: CustomHeroSlide[], slideIntervalSeconds = 60, strict = false) {
  const carousel = (
    <HeroCarousel
      data={{
        slides,
        configReady: true,
        language: 'en',
        theme: 'dark',
        slideIntervalSeconds,
      }}
      actions={{ onScrollToSection: vi.fn() }}
    />
  );
  return render(strict ? <StrictMode>{carousel}</StrictMode> : carousel);
}

function backgroundLayers(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.ui-hero > .z-0 > div.will-change-\\[opacity\\]')
  );
}

function advance(container: HTMLElement) {
  // Existing navigation/budget tests model healthy completed activations.
  const current = container.querySelector<HTMLVideoElement>('video[data-video-role="ACTIVE"]');
  if (current) confirmPlayback(current);
  const button = container.querySelector('button[aria-label^="goToSlide"]');
  if (!button) throw new Error('missing slide control');
  fireEvent.click(button);
  const incoming = container.querySelector<HTMLVideoElement>('video[data-video-role="ACTIVE"]');
  if (incoming) confirmPlayback(incoming);
}

function confirmPlayback(video: HTMLVideoElement) {
  setMediaState(video, 2, 1);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  fireEvent.playing(video);
}

function videoSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('video')).map((video) => video.getAttribute('src') ?? '');
}

function expectPresentation(container: HTMLElement, index: number) {
  const copies = [...container.querySelectorAll('.hero-copy-stack .grid > [aria-hidden]')];
  expect(copies.findIndex((copy) => copy.getAttribute('aria-hidden') === 'false')).toBe(index);
  expect(backgroundLayers(container).map((layer) => layer.classList.contains('opacity-100')))
    .toEqual(copies.map((_, slideIndex) => slideIndex === index));
  expect(container.querySelector('.hero-pagination')).toHaveAttribute('aria-label', `goToSlide ${index + 1} / ${copies.length}`);
}

const CARVE_GIRL_MP4 = 'https://storage.yandexcloud.net/carve/images/girl.mp4';

describe('HeroCarousel video preload', () => {
  it('plays carve mp4 banners directly without /api/img', () => {
    vi.stubEnv('VITE_IMAGE_PROXY', 'true');
    const { container } = renderCarousel([
      {
        ...slide('girl', 'video', CARVE_GIRL_MP4),
        backgroundImage: CARVE_GIRL_MP4,
      },
      slide('next', 'image', 'https://storage.yandexcloud.net/carve/wall.webp'),
    ]);

    const layer = backgroundLayers(container)[0];
    const activeVideo = layer.querySelector('video');
    expect(activeVideo).toHaveAttribute('src', CARVE_GIRL_MP4);
    expect(activeVideo?.getAttribute('src')).not.toContain('/api/img');
    expect(layer.innerHTML).not.toContain('girl.mp4.mp4');
    expect(layer.querySelector('img')).toBeNull();
  });

  it('loads the active video immediately and does not request its image', () => {
    const assigned: string[] = [];
    const OriginalImage = window.Image;
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          assigned.push(value);
        }
      }
    );

    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'image'),
    ]);
    const layer = backgroundLayers(container)[0];
    const video = layer.querySelector(':scope > video');

    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/a.mp4');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video?.hasAttribute('poster')).toBe(false);
    expect(layer.querySelector('img')).toBeNull();
    expect(layer.querySelector(':scope > div > video')).toBeNull();
    expect(document.querySelector('link[data-hero-lcp-preload]')).toBeNull();
    expect(assigned.some((src) => src.includes('/a.webp'))).toBe(false);

    vi.stubGlobal('Image', OriginalImage);
  });

  it('preloads the next video slide before it becomes active', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
    ]);
    const layers = backgroundLayers(container);

    expect(layers[0].querySelector('video')).toHaveAttribute('preload', 'auto');
    confirmPlayback(layers[0].querySelector('video')!);
    expect(layers[0]).toHaveClass('opacity-100');
    expect(layers[1].querySelector('video')).toHaveAttribute('src', 'https://cdn.example.com/b.mp4');
    expect(layers[1].querySelector('video')).toHaveAttribute('preload', 'auto');
    expect(layers[1]).toHaveClass('opacity-0');
    expect(layers[1].querySelector('img')).toBeNull();
    expect(layers[2].querySelector('video')).toBeNull();
    expect(layers[2].querySelector('img')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('does not eagerly load unrelated distant video slides', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
      slide('d', 'video'),
    ]);

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    const distant = backgroundLayers(container)[3];
    expect(distant.querySelector('video')).toBeNull();
    expect(distant.querySelector('img')).toBeNull();
  });

  it('resets currentTime and requests play when a video slide is active', () => {
    const { container } = renderCarousel([slide('a', 'video')]);
    const video = container.querySelector('video') as HTMLVideoElement;
    confirmPlayback(video);

    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
    expect(video.hasAttribute('poster')).toBe(false);
  });

  it('pauses an outgoing video without substituting an image', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
    ]);
    pause.mockClear();

    advance(container);

    const layers = backgroundLayers(container);
    expect(pause).toHaveBeenCalled();
    expect(layers[0].querySelector('video')).not.toBeNull();
    expect(layers[0].querySelector('img')).toBeNull();
    expect(layers[0]).toHaveClass('opacity-0');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('keeps a video-to-video transition free of intermediate images', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
    ]);

    expect(container.querySelector('img')).toBeNull();
    advance(container);

    const layers = backgroundLayers(container);
    expect(layers[0].querySelector(':scope > video')).not.toBeNull();
    expect(layers[1].querySelector(':scope > video')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video[poster]')).toBeNull();
    expect(layers[0].querySelector(':scope > div > video')).toBeNull();
    expect(layers[1].querySelector(':scope > div > video')).toBeNull();
  });

  it('keeps the outgoing video mounted through a video-to-image transition', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'image'),
    ]);

    advance(container);

    const layers = backgroundLayers(container);
    expect(layers[0].querySelector(':scope > video')).toHaveAttribute(
      'src',
      'https://cdn.example.com/a.mp4'
    );
    expect(layers[0].querySelector('img')).toBeNull();
    expect(layers[0]).toHaveClass('opacity-0');
    expect(layers[1].querySelector(':scope > img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/b.webp'
    );
    expect(layers[1].querySelector('video')).toBeNull();
  });

  it('preloads an incoming video before an image-to-video transition', () => {
    const { container } = renderCarousel([
      slide('a', 'image'),
      slide('b', 'video'),
    ]);
    const layers = backgroundLayers(container);

    expect(layers[0].querySelector(':scope > img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/a.webp'
    );
    expect(layers[1].querySelector(':scope > video')).toHaveAttribute(
      'src',
      'https://cdn.example.com/b.mp4'
    );
    expect(layers[1].querySelector('video')).toHaveAttribute('preload', 'auto');
    expect(layers[1].querySelector('img')).toBeNull();
    expect(layers[1].querySelector('video')?.hasAttribute('poster')).toBe(false);
    expect(layers[1]).toHaveClass('opacity-0');
  });

  it('preloads the wrapped first video only after the outgoing video is released', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
      slide('d', 'video'),
    ]);

    advance(container);
    advance(container);

    expect(videoSources(container)).not.toContain('https://cdn.example.com/a.mp4');
    expect(container.querySelectorAll('video').length).toBeLessThanOrEqual(2);

    advance(container);

    expect(videoSources(container)).not.toContain('https://cdn.example.com/a.mp4');
    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/c.mp4',
      'https://cdn.example.com/d.mp4',
    ]);
    expect(container.querySelectorAll('video').length).toBeLessThanOrEqual(2);

    act(() => {
      vi.advanceTimersByTime(HERO_CROSSFADE_MS);
    });

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/d.mp4',
    ]);
    const first = backgroundLayers(container)[0];
    expect(first.querySelector('video')).toHaveAttribute('preload', 'auto');
    expect(first.querySelector('video')).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(first.querySelector('img')).toBeNull();
    expect(first).toHaveClass('opacity-0');
    expect(container.querySelectorAll('video').length).toBeLessThanOrEqual(2);
  });

  it('keeps hero copy classes from the typography regression fix', () => {
    const { container } = renderCarousel([slide('a', 'video'), slide('b', 'image')]);
    const title = container.querySelector('.hero-copy-title');
    const eyebrow = container.querySelector('.hero-copy-eyebrow');

    expect(title?.className).toContain('font-serif');
    expect(title?.className).toContain('font-light');
    expect(title?.className).toContain('text-4xl');
    expect(title?.className).toContain('md:text-5xl');
    expect(title?.className).toContain('lg:text-6xl');
    expect(eyebrow?.className).toContain('font-mono');
    expect(eyebrow?.className).toContain('uppercase');
    expect(container.querySelector('.hero-copy-body')).toBeNull();
  });

  it('does not reveal or start the video slide timer from canplay alone', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'image')],
      5
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-0');

    fireEvent.canPlay(container.querySelector('video')!);
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-0');
    confirmPlayback(container.querySelector('video')!);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');
  });

  it('keeps image-slide timing independent of video readiness', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'image'), slide('b', 'image')],
      5
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');
    expect(container.querySelector('video')).toBeNull();
  });
});

function videoCount(container: HTMLElement): number {
  return container.querySelectorAll('video').length;
}

function layerVideo(container: HTMLElement, index: number): HTMLVideoElement {
  const video = backgroundLayers(container)[index]?.querySelector('video');
  if (!video) throw new Error(`missing video on layer ${index}`);
  return video as HTMLVideoElement;
}

function setMediaState(video: HTMLVideoElement, readyState: number, networkState = 0) {
  Object.defineProperty(video, 'readyState', { configurable: true, get: () => readyState });
  Object.defineProperty(video, 'networkState', { configurable: true, get: () => networkState });
}

describe('HeroCarousel video resource budget', () => {
  it.each([
    { strict: false, withImage: false },
    { strict: true, withImage: false },
    { strict: false, withImage: true },
    { strict: true, withImage: true },
  ])('reuses wall3/wall4 over automatic cycles: %j', ({ strict, withImage }) => {
    vi.useFakeTimers();
    const load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
    const slides = [slide('wall3', 'video'), slide('wall4', 'video')];
    if (withImage) slides.push(slide('photo', 'image'));
    const { container, unmount } = renderCarousel(slides, 5, strict);
    const originalVideos = Array.from(container.querySelectorAll('video'));
    expect(originalVideos).toHaveLength(2);
    for (const video of originalVideos) setMediaState(video, 2, 1);
    confirmPlayback(originalVideos[0]);
    const observer = new MutationObserver(() => {});
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    load.mockClear();

    for (let step = 0; step < slides.length * 4; step += 1) {
      act(() => { vi.advanceTimersByTime(5000); });
      const active = container.querySelector<HTMLVideoElement>('video[data-video-role="ACTIVE"]');
      if (active) confirmPlayback(active);
      const videos = Array.from(container.querySelectorAll('video'));
      expect(videos).toEqual(originalVideos);
      expect(new Set(videoSources(container)).size).toBe(2);
      expect(videoSources(container)).toEqual([
        'https://cdn.example.com/wall3.mp4',
        'https://cdn.example.com/wall4.mp4',
      ]);
      const mutations = observer.takeRecords();
      expect(mutations.filter((record) => record.type === 'attributes')).toHaveLength(0);
      expect(mutations.flatMap((record) => Array.from(record.removedNodes))
        .filter((node) => node instanceof HTMLVideoElement)).toHaveLength(0);
      expect(load).not.toHaveBeenCalled();
    }
    observer.disconnect();
    unmount();
    expect(originalVideos.every((video) => !video.isConnected && !video.hasAttribute('src'))).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps three consecutive videos at two mounted elements through the crossfade', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
    ]);

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    expect(layerVideo(container, 0)).toHaveAttribute('data-video-role', 'ACTIVE');
    expect(layerVideo(container, 1)).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(backgroundLayers(container)[2].querySelector('video')).toBeNull();
    expect(videoCount(container)).toBeLessThanOrEqual(2);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video[poster]')).toBeNull();

    advance(container);

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    expect(videoSources(container)).not.toContain('https://cdn.example.com/c.mp4');
    expect(layerVideo(container, 0)).toHaveAttribute('data-video-role', 'OUTGOING');
    expect(layerVideo(container, 0)).toHaveAttribute('src', 'https://cdn.example.com/a.mp4');
    expect(layerVideo(container, 1)).toHaveAttribute('data-video-role', 'ACTIVE');
    expect(backgroundLayers(container)[2].querySelector('video')).toBeNull();
    expect(backgroundLayers(container)[0].querySelector('img')).toBeNull();
    expect(backgroundLayers(container)[1].querySelector('img')).toBeNull();
    expect(videoCount(container)).toBeLessThanOrEqual(2);

    act(() => {
      vi.advanceTimersByTime(HERO_CROSSFADE_MS);
    });

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/b.mp4',
      'https://cdn.example.com/c.mp4',
    ]);
    expect(videoSources(container)).not.toContain('https://cdn.example.com/a.mp4');
    expect(layerVideo(container, 1)).toHaveAttribute('data-video-role', 'ACTIVE');
    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(backgroundLayers(container)[0].querySelector('video')).toBeNull();
    expect(videoCount(container)).toBeLessThanOrEqual(2);
    expect(container.querySelector('img')).toBeNull();
    expect(backgroundLayers(container)[1].querySelector(':scope > div > video')).toBeNull();
    expect(backgroundLayers(container)[2].querySelector(':scope > div > video')).toBeNull();
  });

  it('preloads the second video while leaving an image-to-video transition within the budget', () => {
    const { container } = renderCarousel([
      slide('image', 'image'),
      slide('a', 'video'),
      slide('b', 'video'),
    ]);

    expect(videoSources(container)).toEqual(['https://cdn.example.com/a.mp4']);
    expect(backgroundLayers(container)[0].querySelector('img')).not.toBeNull();
    expect(videoCount(container)).toBeLessThanOrEqual(2);

    advance(container);

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    expect(layerVideo(container, 1)).toHaveAttribute('data-video-role', 'ACTIVE');
    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(videoCount(container)).toBeLessThanOrEqual(2);
    expect(backgroundLayers(container)[1].querySelector('img')).toBeNull();
  });

  it('defers the video after an image until the outgoing video is released', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('image', 'image'),
      slide('b', 'video'),
    ]);

    expect(videoSources(container)).toEqual(['https://cdn.example.com/a.mp4']);

    advance(container);

    expect(videoSources(container)).toEqual(['https://cdn.example.com/a.mp4']);
    expect(layerVideo(container, 0)).toHaveAttribute('data-video-role', 'OUTGOING');
    expect(backgroundLayers(container)[2].querySelector('video')).toBeNull();
    expect(videoCount(container)).toBeLessThanOrEqual(2);

    act(() => {
      vi.advanceTimersByTime(HERO_CROSSFADE_MS);
    });

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(layerVideo(container, 0)).toHaveAttribute('src', 'https://cdn.example.com/a.mp4');

    advance(container);

    expect(videoSources(container).sort()).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ]);
    expect(videoCount(container)).toBeLessThanOrEqual(2);
  });

  it('plays a preloaded second video after the first video succeeds', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'video'), slide('c', 'video')],
      5
    );

    confirmPlayback(layerVideo(container, 0));
    expect(play).toHaveBeenCalled();
    expect(backgroundLayers(container)[0].querySelector('img')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const second = layerVideo(container, 1);
    setMediaState(second, 2);
    confirmPlayback(second);

    expect(second.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    expect(backgroundLayers(container)[1].querySelector('img')).toBeNull();
    expect(second.hasAttribute('poster')).toBe(false);
    expect(videoSources(container)).not.toContain('https://cdn.example.com/c.mp4');
    expect(videoCount(container)).toBeLessThanOrEqual(2);
  });

  it('resumes a second video whose preload was discarded without load()', () => {
    vi.useFakeTimers();
    const loadedSrcs: string[] = [];
    const load = vi.fn(function (this: HTMLVideoElement) {
      loadedSrcs.push(this.getAttribute('src') ?? '');
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: load,
    });

    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'video'), slide('c', 'video')],
      5
    );
    const second = layerVideo(container, 1);
    setMediaState(second, 0, 1);
    loadedSrcs.length = 0;
    load.mockClear();

    confirmPlayback(layerVideo(container, 0));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(load).not.toHaveBeenCalled();
    expect(loadedSrcs).not.toContain('https://cdn.example.com/c.mp4');
    expect(videoCount(container)).toBeLessThanOrEqual(2);

    confirmPlayback(second);

    expect(play).toHaveBeenCalled();
    expect(backgroundLayers(container)[1].querySelector('img')).toBeNull();
    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');
  });

  it('falls back when a discarded second video never reaches a frame and continues', async () => {
    vi.useFakeTimers();
    const load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: load,
    });
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'video'), slide('c', 'video')],
      5
    );

    confirmPlayback(layerVideo(container, 0));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const second = layerVideo(container, 1);
    setMediaState(second, 0, 1);
    expect(second.error ?? null).toBeNull();

    act(() => {
      vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS);
    });

    expect(backgroundLayers(container)[1].querySelector('video')).toBeNull();
    expect(backgroundLayers(container)[1].querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/b.webp'
    );
    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'ACTIVE');
    confirmPlayback(layerVideo(container, 2));
    expect(backgroundLayers(container)[2]).toHaveClass('opacity-100');
    expect(videoCount(container)).toBeLessThanOrEqual(2);
  });

  it('falls back when the second video play() rejects and continues', async () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'video'), slide('c', 'video')],
      5
    );

    confirmPlayback(layerVideo(container, 0));
    play.mockImplementation(() => Promise.reject(new Error('play rejected')));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    fireEvent.loadedData(layerVideo(container, 1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(backgroundLayers(container)[1].querySelector('video')).toBeNull();
    expect(backgroundLayers(container)[1].querySelector('img')).not.toBeNull();
    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');
    play.mockImplementation(() => Promise.resolve());

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'ACTIVE');
    confirmPlayback(layerVideo(container, 2));
    expect(backgroundLayers(container)[2]).toHaveClass('opacity-100');
  });

  it('continues after a second-video media error', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'video'), slide('c', 'video')],
      5
    );

    advance(container);
    fireEvent.error(layerVideo(container, 1));

    expect(backgroundLayers(container)[1].querySelector('img')).not.toBeNull();
    expect(backgroundLayers(container)[1].querySelector('video')).toBeNull();
    expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(layerVideo(container, 2)).toHaveAttribute('data-video-role', 'ACTIVE');
    confirmPlayback(layerVideo(container, 2));
    expect(backgroundLayers(container)[2]).toHaveClass('opacity-100');
    expect(videoCount(container)).toBeLessThanOrEqual(2);
  });

  it('does not leak video elements across repeated A → B → C cycles', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
    ]);
    const deferredDuringCrossfade = [
      'https://cdn.example.com/c.mp4',
      'https://cdn.example.com/a.mp4',
      'https://cdn.example.com/b.mp4',
    ];

    for (let step = 0; step < 6; step += 1) {
      expect(videoCount(container)).toBeLessThanOrEqual(2);
      advance(container);
      expect(videoCount(container)).toBeLessThanOrEqual(2);
      expect(videoSources(container)).not.toContain(deferredDuringCrossfade[step % 3]);
      act(() => {
        vi.advanceTimersByTime(HERO_CROSSFADE_MS);
      });
      expect(videoCount(container)).toBeLessThanOrEqual(2);
      expect(videoSources(container)).toHaveLength(2);
    }
  });
});

describe('HeroCarousel activation frames', () => {
  it('does not natively loop hero videos', () => {
    const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')]);
    const video = layerVideo(container, 0);
    expect(video.loop).toBe(false);
    expect(video).not.toHaveAttribute('loop');
  });

  it('holds the ended girl frame until the existing timer and restarts the retained element on its next activation', () => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')], 9);
      const video = layerVideo(container, 0);
      setMediaState(video, 2, 1);
      Object.defineProperty(video, 'duration', { configurable: true, value: 7.5 });
      frames.deliver(video);
      expectPresentation(container, 0);
      act(() => { vi.advanceTimersByTime(7500); });
      video.currentTime = 7.5;
      Object.defineProperty(video, 'ended', { configurable: true, value: true });
      Object.defineProperty(video, 'paused', { configurable: true, value: true });
      const playCalls = play.mock.calls.length;
      const loadCalls = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
      fireEvent.ended(video);
      expect(layerVideo(container, 0)).toBe(video);
      expect(video).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(video.currentTime).toBe(7.5);
      expect(video).toHaveStyle({ opacity: '1' });
      expect(backgroundLayers(container)[0].querySelector('img')).toBeNull();
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      expectPresentation(container, 0);
      expect(play).toHaveBeenCalledTimes(playCalls);
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCalls);
      act(() => { vi.advanceTimersByTime(1499); });
      expectPresentation(container, 0);
      expect(video.currentTime).toBe(7.5);
      act(() => { vi.advanceTimersByTime(1); });
      expectPresentation(container, 1);
      expect(layerVideo(container, 0)).toBe(video);
      expect(video.currentTime).toBe(7.5);
      expect(pause.mock.contexts).toContain(video);
      Object.defineProperty(video, 'ended', { configurable: true, value: false });
      act(() => { vi.advanceTimersByTime(9000); });
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      expectPresentation(container, 1); // Fresh readiness still gates the new activation.
      expect(layerVideo(container, 0)).toBe(video);
      expect(video.currentTime).toBe(0);
      expect(play).toHaveBeenCalledTimes(playCalls + 1);
      fireEvent.seeked(video);
      frames.deliver(video);
      expectPresentation(container, 0);
      expect(video).toHaveStyle({ opacity: '1' });
      expect(video).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCalls);
      expect(container.querySelectorAll('video').length).toBeLessThanOrEqual(2);
    } finally { frames.restore(); }
  });

  it('pauses the retained girl normally when the timer is shorter than its duration', () => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')], 5);
      const video = layerVideo(container, 0);
      setMediaState(video, 2, 1);
      Object.defineProperty(video, 'duration', { configurable: true, value: 7.5 });
      frames.deliver(video);
      video.currentTime = 4.9;
      const loadCalls = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
      act(() => { vi.advanceTimersByTime(5000); });
      expectPresentation(container, 1);
      expect(pause.mock.contexts).toContain(video);
      expect(layerVideo(container, 0)).toBe(video);
      expect(video.currentTime).toBe(4.9);
      expect(video).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCalls);
    } finally { frames.restore(); }
  });

  it.each([false, true])('presents a healthy cold first video before starting its interval; StrictMode: %s', (strict) => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')], 5, strict);
      const video = layerVideo(container, 0);
      expect(video).toHaveAttribute('data-video-role', 'ACTIVE');
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      expect(container.querySelector('section')).toHaveAttribute('data-presented-slide', '');
      act(() => { vi.advanceTimersByTime(7000); });
      expect(layerVideo(container, 0)).toBe(video);
      expect(container.querySelector('[aria-hidden="false"]')).toBeNull();
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      setMediaState(video, 2, 1);
      fireEvent.loadedMetadata(video);
      fireEvent.loadedData(video);
      fireEvent.playing(video);
      act(() => { vi.advanceTimersByTime(249); });
      expect(container.querySelector('section')).toHaveAttribute('data-presented-slide', '');
      frames.deliver(video);
      expectPresentation(container, 0);
      act(() => { vi.advanceTimersByTime(4999); });
      expectPresentation(container, 0);
      act(() => { vi.advanceTimersByTime(1); });
      expectPresentation(container, 1);
      expect(layerVideo(container, 0)).toBe(video);
      expect(video).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
    } finally { frames.restore(); }
  });

  it('waits for the full watchdog before skipping an unready first direct MP4', () => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')], 5);
      const video = layerVideo(container, 0);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS - 1); });
      expect(layerVideo(container, 0)).toBe(video);
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      expect(container.querySelector('section')).toHaveAttribute('data-presented-slide', '');
      act(() => { vi.advanceTimersByTime(1); });
      expectPresentation(container, 1);
    } finally { frames.restore(); }
  });

  it('presents the cold first video through the no-RVFC playing fallback', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image')]);
    const video = layerVideo(container, 0);
    setMediaState(video, 2, 1);
    fireEvent.loadedData(video);
    expect(container.querySelector('section')).toHaveAttribute('data-presented-slide', '');
    fireEvent.playing(video);
    expectPresentation(container, 0);
  });

  it('keeps outgoing fallback media while the next video is pending', async () => {
    const frames = mockBannerVideoFrames();
    try {
      play.mockImplementationOnce(() => Promise.reject(new Error('temporary failure')));
      const { container } = renderCarousel([slide('still', 'video'), slide('girl', 'video', CARVE_GIRL_MP4)]);
      await act(async () => { await Promise.resolve(); });
      expectPresentation(container, 0);
      const image = backgroundLayers(container)[0].querySelector('img');
      fireEvent.click(container.querySelector('.hero-pagination')!);
      expectPresentation(container, 0);
      expect(backgroundLayers(container)[0].querySelector('img')).toBe(image);
      expect(backgroundLayers(container)[0].querySelector('video')).toBeNull();
      const incoming = layerVideo(container, 1);
      setMediaState(incoming, 2, 1);
      frames.deliver(incoming);
      expectPresentation(container, 1);
    } finally { frames.restore(); }
  });

  it('recovers the same girl URL after transient failure and keeps the recovered element over five cycles', async () => {
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('photo', 'image'), slide('last', 'image')]);
      const first = layerVideo(container, 0);
      setMediaState(first, 2, 1);
      frames.deliver(first);
      expectPresentation(container, 0);
      const click = () => fireEvent.click(container.querySelector('.hero-pagination')!);
      click(); click();
      play.mockImplementationOnce(() => Promise.reject(new Error('transient activation failure')));
      click();
      await act(async () => { await Promise.resolve(); });
      expectPresentation(container, 1);
      click();
      const recovered = layerVideo(container, 0);
      expect(recovered).not.toBe(first);
      expect(recovered).toHaveAttribute('src', CARVE_GIRL_MP4);
      setMediaState(recovered, 2, 1);
      click();
      expect(container.querySelector('section')).toHaveAttribute('data-desired-slide', '0');
      expectPresentation(container, 2);
      frames.deliver(recovered);
      expectPresentation(container, 0);
      for (let cycle = 0; cycle < 5; cycle++) {
        recovered.currentTime = 3;
        click(); click(); click();
        expectPresentation(container, 2);
        expect(layerVideo(container, 0)).toBe(recovered);
        expect(recovered.currentTime).toBe(0);
        fireEvent.seeked(recovered);
        frames.deliver(recovered);
        expectPresentation(container, 0);
        expect(recovered).toHaveAttribute('src', CARVE_GIRL_MP4);
      }
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).not.toContain(recovered);
    } finally { frames.restore(); }
  });

  it('bounds a chain where every video rejects instead of retrying forever', async () => {
    vi.useFakeTimers();
    play.mockImplementation(() => Promise.reject(new Error('playback denied')));
    const { container } = renderCarousel([slide('girl', 'video', CARVE_GIRL_MP4), slide('other', 'video', 'https://example.com/other.mp4')]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(play).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS * 3); });
    expect(play).toHaveBeenCalledTimes(2);
    expect(container.querySelector('section')).toHaveAttribute('data-presented-slide', '');
  });

  it('restarts girl.mp4 through five full cycles without resource churn or stale readiness', () => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([
        slide('girl', 'video', CARVE_GIRL_MP4), slide('two', 'image'), slide('three', 'image'),
      ], 5);
      const video = layerVideo(container, 0);
      const load = vi.mocked(HTMLMediaElement.prototype.load);
      setMediaState(video, 2, 1);
      const observer = new MutationObserver(() => {});
      observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      const clickNext = () => fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
      for (let cycle = 0; cycle < 6; cycle++) {
        expect(layerVideo(container, 0)).toBe(video);
        expect(video).toHaveAttribute('src', CARVE_GIRL_MP4);
        expect(video.currentTime).toBe(0);
        expect(video).toHaveStyle({ opacity: '0' });
        expect(backgroundLayers(container)[0]).toHaveClass('opacity-0');
        if (cycle > 0) expect(backgroundLayers(container)[2]).toHaveClass('opacity-100');
        if (cycle > 0) expectPresentation(container, 2);
        // Old readiness must neither reveal nor start the new slide's interval.
        act(() => { vi.advanceTimersByTime(5000); });
        expect(video).toHaveAttribute('data-video-role', 'ACTIVE');
        fireEvent.seeked(video);
        frames.deliver(video);
        expect(video).toHaveStyle({ opacity: '1' });
        expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
        expectPresentation(container, 0);
        expect(container.querySelectorAll('img')).toHaveLength(2);
        video.currentTime = 3;
        if (cycle === 5) break;
        clickNext();
        expect(pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(3);
        clickNext();
        clickNext();
      }
      expect(play).toHaveBeenCalledTimes(6);
      expect(load).not.toHaveBeenCalled();
      const mutations = observer.takeRecords();
      expect(mutations.filter((record) => record.type === 'attributes')).toHaveLength(0);
      expect(mutations.flatMap((record) => [...record.removedNodes])
        .filter((node) => node instanceof HTMLVideoElement)).toHaveLength(0);
      observer.disconnect();
    } finally { frames.restore(); }
  });

  it('keeps the last visible outgoing layer when an unready incoming video is skipped', () => {
    const { container } = renderCarousel([
      slide('photo', 'image'), slide('one', 'video'), slide('two', 'video'),
    ]);
    const clickNext = () => fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
    clickNext();
    clickNext();
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
    expect(backgroundLayers(container)[2]).toHaveClass('opacity-0');
    expect(videoCount(container)).toBeLessThanOrEqual(2);
    confirmPlayback(layerVideo(container, 2));
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-0');
    expect(backgroundLayers(container)[2]).toHaveClass('opacity-100');
  });

  it('waits for the pending incoming frame before restarting the only visible outgoing video', () => {
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('a', 'video'), slide('b', 'video')]);
      const a = layerVideo(container, 0);
      const b = layerVideo(container, 1);
      setMediaState(a, 2, 1);
      setMediaState(b, 2, 1);
      frames.deliver(a);
      a.currentTime = 3;
      fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
      const section = container.querySelector('section')!;
      fireEvent.touchStart(section, { touches: [{ clientX: 0, clientY: 0 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientX: 100, clientY: 0 }] });
      expect(a).toHaveAttribute('data-video-role', 'OUTGOING');
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
      expect(a.currentTime).toBe(3);
      frames.deliver(b);
      expect(a).toHaveAttribute('data-video-role', 'ACTIVE');
      expect(a.currentTime).toBe(0);
      expect(a).toHaveStyle({ opacity: '0' });
      expect(backgroundLayers(container)[1]).toHaveClass('opacity-100');
      fireEvent.seeked(a);
      frames.deliver(a);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
      expect(layerVideo(container, 0)).toBe(a);
      expect(layerVideo(container, 1)).toBe(b);
      expect(videoCount(container)).toBe(2);
      expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
    } finally { frames.restore(); }
  });

  it('returns immediately to an outgoing image while the incoming video is pending', () => {
    const { container } = renderCarousel([slide('photo', 'image'), slide('video', 'video')]);
    fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
    const section = container.querySelector('section')!;
    fireEvent.touchStart(section, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(section, { changedTouches: [{ clientX: 100, clientY: 0 }] });
    expect(container.querySelector('button[aria-label^="goToSlide"]')).toHaveAttribute('aria-label', 'goToSlide 1 / 2');
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
    expect(container.querySelector('video[data-video-role="ACTIVE"]')).toBeNull();
  });

  it.each(['reject', 'watchdog'] as const)('keeps the visible outgoing after queued incoming MP4 %s without an image fallback', async (failure) => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([
        slide('girl', 'video', CARVE_GIRL_MP4), slide('other', 'video', 'https://example.com/other.mp4'),
      ], 5);
      const a = layerVideo(container, 0);
      const b = layerVideo(container, 1);
      setMediaState(a, 2, 1);
      setMediaState(b, 2, 1);
      frames.deliver(a);
      a.currentTime = 3;
      if (failure === 'reject') play.mockImplementationOnce(() => Promise.reject(new Error('incoming failed')));
      fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
      const section = container.querySelector('section')!;
      fireEvent.touchStart(section, { touches: [{ clientX: 0, clientY: 0 }] });
      fireEvent.touchEnd(section, { changedTouches: [{ clientX: 100, clientY: 0 }] });
      if (failure === 'watchdog') act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS); });
      else await act(async () => { await Promise.resolve(); });
      expect(layerVideo(container, 0)).toBe(a);
      expect(a).toHaveAttribute('data-video-role', 'OUTGOING');
      expect(a.currentTime).toBe(3);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
      expect(backgroundLayers(container)[1]).toHaveClass('opacity-0');
      expect(container.querySelector('img')).toBeNull();
      act(() => { vi.advanceTimersByTime(HERO_CROSSFADE_MS); });
      expect(a).toHaveAttribute('data-video-role', 'OUTGOING');
      // No other viable target remains: preserve the previous slide as a whole.
      if (failure === 'watchdog') act(() => { vi.advanceTimersByTime(5000 - HERO_CROSSFADE_MS); });
      else fireEvent.click(container.querySelector('button[aria-label^="goToSlide"]')!);
      expect(a).toHaveAttribute('data-video-role', 'OUTGOING');
      expect(a.currentTime).toBe(3);
      expectPresentation(container, 0);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
      expect(a).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).not.toContain(a);
      expect(videoCount(container)).toBeLessThanOrEqual(2);
    } finally { frames.restore(); }
  });

  it.each(['reject', 'watchdog'] as const)('skips a direct MP4 after %s without changing presentation while pending', async (failure) => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([
        slide('photo', 'image'), slide('girl', 'video', CARVE_GIRL_MP4), slide('next', 'image'),
      ], 5);
      expectPresentation(container, 0);
      if (failure === 'reject') play.mockImplementationOnce(() => Promise.reject(new Error('failed')));
      fireEvent.click(container.querySelector('.hero-pagination')!);
      expectPresentation(container, 0);
      if (failure === 'watchdog') {
        act(() => { vi.advanceTimersByTime(5000); });
        expectPresentation(container, 0); // No duration timer for an uncommitted slide.
        act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS - 5000); });
      } else await act(async () => { await Promise.resolve(); });
      expectPresentation(container, 2);
      expect(backgroundLayers(container)[1].querySelector('video,img')).toBeNull();
      act(() => { vi.advanceTimersByTime(5000); });
      expectPresentation(container, 0);
      act(() => { vi.advanceTimersByTime(5000); });
      expectPresentation(container, 0); // A transient failure gets a new readiness attempt.
      const retry = layerVideo(container, 1);
      setMediaState(retry, 2, 1);
      fireEvent.seeked(retry);
      frames.deliver(retry);
      expectPresentation(container, 1);
      expect(retry).toHaveAttribute('src', CARVE_GIRL_MP4);
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).not.toContain(retry);
    } finally { frames.restore(); }
  });

  it('commits the same-slide image fallback together with copy and indicator', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel([slide('photo', 'image'), slide('video', 'video'), slide('next', 'image')], 5);
    fireEvent.click(container.querySelector('.hero-pagination')!);
    expectPresentation(container, 0);
    fireEvent.error(layerVideo(container, 1));
    expectPresentation(container, 1);
    expect(backgroundLayers(container)[1].querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/video.webp');
    act(() => { vi.advanceTimersByTime(5000); });
    expectPresentation(container, 2);
  });

  it('retries a previously failed source after configuration changes away and back during terminal hold', () => {
    const frames = mockBannerVideoFrames();
    try {
      const b = slide('girl', 'video', CARVE_GIRL_MP4);
      const view = (middle: CustomHeroSlide) => <HeroCarousel
        data={{ slides: [slide('photo', 'image'), middle, slide('other', 'video', 'https://example.com/other.mp4')],
          language: 'en', theme: 'dark' }} actions={{ onScrollToSection: vi.fn() }} />;
      const { container, rerender } = render(view(b));
      fireEvent.click(container.querySelector('.hero-pagination')!);
      fireEvent.error(layerVideo(container, 1));
      fireEvent.error(layerVideo(container, 2));
      expectPresentation(container, 0);
      rerender(view({ ...b, backgroundImage: 'https://example.com/replacement.mp4' }));
      fireEvent.error(layerVideo(container, 1));
      expectPresentation(container, 0);
      rerender(view(b));
      const recovered = layerVideo(container, 1);
      setMediaState(recovered, 2, 1);
      frames.deliver(recovered);
      expectPresentation(container, 1);
      expect(recovered).toHaveAttribute('src', CARVE_GIRL_MP4);
    } finally { frames.restore(); }
  });

  it('keeps copy/media/indicator together when navigation advances during pending media', () => {
    const frames = mockBannerVideoFrames();
    try {
      const { container } = renderCarousel([slide('photo', 'image'), slide('one', 'video'), slide('two', 'video')]);
      fireEvent.click(container.querySelector('.hero-pagination')!);
      expectPresentation(container, 0);
      const abandoned = layerVideo(container, 1);
      const [, { callback }] = frames.pending(abandoned);
      fireEvent.click(container.querySelector('.hero-pagination')!);
      expectPresentation(container, 0);
      setMediaState(abandoned, 2, 1);
      act(() => callback(0, {} as VideoFrameCallbackMetadata));
      expectPresentation(container, 0);
      const incoming = layerVideo(container, 2);
      setMediaState(incoming, 2, 1);
      frames.deliver(incoming);
      expectPresentation(container, 2);
      expect(videoCount(container)).toBeLessThanOrEqual(2);
    } finally { frames.restore(); }
  });

  it.each(['source', 'mode'] as const)('invalidates old readiness after %s changes away and back without navigation', (change) => {
    vi.useFakeTimers();
    const frames = mockBannerVideoFrames();
    try {
      const original = slide('girl', 'video', CARVE_GIRL_MP4);
      const view = (first: CustomHeroSlide) => <HeroCarousel
        data={{ slides: [first, slide('image', 'image')], language: 'en', theme: 'dark', slideIntervalSeconds: 5 }}
        actions={{ onScrollToSection: vi.fn() }} />;
      const { container, rerender } = render(view(original));
      const first = layerVideo(container, 0);
      setMediaState(first, 2, 1);
      frames.deliver(first);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
      rerender(view(change === 'source' ? { ...original, backgroundImage: 'https://example.com/other.mp4' }
        : { ...original, backgroundMediaMode: 'image' }));
      rerender(view(original));
      const video = layerVideo(container, 0);
      setMediaState(video, 2, 1);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-0');
      expect(video).toHaveStyle({ opacity: '0' });
      act(() => { vi.advanceTimersByTime(5000); });
      expect(video).toHaveAttribute('data-video-role', 'ACTIVE');
      frames.deliver(video);
      expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');
    } finally { frames.restore(); }
  });
});

function focalX(element: Element | null): string {
  return (element as HTMLElement | null)?.style.getPropertyValue('--hero-mobile-position-x') ?? '';
}

describe('HeroCarousel mobile focal point', () => {
  it('centers an existing banner that has no mobileFocalPointX', () => {
    const { container } = renderCarousel([slide('a', 'image')]);
    const image = container.querySelector('img');

    expect(focalX(image)).toBe('50%');
    expect(image?.style.getPropertyValue('--hero-mobile-position-y')).toBe('50%');
    expect(image?.style.objectPosition).toBe('');
    expect(image).toHaveClass('object-cover', 'object-center', 'hero-banner-media');
  });

  it('applies the same per-slide focal point to image and video media', () => {
    const imageCarousel = renderCarousel([
      { ...slide('photo', 'image'), mobileFocalPointX: 76 },
    ]);
    const videoCarousel = renderCarousel([
      { ...slide('film', 'video'), mobileFocalPointX: 76 },
    ]);

    expect(focalX(imageCarousel.container.querySelector('img'))).toBe('76%');
    expect(focalX(videoCarousel.container.querySelector('video'))).toBe('76%');
    expect(videoCarousel.container.querySelector('img')).toBeNull();
    expect(videoCarousel.container.querySelector('video')?.style.objectPosition).toBe('');
  });

  it('keeps each slide, including the preload video, on its own focal point', () => {
    const { container } = renderCarousel([
      { ...slide('a', 'video'), mobileFocalPointX: 76 },
      { ...slide('b', 'video'), mobileFocalPointX: 32 },
      { ...slide('c', 'image'), mobileFocalPointX: 10 },
    ]);
    const layers = backgroundLayers(container);
    const activeVideo = layers[0].querySelector('video');
    const preloadVideo = layers[1].querySelector('video');

    expect(activeVideo).toHaveAttribute('data-video-role', 'ACTIVE');
    expect(preloadVideo).toHaveAttribute('data-video-role', 'NEXT_PRELOAD');
    expect(focalX(activeVideo)).toBe('76%');
    expect(focalX(preloadVideo)).toBe('32%');
    expect(focalX(layers[2].querySelector('img'))).toBe('10%');
    expect(layers[1].querySelector('img')).toBeNull();
  });

  it('does not emit an invalid object-position variable for malformed values', () => {
    const { container } = renderCarousel([
      { ...slide('low', 'image'), mobileFocalPointX: -10 },
      { ...slide('high', 'video'), mobileFocalPointX: 120 },
      { ...slide('bad', 'image'), mobileFocalPointX: Number.NaN },
    ]);
    const layers = backgroundLayers(container);

    expect(focalX(layers[0].querySelector('img'))).toBe('0%');
    expect(focalX(layers[1].querySelector('video'))).toBe('100%');
    expect(focalX(layers[2].querySelector('img'))).toBe('50%');
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('keeps desktop object-position centered and limits the shift to the mobile breakpoint', () => {
    const css = readFileSync(resolve('src/index.css'), 'utf8');
    const rule = css.match(
      /\.ui-hero\.hero-layout \.hero-banner-media \{[^}]*object-fit: cover;[^}]*object-position: center center;[^}]*\}\s*@media \(max-width: 767px\) \{\s*\.ui-hero\.hero-layout \.hero-banner-media \{\s*object-position: var\(--hero-mobile-position-x, 50%\) var\(--hero-mobile-position-y, 50%\);/
    );

    expect(rule).not.toBeNull();
  });
});
