import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseBackgroundImageField } from '../../src/features/admin/components/courses/CourseBackgroundImageField';

const uploadImage = vi.fn();
const optimizeCourseImage = vi.fn();
const addNotification = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' as const }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification }),
}));

vi.mock('../../src/infrastructure/firebase', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
}));

vi.mock('../../src/features/admin/components/courses/courseImage', () => ({
  optimizeCourseImage: (...args: unknown[]) => optimizeCourseImage(...args),
}));

vi.mock('../../src/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function selectFile(file = new File(['image'], 'course.png', { type: 'image/png' })) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Missing course image file input');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CourseBackgroundImageField upload boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    optimizeCourseImage.mockResolvedValue(new Blob(['optimized'], { type: 'image/webp' }));
  });

  it('returns the canonical Storage URL without mutating Course itself', async () => {
    uploadImage.mockResolvedValue('https://storage.example/course.webp');
    const onChange = vi.fn();
    render(
      <CourseBackgroundImageField
        value="https://example.com/original.webp"
        courseId="course_image_01"
        onChange={onChange}
      />
    );

    selectFile();
    await waitFor(() =>
      expect(uploadImage).toHaveBeenCalledWith(expect.any(Blob), 'courses/course_image_01.webp')
    );
    expect(onChange).toHaveBeenCalledWith('https://storage.example/course.webp');
    expect(addNotification).toHaveBeenCalledWith(
      'success',
      'courseBgAttached',
      'courseBgAttachedDesc'
    );
  });

  it('keeps the previous URL on failure and allows a successful retry', async () => {
    uploadImage
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce('https://storage.example/retry.webp');
    const onChange = vi.fn();
    render(
      <CourseBackgroundImageField
        value="https://example.com/original.webp"
        courseId="course_image_01"
        onChange={onChange}
      />
    );

    selectFile();
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('https://example.com/original.webp')).toBeInTheDocument();
    expect(addNotification).toHaveBeenCalledWith('error', 'uploadFailed', 'courseBgFailedDesc');

    selectFile();
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenCalledWith('https://storage.example/retry.webp');
  });
});
