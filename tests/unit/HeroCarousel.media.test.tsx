import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from '../../src/app/components/HeroCarousel';
import type { CustomHeroSlide } from '../../src/types';

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
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

afterEach(() => {
  document.querySelectorAll('link[data-hero-lcp-preload]').forEach((node) => node.remove());
  vi.useRealTimers();
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

function renderCarousel(slides: CustomHeroSlide[], slideIntervalSeconds = 60) {
  return render(
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
}

function backgroundLayers(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('div.absolute.inset-0.will-change-\\[opacity\\]')
  );
}

function advance(container: HTMLElement) {
  const button = container.querySelector('button[aria-label^="goToSlide"]');
  if (!button) throw new Error('missing slide control');
  fireEvent.click(button);
}

function videoSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('video')).map((video) => video.getAttribute('src') ?? '');
}

describe('HeroCarousel video preload', () => {
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
    video.currentTime = 5;

    fireEvent.canPlay(video);

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

  it('preloads the first slide when the carousel wraps from the last slide', () => {
    const { container } = renderCarousel([
      slide('a', 'video'),
      slide('b', 'video'),
      slide('c', 'video'),
      slide('d', 'video'),
    ]);

    advance(container);
    advance(container);

    expect(videoSources(container)).not.toContain('https://cdn.example.com/a.mp4');

    advance(container);

    expect(videoSources(container)).toContain('https://cdn.example.com/a.mp4');
    const first = backgroundLayers(container)[0];
    expect(first.querySelector('video')).toHaveAttribute('preload', 'auto');
    expect(first.querySelector('img')).toBeNull();
    expect(first).toHaveClass('opacity-0');
  });

  it('keeps hero copy classes from the typography regression fix', () => {
    const { container } = renderCarousel([slide('a', 'video'), slide('b', 'image')]);
    const title = container.querySelector('.hero-copy-title');
    const eyebrow = container.querySelector('.hero-copy-eyebrow');
    const body = container.querySelector('.hero-copy-body');

    expect(title?.className).toContain('font-serif');
    expect(title?.className).toContain('font-light');
    expect(title?.className).toContain('text-4xl');
    expect(title?.className).toContain('md:text-5xl');
    expect(title?.className).toContain('lg:text-6xl');
    expect(eyebrow?.className).toContain('font-mono');
    expect(eyebrow?.className).toContain('uppercase');
    expect(body?.className).toContain('hero-copy-body');
    expect(body?.className).toContain('max-w-lg');
  });

  it('does not start the video slide timer before the mp4 can play', () => {
    vi.useFakeTimers();
    const { container } = renderCarousel(
      [slide('a', 'video'), slide('b', 'image')],
      5
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(backgroundLayers(container)[0]).toHaveClass('opacity-100');

    fireEvent.canPlay(container.querySelector('video')!);

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
