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
  it('uses the Instagram contact labels exactly', () => {
    expect(getConversionGateCopy('ru')).toEqual({
      contactLabel: 'Написать в Instagram',
    });
    expect(getConversionGateCopy('en')).toEqual({
      contactLabel: 'Message on Instagram',
    });
  });

  it('uses the confirmed public Instagram profile', () => {
    expect(INSTAGRAM_URL).toBe('https://www.instagram.com/carve_academy');
    expect(resolveInstagramHref(INSTAGRAM_URL)).toBe('https://www.instagram.com/carve_academy');
  });

  it('hides the CTA when the URL is null, blank, or not an https Instagram link', () => {
    expect(resolveInstagramHref(null)).toBeNull();
    expect(resolveInstagramHref('')).toBeNull();
    expect(resolveInstagramHref('   ')).toBeNull();
    expect(resolveInstagramHref('[[GROWTH_COPY: ig_url]]')).toBeNull();
    expect(resolveInstagramHref('https://example.com/chat')).toBeNull();
    expect(resolveInstagramHref('http://instagram.com/example')).toBeNull();
    expect(resolveInstagramHref('https://wa.me/77001234567')).toBeNull();
  });

  it('accepts an https Instagram URL', () => {
    expect(resolveInstagramHref('https://www.instagram.com/example')).toBe(
      'https://www.instagram.com/example'
    );
    expect(resolveInstagramHref('https://ig.me/m/example')).toBe('https://ig.me/m/example');
  });

  it('keeps Instagram on the guest navbar and off the hero, cards, and home reviews section', () => {
    const copy = readRepoFile('src/features/landing/conversionGateCopy.ts');
    const cta = readRepoFile('src/features/landing/ConversionGateInstagramCta.tsx');
    const navbar = readRepoFile('src/app/components/Navbar.tsx');
    const hero = readRepoFile('src/app/components/HeroCarousel.tsx');
    const card = readRepoFile('src/features/profile/components/InstructorCard.tsx');
    const courseCard = readRepoFile('src/features/courses/components/GroupCourseCard.tsx');
    const enroll = readRepoFile(
      'src/features/courses/components/course_details/CourseEnrollAction.tsx'
    );
    const home = readRepoFile('src/app/routes/HomeRouteContainer.tsx');

    expect(copy).not.toMatch(/WHATSAPP_URL|wa\.me|Написать в WhatsApp/);
    expect(cta).toContain('if (!href) return null');
    expect(cta).toContain('target="_blank"');
    expect(cta).toContain('rel="noopener noreferrer"');
    expect(cta).not.toContain('instagram_contact_click');
    expect(cta).not.toContain('ConversionGateStickyInstagram');
    expect(cta).not.toContain('ConversionGateBookBesideNote');

    expect(navbar).toContain('placement="header"');
    expect(navbar).toContain('placement="header-menu"');
    expect(navbar).not.toContain('ConversionGateStickyInstagram');

    expect(hero).toContain("t('startYourJourney')");
    expect(hero).toContain("t('chooseCourse')");
    expect(hero).not.toContain('ConversionGateHeroCopy');
    expect(hero).not.toContain('INSTAGRAM');

    expect(card).toContain('isPublicStorefrontReviewVisible');
    expect(card).toContain("t('bookNow')");
    expect(card).not.toContain('ConversionGateInstagramCta');

    expect(courseCard).not.toContain('ConversionGateInstagramCta');
    expect(enroll).not.toContain('ConversionGateInstagramCta');
    expect(home).not.toContain('ConversionGateReviews');
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
