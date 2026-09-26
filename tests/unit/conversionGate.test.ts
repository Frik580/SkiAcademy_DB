import { describe, expect, it } from 'vitest';
import { getCourseEnrichedData } from '../../src/features/courses/components/course_details/courseEnrichedData';
import {
  INSTAGRAM_URL,
  PUBLIC_STOREFRONT_REVIEW_MIN,
  getConversionGateCopy,
  resolveInstagramHref,
} from '../../src/features/landing/conversionGateCopy';
import {
  countVerifiedInstructorReviews,
  isPublicStorefrontReviewVisible,
} from '../../src/features/landing/conversionGatePrice';
import { readRepoFile } from '../helpers/readRepoFile';

describe('conversion gate copy', () => {
  it('uses the landed Russian and English strings exactly', () => {
    expect(getConversionGateCopy('ru')).toMatchObject({
      heroHeadline: 'Индивидуальные уроки на Шымбулаке',
      heroSubline: 'Лыжи и сноуборд · техника, прогресс и видеоразбор · Алматы',
      startingPrice: 'от 25 000 ₸/час',
      courseBadge: 'Шымбулак · Алматы · уроки от 25 000 ₸/час · курсы от 250 000 ₸',
      contactLabel: 'Написать в Instagram',
      stickyPrompt: 'Есть вопросы? Напишите в Instagram',
      bookBeside: 'Или забронировать онлайн',
      heroSecondary: 'Выбрать инструктора',
      bookAction: 'Забронировать',
    });
    expect(getConversionGateCopy('en')).toMatchObject({
      heroHeadline: 'Private ski & snowboard lessons at Shymbulak',
      heroSubline: 'Technique, progress tracking and video analysis · Almaty',
      startingPrice: 'from 25,000 ₸/hour',
      contactLabel: 'Message on Instagram',
      stickyPrompt: null,
      bookBeside: null,
      heroSecondary: 'Choose instructor',
      bookAction: 'Book a lesson',
    });
    expect(getConversionGateCopy('ru').startingPrice).not.toContain('30 000');
    expect(getConversionGateCopy('en').courseBadge).toBeNull();
  });

  it('keeps Instagram hidden until a confirmed https link is configured', () => {
    expect(INSTAGRAM_URL).toBeNull();
    expect(resolveInstagramHref(INSTAGRAM_URL)).toBeNull();
    expect(resolveInstagramHref('')).toBeNull();
    expect(resolveInstagramHref('   ')).toBeNull();
    expect(resolveInstagramHref('[[GROWTH_COPY: ig_url]]')).toBeNull();
    expect(resolveInstagramHref('https://example.com/chat')).toBeNull();
    expect(resolveInstagramHref('http://instagram.com/example')).toBeNull();
    expect(resolveInstagramHref('https://wa.me/77001234567')).toBeNull();
  });

  it('accepts an https Instagram URL once the constant is set', () => {
    expect(resolveInstagramHref('https://www.instagram.com/example')).toBe(
      'https://www.instagram.com/example'
    );
    expect(resolveInstagramHref('https://ig.me/m/example')).toBe('https://ig.me/m/example');
  });

  it('does not keep a public WhatsApp control', () => {
    const copy = readRepoFile('src/features/landing/conversionGateCopy.ts');
    const cta = readRepoFile('src/features/landing/ConversionGateInstagramCta.tsx');
    expect(copy).not.toMatch(/WHATSAPP_URL|wa\.me|Написать в WhatsApp/);
    expect(cta).toContain('target="_blank"');
    expect(cta).toContain('rel="noopener noreferrer"');
    expect(cta).not.toContain('instagram_contact_click');
    const card = readRepoFile('src/features/profile/components/InstructorCard.tsx');
    expect(card).toContain('getConversionGateCopy(language).bookAction');
  });
});

describe('public storefront reviews', () => {
  it('shows a public rating only when review_count is at least 1', () => {
    expect(PUBLIC_STOREFRONT_REVIEW_MIN).toBe(1);
    expect(isPublicStorefrontReviewVisible(0)).toBe(false);
    expect(isPublicStorefrontReviewVisible(null)).toBe(false);
    expect(isPublicStorefrontReviewVisible(1)).toBe(true);
    expect(isPublicStorefrontReviewVisible(2)).toBe(true);
    expect(
      countVerifiedInstructorReviews([
        { reviewsCount: 0 },
        { reviewsCount: 2 },
        { reviewsCount: 1 },
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
