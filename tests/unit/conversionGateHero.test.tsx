import { render, screen } from '@testing-library/react';
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
  useLanguage: () => ({ t: (key: string) => key, language: 'ru' as const }),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

const slide = (): CustomHeroSlide => ({
  id: 'slide-1',
  line1En: 'Eyebrow',
  line1Ru: 'Надзаголовок',
  line2En: 'Title',
  line2Ru: 'Заголовок',
  line3En: 'Body',
  line3Ru: 'Текст',
  backgroundImage: 'wall',
});

describe('HeroCarousel conversion gate', () => {
  it('shows location, product, price, and an inert WhatsApp control above the fold', () => {
    render(
      <HeroCarousel
        data={{
          slides: [slide()],
          configReady: true,
          language: 'ru',
          theme: 'light',
          startingPriceLine: '[[GROWTH_COPY: starting_price_prefix]] 18 000 ₸ / ч',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );

    expect(screen.getByTestId('conversion-gate-location')).toHaveTextContent(
      '[[GROWTH_COPY: hero_location]]'
    );
    expect(screen.getByTestId('conversion-gate-product')).toHaveTextContent(
      '[[GROWTH_COPY: hero_product]]'
    );
    expect(screen.getByTestId('conversion-gate-price')).toHaveTextContent('18 000 ₸');
    const whatsapp = screen.getByTestId('conversion-gate-whatsapp-hero');
    expect(whatsapp).toHaveAttribute('aria-disabled', 'true');
    expect(whatsapp.tagName).not.toBe('A');
    expect(whatsapp.closest('.hero-actions')).not.toBeNull();
    expect(whatsapp.className).not.toMatch(/fixed|sticky/);
  });
});
