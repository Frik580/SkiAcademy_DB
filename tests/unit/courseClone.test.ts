import { describe, expect, it } from 'vitest';
import { buildClonedCourse } from '../../src/lib/courseClone';
import type { Course } from '../../src/types';

const baseCourse = (): Course => ({
  id: 'course_original',
  title: 'Carving Mastery Pro',
  titleRu: 'Мастерство Карвинга Pro',
  duration: '3 Days (12 Hours)',
  description: 'Advanced carving techniques.',
  dates: 'July 15 - July 17, 2026',
  totalSeats: 10,
  availableSeats: 4,
  price: 199,
  bgImageUrl: 'https://example.com/bg.jpg',
  instructorIds: ['ins-1', 'ins-2'],
  shortDescription: 'Short EN',
  shortDescriptionRu: 'Кратко RU',
  detailedDescription: 'Detailed EN',
  detailedDescriptionRu: 'Подробно RU',
  badge: 'PRO',
  badgeRu: 'ПРО',
  level: 'advanced',
  videoUrl: 'https://example.com/promo.mp4',
  benefits: ['Benefit 1'],
  benefitsRu: ['Преимущество 1'],
  program: [{ day: 'Day 1', title: 'Basics', desc: 'Intro' }],
  programRu: [{ day: 'День 1', title: 'Основы', desc: 'Введение' }],
  faq: [{ q: 'Q1', a: 'A1' }],
  faqRu: [{ q: 'В1', a: 'О1' }],
  galleryPhotos: ['https://example.com/photo.jpg'],
  order: 2,
  isHidden: false,
});

describe('buildClonedCourse', () => {
  it('copies all course content with a new id and copy suffixes', () => {
    const cloned = buildClonedCourse(baseCourse(), 5);

    expect(cloned.id).not.toBe('course_original');
    expect(cloned.id).toMatch(/^course_\d+$/);
    expect(cloned.title).toBe('Carving Mastery Pro (copy)');
    expect(cloned.titleRu).toBe('Мастерство Карвинга Pro (копия)');
    expect(cloned.duration).toBe('3 Days (12 Hours)');
    expect(cloned.description).toBe('Advanced carving techniques.');
    expect(cloned.dates).toBe('July 15 - July 17, 2026');
    expect(cloned.price).toBe(199);
    expect(cloned.bgImageUrl).toBe('https://example.com/bg.jpg');
    expect(cloned.instructorIds).toEqual(['ins-1', 'ins-2']);
    expect(cloned.shortDescription).toBe('Short EN');
    expect(cloned.shortDescriptionRu).toBe('Кратко RU');
    expect(cloned.detailedDescription).toBe('Detailed EN');
    expect(cloned.detailedDescriptionRu).toBe('Подробно RU');
    expect(cloned.badge).toBe('PRO');
    expect(cloned.badgeRu).toBe('ПРО');
    expect(cloned.level).toBe('advanced');
    expect(cloned.videoUrl).toBe('https://example.com/promo.mp4');
    expect(cloned.benefits).toEqual(['Benefit 1']);
    expect(cloned.benefitsRu).toEqual(['Преимущество 1']);
    expect(cloned.program).toEqual([{ day: 'Day 1', title: 'Basics', desc: 'Intro' }]);
    expect(cloned.programRu).toEqual([{ day: 'День 1', title: 'Основы', desc: 'Введение' }]);
    expect(cloned.faq).toEqual([{ q: 'Q1', a: 'A1' }]);
    expect(cloned.faqRu).toEqual([{ q: 'В1', a: 'О1' }]);
    expect(cloned.galleryPhotos).toEqual(['https://example.com/photo.jpg']);
    expect(cloned.order).toBe(5);
  });

  it('resets seat availability so client enrollments are not copied', () => {
    const cloned = buildClonedCourse(baseCourse(), 5);

    expect(cloned.totalSeats).toBe(10);
    expect(cloned.availableSeats).toBe(10);
  });
});
