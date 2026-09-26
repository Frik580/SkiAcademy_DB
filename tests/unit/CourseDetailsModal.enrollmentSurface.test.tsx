import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '../../src/types';
import { CourseDetailsModal } from '../../src/features/courses/components/CourseDetailsModal';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
  translateInstructorName: (name: string) => name,
}));
vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (value: number) => String(value) }),
}));
vi.mock('../../src/ui/BodyScrollLock', () => ({ BodyScrollLock: () => null }));
vi.mock('../../src/features/courses/groupCourseEnrollmentCta', () => ({
  deriveGroupCourseEnrollmentCtaState: () => ({
    label: 'enroll',
    enrollDisabled: false,
    isFull: false,
  }),
}));
vi.mock('../../src/features/courses/courseCatalogDisplaySchedule', () => ({
  resolveCourseCatalogDisplaySchedule: () => ({ datePart: '2026-10-01', timePart: '08:00' }),
  formatCourseCatalogCardDate: (date: string) => date,
}));
vi.mock('../../src/features/courses/components/course_details/courseEnrichedData', () => ({
  getCourseEnrichedData: () => ({ benefits: [], program: [], faq: [], photos: [], reviews: [] }),
}));
vi.mock('../../src/features/courses/components/course_details/CourseHeader', () => ({
  CourseHeader: ({ course }: { course: Course }) => <h2>{course.title}</h2>,
}));
vi.mock('../../src/features/courses/components/course_details/CourseProgram', () => ({
  CourseProgram: () => null,
}));
vi.mock('../../src/features/courses/components/course_details/CourseGallery', () => ({
  CourseGallery: () => null,
}));
vi.mock('../../src/features/courses/components/course_details/CourseFAQ', () => ({
  CourseFAQ: () => null,
}));

describe('CourseDetailsModal enrollment entry', () => {
  it('keeps details open when its CTA opens the guest enrollment form', () => {
    const course = {
      id: 'course_01',
      title: 'Group Ski',
      dates: '2026-10-01',
      availableSeats: 4,
      totalSeats: 8,
      priceKZT: 45000,
    } as Course;
    const onClose = vi.fn();
    const onEnroll = vi.fn();
    render(
      <CourseDetailsModal
        isOpen
        onClose={onClose}
        rawCourse={course}
        course={course}
        instructors={[]}
        userProfile={null}
        isEnrolled={false}
        onEnroll={onEnroll}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'courseConfirmBooking' }));
    expect(onEnroll).toHaveBeenCalledWith('course_01');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: 'Group Ski' })).toBeInTheDocument();
  });
});
