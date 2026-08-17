import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursesManager } from '../../src/features/admin/components/admin/CoursesManager';
import type { Course } from '../../src/types';

const mockAddNotification = vi.fn();
const mockDeleteCourse = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  translateCourse: (course: Course) => course,
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('../../src/features/admin/components/admin/courses_manager/useCourseForm', () => ({
  useCourseForm: () => ({
    showCourseForm: false,
    editingCourse: null,
    resetCourseForm: vi.fn(),
    handleCourseSubmit: vi.fn(),
    isSubmittingCourse: false,
    showRichCourseDetails: false,
    setShowRichCourseDetails: vi.fn(),
    courseIsHidden: false,
    setCourseIsHidden: vi.fn(),
    toggleCourseForm: vi.fn(),
    startEditCourse: vi.fn(),
    t: (key: string) => key,
  }),
}));

const sampleCourse: Course = {
  id: 'course-1',
  title: 'Freeride Camp',
  duration: '5 days',
  description: 'Advanced program',
  dates: '2026-12-01 - 2026-12-05',
  totalSeats: 5,
  availableSeats: 5,
  price: 200,
  bgImageUrl: 'https://example.com/course.jpg',
};

describe('CoursesManager delete course', () => {
  const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
    void onConfirm();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for confirmation and deletes the course when the trash button is clicked', async () => {
    render(
      <CoursesManager
        courses={[sampleCourse]}
        bookings={[]}
        usersList={[]}
        instructors={[]}
        onDeleteCourse={mockDeleteCourse}
        onRequestConfirm={onRequestConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'deleteCourse' }));

    expect(onRequestConfirm).toHaveBeenCalledWith(
      'deleteCourseConfirmPrefix "Freeride Camp"?',
      expect.any(Function)
    );
    expect(mockDeleteCourse).toHaveBeenCalledWith('course-1');
    expect(mockAddNotification).toHaveBeenCalledWith('success', 'deletedTitle', 'courseDeleted');
  });

  it('shows an error notification when course deletion fails', async () => {
    mockDeleteCourse.mockRejectedValueOnce(new Error('delete failed'));

    render(
      <CoursesManager
        courses={[sampleCourse]}
        bookings={[]}
        usersList={[]}
        instructors={[]}
        onDeleteCourse={mockDeleteCourse}
        onRequestConfirm={onRequestConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'deleteCourse' }));

    expect(mockDeleteCourse).toHaveBeenCalledWith('course-1');
    expect(mockAddNotification).toHaveBeenCalledWith('error', 'errorTitle', 'deleteCourseFailed');
  });
});
