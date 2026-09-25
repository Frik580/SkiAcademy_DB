import { cleanup, render, screen } from '@testing-library/react';

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverStub,
});
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { InstructorCard } from '../../src/features/profile/components/InstructorCard';
import type { Instructor } from '../../src/types';

function instructor(overrides: Partial<Instructor> = {}): Instructor {
  return {
    id: 'instructor_locale_01',
    name: 'Arsenii Gerasimchuk',
    specialty: 'ski',
    rating: null,
    reviewsCount: 0,
    languages: ['ru'],
    experienceYears: 4,
    bio: 'Профессиональный инструктор Школы.',
    bioRu: 'Профессиональный инструктор Школы.',
    bioEn: 'Professional school instructor.',
    avatarUrl: '',
    pricePerHour: 1000,
    pricePerHourKZT: 25000,
    isAvailable: true,
    ...overrides,
  };
}

function renderCard(language: 'en' | 'ru', value: Instructor) {
  localStorage.setItem('alpine_glide_lang', language);
  return render(
    <LanguageProvider>
      <InstructorCard instructor={value} onBook={() => undefined} />
    </LanguageProvider>
  );
}

describe('instructor profile localization', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the Russian bio in the RU locale', () => {
    renderCard('ru', instructor());
    expect(screen.getByText('Профессиональный инструктор Школы.')).toBeInTheDocument();
  });

  it('renders the English bio in the EN locale', () => {
    renderCard('en', instructor());
    expect(screen.getByText('Professional school instructor.')).toBeInTheDocument();
    expect(screen.queryByText('Профессиональный инструктор Школы.')).not.toBeInTheDocument();
  });

  it('renders ru as русский in RU and Russian in EN', () => {
    renderCard('ru', instructor());
    expect(screen.getAllByText('русский').length).toBeGreaterThan(0);
    cleanup();
    renderCard('en', instructor());
    expect(screen.getAllByText('Russian').length).toBeGreaterThan(0);
  });

  it('maps a legacy stored русский value to the canonical Russian label', () => {
    renderCard(
      'en',
      instructor({
        languages: ['русский'],
        bioRu: undefined,
        bioEn: undefined,
      })
    );
    expect(screen.getAllByText('Russian').length).toBeGreaterThan(0);
  });

  it('uses bioRu for RU and falls back to legacy bio when bioRu is absent', () => {
    renderCard(
      'ru',
      instructor({
        bio: 'Legacy Russian bio',
        bioRu: 'Explicit Russian bio',
        bioEn: 'English bio',
      })
    );
    expect(screen.getByText('Explicit Russian bio')).toBeInTheDocument();
    cleanup();
    renderCard(
      'ru',
      instructor({
        bio: 'Legacy Russian bio',
        bioRu: undefined,
        bioEn: 'English bio',
      })
    );
    expect(screen.getByText('Legacy Russian bio')).toBeInTheDocument();
  });

  it('prefers bioEn in EN and falls back to legacy bio only when bioEn is empty', () => {
    renderCard('en', instructor());
    expect(screen.getByText('Professional school instructor.')).toBeInTheDocument();
    expect(screen.queryByText('Профессиональный инструктор Школы.')).not.toBeInTheDocument();
    cleanup();
    renderCard(
      'en',
      instructor({
        bioRu: undefined,
        bioEn: undefined,
        languages: [],
      })
    );
    expect(screen.getByText('Профессиональный инструктор Школы.')).toBeInTheDocument();
  });

  it('keeps a legacy bio visible when localized bios are absent', () => {
    renderCard(
      'en',
      instructor({
        bioRu: undefined,
        bioEn: undefined,
        languages: [],
      })
    );
    expect(screen.getByText('Профессиональный инструктор Школы.')).toBeInTheDocument();
  });
});
