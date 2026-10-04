import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalHost } from '../../src/features/shell/ModalHost';
import { useUiStore } from '../../src/features/shell/uiStore';
import type { Course, Instructor } from '../../src/types';

const loaders = vi.hoisted(() => ({
  auth: vi.fn(),
  booking: vi.fn(),
  details: vi.fn(),
  enrollment: vi.fn(),
  reviews: vi.fn(),
  authMount: vi.fn(),
  authUnmount: vi.fn(),
  resolveAuth: () => {},
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  translateCourse: (course: unknown) => course,
}));
vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (select: (state: unknown) => unknown) => select({ userProfile: null }),
}));
vi.mock('../../src/features/bookings/bookingsStore', () => ({
  useBookingsStore: (select: (state: unknown) => unknown) =>
    select({
      reviews: [],
      instructors: [],
      reviewPaginationByInstructor: {},
    }),
}));
vi.mock('../../src/features/courses/coursesStore', () => ({
  useCoursesStore: (select: (state: unknown) => unknown) => select({ courses: [] }),
}));
vi.mock('../../src/features/courses/useCourseActions', () => ({
  useCourseActions: () => ({ handleBookCourse: vi.fn() }),
}));
vi.mock('../../src/features/course-enrollments', () => ({
  useCourseEnrollmentStore: (select: (state: unknown) => unknown) =>
    select({ catalogByCourseId: {} }),
  selectCourseEnrollmentItems: () => [],
  lookupCourseCatalogOperational: () => undefined,
  selectEnrollmentForCourseParticipant: () => undefined,
  selectActiveGuestCourseEnrollment: () => undefined,
  presentStudentCourseProgress: vi.fn(),
  studentCourseProgressCopyFromLanguage: vi.fn(),
}));
vi.mock('../../src/features/notifications/NotificationsPanel', () => ({
  NotificationsPanel: () => null,
}));
vi.mock('../../src/features/reviews', () => ({ loadMoreCanonicalInstructorReviews: vi.fn() }));
vi.mock('../../src/features/auth/components/AuthModal', async () => {
  loaders.auth();
  await new Promise<void>((resolve) => {
    loaders.resolveAuth = resolve;
  });
  return {
    AuthModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
      React.useEffect(() => {
        loaders.authMount();
        return () => {
          loaders.authUnmount();
        };
      }, []);
      return isOpen ? (
        <div role="dialog" aria-label="auth">
          <button onClick={onClose}>close auth</button>
        </div>
      ) : null;
    },
  };
});
vi.mock('../../src/features/bookings/components/BookingModal', () => {
  loaders.booking();
  return {
    BookingModal: ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label="booking">
        <button onClick={onClose}>close booking</button>
      </div>
    ),
  };
});
vi.mock('../../src/features/courses/components/CourseDetailsModal', () => {
  loaders.details();
  return {
    CourseDetailsModal: ({ onEnroll }: { onEnroll: () => void }) => (
      <div role="dialog" aria-label="course details">
        <button onClick={onEnroll}>enroll</button>
      </div>
    ),
  };
});
vi.mock('../../src/features/courses/components/CourseEnrollmentModal', () => {
  loaders.enrollment();
  return { CourseEnrollmentModal: () => <div role="dialog" aria-label="course enrollment" /> };
});
vi.mock('../../src/features/profile/components/InstructorReviewsModal', () => {
  loaders.reviews();
  return { InstructorReviewsModal: () => <div role="dialog" aria-label="reviews" /> };
});

beforeEach(() => {
  useUiStore.getState().closeAllModals();
});
afterEach(() => {
  cleanup();
  useUiStore.getState().closeAllModals();
});

describe('global modal lazy boundaries', () => {
  it('keeps closed modal modules unloaded, opens auth on one click after a slow import, and retains the close lifecycle', async () => {
    render(<ModalHost />);
    for (const loader of [
      loaders.auth,
      loaders.booking,
      loaders.details,
      loaders.enrollment,
      loaders.reviews,
    ]) {
      expect(loader).not.toHaveBeenCalled();
    }
    act(() => useUiStore.getState().setIsAuthModalOpen(true));
    await waitFor(() => expect(loaders.auth).toHaveBeenCalledOnce());
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(useUiStore.getState().isAuthModalOpen).toBe(true);
    await act(async () => {
      loaders.resolveAuth();
    });
    expect(await screen.findByRole('dialog', { name: 'auth' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close auth' }));
    expect(screen.queryByRole('dialog', { name: 'auth' })).not.toBeInTheDocument();
    expect(loaders.authUnmount).not.toHaveBeenCalled();
    act(() => useUiStore.getState().setIsAuthModalOpen(true));
    expect(screen.getByRole('dialog', { name: 'auth' })).toBeInTheDocument();
    expect(loaders.authMount).toHaveBeenCalledOnce();
  });

  it('opens booking and reviews from the first selection and preserves the course details → enrollment transition', async () => {
    const instructor = { id: 'instructor_01' } as Instructor;
    const course = { id: 'course_01' } as Course;
    render(<ModalHost />);
    act(() => useUiStore.getState().setSelectedInstructor(instructor));
    expect(await screen.findByRole('dialog', { name: 'booking' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close booking' }));
    expect(useUiStore.getState().selectedInstructor).toBeNull();
    act(() => useUiStore.getState().setReviewsInstructor(instructor));
    expect(await screen.findByRole('dialog', { name: 'reviews' })).toBeInTheDocument();
    act(() => useUiStore.getState().setReviewsInstructor(null));
    act(() => useUiStore.getState().setSelectedCourseForDetails(course));
    expect(await screen.findByRole('dialog', { name: 'course details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'enroll' }));
    expect(await screen.findByRole('dialog', { name: 'course enrollment' })).toBeInTheDocument();
    expect(useUiStore.getState().selectedCourseForAuth).toBe(course);
  });
});
