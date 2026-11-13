import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validateLessonLevelLogo,
  newLessonLevelLogoPath,
  uploadLessonLevelLogo,
} from '../../src/features/settings/lessonLevelLogo';
import { auth, getImageUrl, uploadImage } from '../../src/infrastructure/firebase';
vi.mock('../../src/infrastructure/firebase', () => ({
  auth: { currentUser: { uid: 'admin' } },
  getImageUrl: vi.fn(),
  uploadImage: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(getImageUrl).mockReset();
  vi.mocked(uploadImage).mockReset();
});
describe('lesson logo storage', () => {
  it('validates exact MIME types and the inclusive 2 MB boundary', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp'])
      expect(() =>
        validateLessonLevelLogo(new Blob([new Uint8Array(2097152)], { type }))
      ).not.toThrow();
    for (const [type, size] of [
      ['image/svg+xml', 1],
      ['application/octet-stream', 1],
      ['image/png', 0],
      ['image/png', 2097153],
    ] as const)
      expect(() => validateLessonLevelLogo(new Blob([new Uint8Array(size)], { type }))).toThrow(
        'invalid_logo'
      );
  });
  it('generates unique level and uploader scoped paths and rejects unsafe IDs', () => {
    expect(newLessonLevelLogoPath('beginner')).toMatch(
      /^lesson-levels\/beginner\/admin\/[a-f0-9-]{36}$/
    );
    expect(newLessonLevelLogoPath('beginner')).not.toBe(newLessonLevelLogoPath('beginner'));
    expect(() => newLessonLevelLogoPath('../escape')).toThrow();
  });
  it('uploads new files and recovers a completed immutable upload after a lost acknowledgement', async () => {
    const path = newLessonLevelLogoPath('beginner');
    const file = new File(['image'], 'level.png', { type: 'image/png' });
    vi.mocked(getImageUrl).mockRejectedValueOnce(new Error('not found'));
    vi.mocked(uploadImage).mockResolvedValueOnce('https://example.invalid/logo');
    await uploadLessonLevelLogo(file, path);
    expect(uploadImage).toHaveBeenCalledWith(file, path);
    vi.mocked(getImageUrl).mockResolvedValueOnce('https://example.invalid/logo');
    await uploadLessonLevelLogo(file, path);
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });
  it('does not upload invalid files or allow unauthenticated path creation', async () => {
    await expect(
      uploadLessonLevelLogo(
        new File(['svg'], 'x.svg', { type: 'image/svg+xml' }),
        newLessonLevelLogoPath('beginner')
      )
    ).rejects.toThrow('invalid_logo');
    expect(uploadImage).not.toHaveBeenCalled();
    const user = auth.currentUser;
    Object.assign(auth, { currentUser: null });
    try {
      expect(() => newLessonLevelLogoPath('beginner')).toThrow('Authentication required');
    } finally {
      Object.assign(auth, { currentUser: user });
    }
  });
});
