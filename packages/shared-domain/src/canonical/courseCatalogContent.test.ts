import { describe, expect, it } from 'vitest';
import {
  CourseCatalogContentInputSchema,
  CourseCatalogContentSchema,
} from './courseCatalogContent';

const legacyContent = {
  duration: '1 day',
  description: '',
  dates: '',
  bgImageUrl: 'https://example.com/course.webp',
};

describe('course catalog discipline compatibility', () => {
  it('reads legacy content without inventing discipline', () => {
    const parsed = CourseCatalogContentSchema.parse({
      ...legacyContent,
      courseId: 'course_catalog_legacy',
    });
    expect(parsed).not.toHaveProperty('discipline');
    expect(CourseCatalogContentInputSchema.parse(legacyContent)).not.toHaveProperty('discipline');
  });

  it.each(['ski', 'snowboard'])('preserves the canonical %s value', (discipline) => {
    expect(
      CourseCatalogContentSchema.parse({
        ...legacyContent,
        courseId: 'course_catalog_discipline',
        discipline,
      }).discipline
    ).toBe(discipline);
  });

  it.each(['Лыжи', 'Сноуборд', ''])('rejects noncanonical discipline %s', (discipline) => {
    expect(
      CourseCatalogContentInputSchema.safeParse({ ...legacyContent, discipline }).success
    ).toBe(false);
  });
});
