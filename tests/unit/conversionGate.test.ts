import { describe, expect, it } from 'vitest';
import { getCourseEnrichedData } from '../../src/features/courses/components/course_details/courseEnrichedData';
import {
  PUBLIC_STOREFRONT_REVIEW_MIN,
  WHATSAPP_URL,
  getConversionGateCopy,
  resolveWhatsAppHref,
} from '../../src/features/landing/conversionGateCopy';
import {
  countVerifiedInstructorReviews,
  isPublicStorefrontReviewVisible,
} from '../../src/features/landing/conversionGatePrice';

describe('conversion gate copy', () => {
  it('uses the landed Russian and English strings exactly', () => {
    expect(getConversionGateCopy('ru')).toMatchObject({
      heroHeadline: 'Индивидуальные уроки на Шымбулаке',
      heroSubline: 'Лыжи и сноуборд · техника, прогресс и видеоразбор · Алматы',
      startingPrice: 'от 25 000 ₸/час',
      courseBadge: 'Шымбулак · Алматы · уроки от 25 000 ₸/час · курсы от 250 000 ₸',
      waLabel: 'Написать в WhatsApp',
      waStickyPrompt: 'Есть вопросы? Напишите в WhatsApp',
      bookBesideWa: 'Или забронировать онлайн',
      heroSecondary: 'Выбрать урок',
    });
    expect(getConversionGateCopy('en')).toMatchObject({
      heroHeadline: 'Private ski & snowboard lessons at Shymbulak',
      heroSubline: 'Technique, progress tracking and video analysis · Almaty',
      startingPrice: 'from 25,000 ₸/hour',
      waLabel: 'Message on WhatsApp',
      heroSecondary: 'Book Lesson',
    });
    expect(getConversionGateCopy('ru').startingPrice).not.toContain('30 000');
    expect(getConversionGateCopy('en').courseBadge).toBeNull();
  });

  it('keeps WhatsApp hidden until a confirmed https link is configured', () => {
    expect(WHATSAPP_URL).toBeNull();
    expect(resolveWhatsAppHref(WHATSAPP_URL)).toBeNull();
    expect(resolveWhatsAppHref('')).toBeNull();
    expect(resolveWhatsAppHref('   ')).toBeNull();
    expect(resolveWhatsAppHref('[[GROWTH_COPY: wa_url]]')).toBeNull();
    expect(resolveWhatsAppHref('https://example.com/chat')).toBeNull();
    expect(resolveWhatsAppHref('http://wa.me/77001234567')).toBeNull();
  });

  it('accepts an https WhatsApp URL once the constant is set', () => {
    expect(resolveWhatsAppHref('https://wa.me/77000000000')).toBe('https://wa.me/77000000000');
    expect(resolveWhatsAppHref('https://api.whatsapp.com/send?phone=77000000000')).toBe(
      'https://api.whatsapp.com/send?phone=77000000000'
    );
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
