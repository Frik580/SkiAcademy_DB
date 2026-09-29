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

describe('BookingModalHeader KZT pricing', () => {
  it('displays the canonical KZT rate when the legacy rate conflicts', () => {
    const { container } = render(
      <BookingModalHeader targetInstructor={instructor} t={t} onClose={() => undefined} />
    );
    const text = (container.textContent ?? '').replace(/\s/g, '');

    expect(text).toContain('30000₸/ч');
    expect(text).not.toContain('$60');
    expect(text).not.toMatch(/(^|[^0-9])60₸\/ч/);
  });

  it('does not reinterpret the legacy rate when a KZT rate is missing', () => {
    const { container } = render(
      <BookingModalHeader
        targetInstructor={{ ...instructor, pricePerHourKZT: undefined }}
        t={t}
        onClose={() => undefined}
      />
    );

    expect(container.textContent).toContain('—/ч');
    expect(container.textContent).not.toContain('$60');
  });
});
