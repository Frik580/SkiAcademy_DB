import { describe, expect, it } from 'vitest';
import { getCourseEnrichedData } from '../../src/features/courses/components/course_details/courseEnrichedData';
import {
  CONVERSION_GATE_COPY,
  isGrowthCopyPlaceholder,
  resolveWhatsAppHref,
} from '../../src/features/landing/conversionGateCopy';
import {
  countVerifiedInstructorReviews,
  formatStartingPriceLine,
  selectStartingPrice,
} from '../../src/features/landing/conversionGatePrice';

describe('conversion gate copy', () => {
  it('keeps Growth tokens in place until copy is injected', () => {
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.heroLocation)).toBe(true);
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.heroProduct)).toBe(true);
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.waUrl)).toBe(true);
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.waCtaLabel)).toBe(true);
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.startingPricePrefix)).toBe(true);
    expect(isGrowthCopyPlaceholder(CONVERSION_GATE_COPY.startingPriceFallback)).toBe(true);
  });

  it('does not activate a WhatsApp link from a placeholder or a non-WhatsApp URL', () => {
    expect(resolveWhatsAppHref(CONVERSION_GATE_COPY.waUrl)).toBeNull();
    expect(resolveWhatsAppHref('https://example.com/chat')).toBeNull();
    expect(resolveWhatsAppHref('http://wa.me/77001234567')).toBeNull();
    expect(resolveWhatsAppHref('not a url')).toBeNull();
  });

  it('accepts an https WhatsApp URL once Growth replaces the token', () => {
    expect(resolveWhatsAppHref('https://wa.me/77000000000')).toBe('https://wa.me/77000000000');
    expect(resolveWhatsAppHref('https://api.whatsapp.com/send?phone=77000000000')).toBe(
      'https://api.whatsapp.com/send?phone=77000000000'
    );
  });
});

describe('conversion gate price and reviews', () => {
  const formatAmount = (amount: number) => `${amount} ₸`;

  it('uses the lowest instructor hourly KZT price', () => {
    const source = selectStartingPrice({
      instructorHourlyKzt: [undefined, 25000, 18000, 0, Number.NaN],
      coursePackageKzt: [9000],
    });
    expect(source).toEqual({ kind: 'instructor_hourly', amountKzt: 18000 });
    expect(formatStartingPriceLine(source, formatAmount, 'ч')).toBe(
      '[[GROWTH_COPY: starting_price_prefix]] 18000 ₸ / ч'
    );
  });

  it('falls back to a course package price when no hourly KZT rate exists', () => {
    const source = selectStartingPrice({
      instructorHourlyKzt: [undefined, null],
      coursePackageKzt: [45000, 30000],
    });
    expect(formatStartingPriceLine(source, formatAmount, 'ч')).toBe(
      '[[GROWTH_COPY: starting_price_prefix]] 30000 ₸'
    );
  });

  it('uses the price placeholder when no verified KZT amount exists', () => {
    const source = selectStartingPrice({
      instructorHourlyKzt: [],
      coursePackageKzt: [0],
    });
    expect(formatStartingPriceLine(source, formatAmount, 'hr')).toBe(
      '[[GROWTH_COPY: starting_price_line]]'
    );
  });

  it('counts only positive canonical review totals', () => {
    expect(
      countVerifiedInstructorReviews([
        { reviewsCount: 0 },
        { reviewsCount: 2 },
        { reviewsCount: null },
        { reviewsCount: 1.9 },
        {},
      ])
    ).toBe(3);
  });
});

describe('course catalogue reviews', () => {
  it('does not include invented testimonials', () => {
    const data = getCourseEnrichedData('course-1', 'beginner', 'Ski foundations', 'ru');
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/Alex Thompson|Emma Watson|Алексей|Эмма Ватсон/);
    expect(data).not.toHaveProperty('reviews');
  });
});
