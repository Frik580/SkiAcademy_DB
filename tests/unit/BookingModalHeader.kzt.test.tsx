import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import { BookingModalHeader } from '../../src/features/bookings/components/booking_modal/BookingModalHeader';
import type { Instructor } from '../../src/types';

const instructor: Instructor = {
  id: 'instructor_kzt_header',
  name: 'Coach KZT',
  specialty: 'ski',
  rating: null,
  reviewsCount: 0,
  languages: [],
  experienceYears: 5,
  bio: '',
  avatarUrl: '',
  pricePerHour: 60,
  pricePerHourKZT: 30_000,
  isAvailable: true,
};

const t = (key: TranslationKey) => (key === 'hr' ? 'ч' : key);

describe('BookingModalHeader', () => {
  it('keeps the instructor image and close button without visible text', () => {
    const { container } = render(
      <BookingModalHeader targetInstructor={instructor} t={t} onClose={() => undefined} />
    );
    expect(container.textContent).toBe('');
    expect(container.querySelector('img')?.alt).toBe(instructor.name);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('cancel');
  });

  it('keeps the header text-free when a KZT rate is missing', () => {
    const { container } = render(
      <BookingModalHeader
        targetInstructor={{ ...instructor, pricePerHourKZT: undefined }}
        t={t}
        onClose={() => undefined}
      />
    );

    expect(container.textContent).toBe('');
  });
});
