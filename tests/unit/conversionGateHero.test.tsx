import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCarousel } from '../../src/app/components/HeroCarousel';
import { ConversionGateInstagramCta } from '../../src/features/landing';
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
  it('shows the slide copy and the original on-site hero actions', () => {
    const onScrollToSection = vi.fn();
    render(
      <HeroCarousel
        data={{
          slides: [slide()],
          configReady: true,
          language: 'ru',
          theme: 'light',
        }}
        actions={{ onScrollToSection }}
      />
    );

    expect(screen.getByText('Надзаголовок')).toBeInTheDocument();
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.queryByTestId('conversion-gate-headline')).toBeNull();
    expect(screen.queryByTestId('conversion-gate-price')).toBeNull();
    expect(screen.queryByTestId('conversion-gate-course')).toBeNull();
    expect(screen.queryByTestId('conversion-gate-instagram-hero')).toBeNull();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByText(/от 25 000|от 30 000/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'startYourJourney' }));
    fireEvent.click(screen.getByRole('button', { name: 'chooseCourse' }));
    expect(onScrollToSection).toHaveBeenNthCalledWith(1, 'coaches-grid');
    expect(onScrollToSection).toHaveBeenNthCalledWith(2, 'courses-grid');
  });

  it('renders the shared Instagram CTA with the confirmed href and labels', () => {
    const { unmount } = render(<ConversionGateInstagramCta language="ru" placement="header" />);
    const ru = screen.getByTestId('conversion-gate-instagram-header');
    expect(ru).toHaveAttribute('href', 'https://www.instagram.com/carve_academy');
    expect(ru).toHaveAttribute('target', '_blank');
    expect(ru).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ru).toHaveTextContent('Написать в Instagram');
    unmount();

    render(<ConversionGateInstagramCta language="en" placement="header" />);
    expect(screen.getByTestId('conversion-gate-instagram-header')).toHaveTextContent(
      'Message on Instagram'
    );
  });
});
