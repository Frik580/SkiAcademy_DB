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
  it('shows the landed Russian hero copy and hides WhatsApp until a URL exists', () => {
    render(
      <HeroCarousel
        data={{
          slides: [slide()],
          configReady: true,
          language: 'ru',
          theme: 'light',
        }}
        actions={{ onScrollToSection: vi.fn() }}
      />
    );

    expect(screen.getByTestId('conversion-gate-headline')).toHaveTextContent(
      'Индивидуальные уроки на Шымбулаке'
    );
    expect(screen.getByTestId('conversion-gate-subline')).toHaveTextContent(
      'Лыжи и сноуборд · техника, прогресс и видеоразбор · Алматы'
    );
    expect(screen.getByTestId('conversion-gate-price')).toHaveTextContent('от 25 000 ₸/час');
    expect(screen.getByTestId('conversion-gate-course')).toHaveTextContent('курсы от 250 000 ₸');
    expect(screen.getByTestId('conversion-gate-hero-secondary')).toHaveTextContent('Выбрать урок');
    expect(screen.queryByTestId('conversion-gate-whatsapp-hero')).toBeNull();
    expect(screen.queryByText(/от 30 000/)).toBeNull();
    expect(screen.queryByText(/Отзывов пока нет|0 отзывов|No reviews yet/i)).toBeNull();
  });
});
