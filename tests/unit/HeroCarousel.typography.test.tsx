import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from '../../src/app/components/HeroCarousel';
import type { CustomHeroSlide } from '../../src/types';

beforeEach(() => {
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

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' as const }),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

const baseSlide = (overrides: Partial<CustomHeroSlide> = {}): CustomHeroSlide => ({
  id: 'slide-1',
  line1En: 'Eyebrow',
  line1Ru: 'А',
  line2En: 'Title',
  line2Ru: 'З',
  line3En: 'Body',
  line3Ru: 'Т',
  backgroundImage: 'wall',
  ...overrides,
});

function heroCopyClasses(container: HTMLElement) {
  return {
    eyebrow: container.querySelector('.hero-copy-eyebrow')?.className ?? '',
    title: container.querySelector('.hero-copy-title')?.className ?? '',
  };
}

function firstBackgroundMediaChild(container: HTMLElement): Element | null {
  const slideLayer = container.querySelector('.will-change-\\[opacity\\]');
  return slideLayer?.firstElementChild ?? null;
}

describe('HeroCarousel typography vs media mode', () => {
  it('keeps background img as direct child of slide layer in image mode', () => {
    const { container } = render(
      <HeroCarousel
        data={{
          slides: [baseSlide({ backgroundMediaMode: 'image' })],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );
    expect(firstBackgroundMediaChild(container)?.tagName).toBe('IMG');
  });

  it('uses identical hero copy classes for image and video modes', () => {
    const imageRender = render(
      <HeroCarousel
        data={{
          slides: [baseSlide({ backgroundMediaMode: 'image' })],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );
    const imageCopy = heroCopyClasses(imageRender.container);
    expect(imageRender.container.querySelector('.hero-copy')).not.toBeNull();
    expect(imageRender.container.querySelector('.hero-actions')).not.toBeNull();
    imageRender.unmount();

    const videoRender = render(
      <HeroCarousel
        data={{
          slides: [baseSlide({ backgroundMediaMode: 'video' })],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );
    const videoCopy = heroCopyClasses(videoRender.container);

    expect(videoCopy).toEqual(imageCopy);
    expect(imageCopy.title).toContain('hero-copy-title');
    expect(imageCopy.title).toContain('font-serif');
    expect(imageCopy.title).toContain('text-4xl');
    expect(imageCopy.title).toContain('md:text-5xl');
    expect(imageCopy.title).toContain('lg:text-6xl');
    expect(imageCopy.eyebrow).toContain('font-mono');
    expect(imageRender.container.querySelector('.hero-copy-body')).toBeNull();
  });

  it('does not change hero copy classes when only backgroundMediaMode changes', () => {
    const { container, rerender } = render(
      <HeroCarousel
        data={{
          slides: [baseSlide({ backgroundMediaMode: 'image' })],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );
    const before = heroCopyClasses(container);

    rerender(
      <HeroCarousel
        data={{
          slides: [baseSlide({ backgroundMediaMode: 'video' })],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );
    const after = heroCopyClasses(container);

    expect(after).toEqual(before);
    expect(firstBackgroundMediaChild(container)?.tagName).toBe('IMG');
  });
});

describe('HeroCarousel responsive layout structure', () => {
  it('keeps centered copy separate from actions and mobile pagination', () => {
    const { container } = render(
      <HeroCarousel
        data={{
          slides: [
            baseSlide({ id: 'a' }),
            baseSlide({ id: 'b', line2En: 'A longer second line for wrap testing' }),
          ],
          configReady: true,
          language: 'en',
          theme: 'dark',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );

    const copy = container.querySelector('.hero-copy');
    const actions = container.querySelector('.hero-actions');
    const actionsShell = container.querySelector('.hero-actions-shell');
    const copyStack = container.querySelector('.hero-copy-stack');
    const paginationShell = container.querySelector('.hero-pagination-shell');
    const stage = container.querySelector('.hero-stage');

    expect(stage).not.toBeNull();
    expect(copyStack).not.toBeNull();
    expect(copy).not.toBeNull();
    expect(actionsShell).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(paginationShell).not.toBeNull();

    expect(copy?.contains(actionsShell)).toBe(false);
    expect(copy?.querySelector('.hero-actions')).toBeNull();
    expect(actionsShell?.parentElement).toBe(copyStack);
    expect(paginationShell?.parentElement).toBe(stage);
    expect(paginationShell?.contains(actionsShell)).toBe(false);
    expect(container.querySelector('.hero-foreground')).toBeNull();
  });
});
