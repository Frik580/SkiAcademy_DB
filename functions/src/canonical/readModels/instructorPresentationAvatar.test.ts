import { describe, expect, it } from 'vitest';
import {
  sanitizeInstructorPresentationAvatarUrl,
  INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX,
} from './instructorPresentationAvatar';

describe('sanitizeInstructorPresentationAvatarUrl', () => {
  it('preserves a normal Firebase Storage download URL', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/ski-school-8f3ca.appspot.com/o/instructors%2Fcoach.jpg?alt=media&token=abc';
    expect(sanitizeInstructorPresentationAvatarUrl(url)).toBe(url);
  });

  it('omits oversized historical avatarUrl values', () => {
    const oversized = `https://example.com/${'x'.repeat(INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX + 1)}`;
    expect(sanitizeInstructorPresentationAvatarUrl(oversized)).toBeUndefined();
  });

  it('omits data URLs even when under the presentation bound', () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(80)}`;
    expect(dataUrl.length).toBeLessThanOrEqual(INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX);
    expect(sanitizeInstructorPresentationAvatarUrl(dataUrl)).toBeUndefined();
  });

  it('omits empty or whitespace-only values', () => {
    expect(sanitizeInstructorPresentationAvatarUrl('')).toBeUndefined();
    expect(sanitizeInstructorPresentationAvatarUrl('   ')).toBeUndefined();
    expect(sanitizeInstructorPresentationAvatarUrl(undefined)).toBeUndefined();
  });
});
