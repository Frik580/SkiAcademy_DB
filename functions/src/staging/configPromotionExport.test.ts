import { describe, expect, it } from 'vitest';
import {
  isAllowedStorageObjectPath,
  PROMOTION_ALLOWED_SOURCE_COLLECTIONS,
  PROMOTION_EXCLUDED_COLLECTIONS,
  shouldExcludeSource,
} from './configPromotionExport';

describe('configuration promotion export allowlist', () => {
  it('reads only the explicit configuration collections', () => {
    expect(PROMOTION_ALLOWED_SOURCE_COLLECTIONS).toEqual(['instructors', 'courses', 'course_catalog_content']);
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('bookings');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('users');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('image-cache');
    expect(PROMOTION_EXCLUDED_COLLECTIONS).toContain('administrative_availability_blocks');
  });

  it('excludes fixture-owned, TEST-scoped, and testSessionId source documents', () => {
    const reasons: string[] = [];
    const exclude = (doc: { path: string; id: string; data: Record<string, unknown> }, owned = new Set<string>()) =>
      shouldExcludeSource(doc, owned, (reason) => reasons.push(reason));
    expect(exclude({ path: 'courses/fixture-course', id: 'fixture-course', data: {} }, new Set(['courses/fixture-course']))).toBe(true);
    expect(exclude({ path: 'courses/test-course', id: 'test-course', data: { dataScope: 'test' } })).toBe(true);
    expect(exclude({ path: 'courses/session-course', id: 'session-course', data: { testSessionId: 'test-session' } })).toBe(true);
    expect(reasons).toEqual(['fixture_owned', 'test_scoped', 'test_scoped']);
  });

  it('allows only exact catalog, instructor, and banner source object paths', () => {
    expect(isAllowedStorageObjectPath('course', 'course_a', 'courses/course_a.webp')).toBe(true);
    expect(isAllowedStorageObjectPath('instructor', 'instructor_a', 'instructors/instructor_a.jpg')).toBe(true);
    expect(isAllowedStorageObjectPath('resort', 'resort_config', 'banners/winter-banner.webp')).toBe(true);
    expect(isAllowedStorageObjectPath('course', 'course_a', 'image-cache/hash')).toBe(false);
    expect(isAllowedStorageObjectPath('course', 'course_a', 'customers/customer_a/avatar.jpg')).toBe(false);
    expect(isAllowedStorageObjectPath('resort', 'resort_config', 'private/banner.webp')).toBe(false);
  });
});
