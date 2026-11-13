import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import type { Course, Instructor, Review } from '../../src/types';
import { CourseDetailsModal } from '../../src/features/courses/components/CourseDetailsModal';
import { GroupCourseCard } from '../../src/features/courses/components/GroupCourseCard';
import { InstructorReviewsModal } from '../../src/features/profile/components/InstructorReviewsModal';
import { getCourseEnrichedData } from '../../src/features/courses/components/course_details/courseEnrichedData';
import { readRepoFile } from '../helpers/readRepoFile';

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (value: number) => `${value} KZT` }),
}));

const operational = {
  courseId: 'ski-course',
  availableSeats: 4,
  totalSeats: 8,
  isFull: false,
  isCapacityFrozen: false,
  isEnrollmentEligible: true,
};
const course = (id: string): Course =>
  ({
    id,
    title: id,
    description: 'Course description',
    duration: '4 days',
    level: 'beginner',
    dates: '2026-12-01',
    availableSeats: 4,
    totalSeats: 8,
    priceKZT: 45000,
  }) as Course;

afterEach(() => {
  cleanup();
  localStorage.removeItem('alpine_glide_lang');
});

describe.each(['ru', 'en'] as const)('public reviews in %s', (language) => {
  const copy = translations[language];

  it('has no generated reviews for different courses or levels', () => {
    for (const id of ['ski-course', 'snowboard-course']) {
      for (const level of ['beginner', 'intermediate', 'advanced']) {
        expect(getCourseEnrichedData(id, level, id, language)).not.toHaveProperty('reviews');
      }
    }
  });

  it('keeps course cards, details and enrollment actions without fabricated reviews or ratings', () => {
    localStorage.setItem('alpine_glide_lang', language);
    const onDetails = vi.fn();
    const onRequireAuth = vi.fn();
    const onEnroll = vi.fn();
    const first = course('ski-course');
    const second = course('snowboard-course');
    const card = render(
      <LanguageProvider>
        <GroupCourseCard
          rawCourse={first}
          courseEnrollments={[]}
          catalogOperational={operational}
          userProfile={null}
          language={language}
          onViewDetails={onDetails}
          onRequireAuth={onRequireAuth}
        />
      </LanguageProvider>
    );
    expect(screen.getByText(first.title)).toBeInTheDocument();
    expect(card.container.querySelector('.lucide-star')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.courseDetails }));
    expect(onDetails).toHaveBeenCalledWith(first, undefined);
    fireEvent.click(screen.getByRole('button', { name: copy.enroll }));
    expect(onRequireAuth).toHaveBeenCalledWith(first);
    card.unmount();

    const details = (selected: Course) => (
      <LanguageProvider>
        <CourseDetailsModal
          isOpen
          onClose={vi.fn()}
          rawCourse={selected}
          course={selected}
          instructors={[]}
          userProfile={null}
          catalogOperational={{ ...operational, courseId: selected.id }}
          isEnrolled={false}
          onEnroll={onEnroll}
        />
      </LanguageProvider>
    );
    const modal = render(details(first));
    for (const selected of [first, second]) {
      modal.rerender(details(selected));
      expect(modal.container.textContent).not.toMatch(
        /Alex Thompson|Emma Watson|Алексей Томпсон|Эмма Ватсон|Student Reviews|Отзывы учеников|0\.0/
      );
      expect(modal.container.querySelector('.lucide-star')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: copy.courseConfirmBooking }));
      expect(onEnroll).toHaveBeenLastCalledWith(selected.id);
    }
  });

  it('preserves supplied instructor reviews and excludes another instructor’s reviews', () => {
    localStorage.setItem('alpine_glide_lang', language);
    const instructor = {
      id: 'instructor-one',
      name: 'Coach',
      avatarUrl: '',
      experienceYears: 5,
      rating: 5,
      reviewsCount: 1,
      ratingCounts: [0, 0, 0, 0, 1],
    } as Instructor;
    const review = {
      id: 'review-one',
      instructorId: instructor.id,
      userName: 'Public name',
      rating: 5,
      date: '2026-11-01',
      comment: 'Actual supplied review',
    } as Review;
    const view = render(
      <LanguageProvider>
        <InstructorReviewsModal
          isOpen
          onClose={vi.fn()}
          instructor={instructor}
          reviews={[
            review,
            {
              ...review,
              id: 'review-two',
              instructorId: 'other',
              comment: 'Other instructor review',
            },
          ]}
        />
      </LanguageProvider>
    );
    expect(screen.getByText(review.comment!)).toBeInTheDocument();
    expect(screen.queryByText('Other instructor review')).not.toBeInTheDocument();
    view.rerender(
      <LanguageProvider>
        <InstructorReviewsModal
          isOpen
          onClose={vi.fn()}
          instructor={{ ...instructor, rating: null, reviewsCount: 0 }}
          reviews={[]}
        />
      </LanguageProvider>
    );
    expect(screen.getByText(copy.instructorNoReviews)).toBeInTheDocument();
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.queryByText(review.comment!)).not.toBeInTheDocument();
  });
});

it('keeps the standalone landing free of demo testimonials and dead review links', () => {
  const landing = readRepoFile('landing.html');
  expect(landing).not.toMatch(/testimonial|href="#reviews"|★★★★★|Более 300 довольных/);
});
