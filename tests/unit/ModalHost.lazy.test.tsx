import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalHost } from '../../src/features/shell/ModalHost';
import { useUiStore } from '../../src/features/shell/uiStore';
import type { Course, Instructor, UserProfile } from '../../src/types';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import { selectEnrollmentForCourseParticipant } from '../../src/features/course-enrollments/courseProgressViewModel';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import type { CourseDetailsModal } from '../../src/features/courses/components/CourseDetailsModal';

const loaders = vi.hoisted(() => ({
  profile: vi.fn(),
  enrollments: vi.fn(),
  detailsProps: vi.fn(),
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
  useProfileStore: (select: (state: unknown) => unknown) =>
    select({ userProfile: loaders.profile() ?? null }),
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
  selectCourseEnrollmentItems: () => loaders.enrollments() ?? [],
  lookupCourseCatalogOperational: () => undefined,
  selectEnrollmentForCourseParticipant: (
    input: Parameters<typeof selectEnrollmentForCourseParticipant>[0]
  ) => selectEnrollmentForCourseParticipant(input),
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
    CourseDetailsModal: (props: React.ComponentProps<typeof CourseDetailsModal>) => {
      loaders.detailsProps(props);
      return (
        <div role="dialog" aria-label="course details">
          <button onClick={props.onEnroll}>enroll</button>
        </div>
      );
    },
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
  loaders.profile.mockReturnValue(null);
  loaders.enrollments.mockReturnValue([]);
  useCabinetProgressParticipantSelectionStore.getState().reset();
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

describe('account enrollment card course details', () => {
  const course = { id: 'course_family' } as Course;
  const enrolledB = {
    enrollmentId: 'enrollment_b',
    courseId: course.id,
    participantId: 'b',
    lifecycleStatus: 'confirmed',
    courseSchedule: { courseId: course.id, courseDayCount: 4, courseDays: [] },
  } as unknown as CourseEnrollmentCabinetItem;

  it('opens the explicit account enrollment B while header A is selected, and retains B after a header switch', async () => {
    loaders.profile.mockReturnValue({ uid: 'account' } as UserProfile);
    loaders.enrollments.mockReturnValue([enrolledB]);
    useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: 'a' });
    act(() => useUiStore.getState().setSelectedCourseForDetails(course, enrolledB.enrollmentId));
    render(<ModalHost />);
    await screen.findByRole('dialog', { name: 'course details' });
    expect(loaders.detailsProps.mock.lastCall?.[0]).toMatchObject({
      isEnrolled: true,
      enrollmentLifecycleStatus: 'confirmed',
      enrollmentSchedule: enrolledB.courseSchedule,
    });
    expect(useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId).toBe('a');
    act(() => useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: 'c' }));
    expect(loaders.detailsProps.mock.lastCall?.[0].isEnrolled).toBe(true);
  });

  it('keeps catalog details scoped to header A and rejects an unrelated enrollment ID', async () => {
    loaders.profile.mockReturnValue({ uid: 'account' } as UserProfile);
    loaders.enrollments.mockReturnValue([enrolledB]);
    useCabinetProgressParticipantSelectionStore.setState({ selectedParticipantId: 'a' });
    act(() => useUiStore.getState().setSelectedCourseForDetails(course));
    render(<ModalHost />);
    await screen.findByRole('dialog', { name: 'course details' });
    expect(loaders.detailsProps.mock.lastCall?.[0].isEnrolled).toBe(false);
    act(() =>
      useUiStore
        .getState()
        .setSelectedCourseForDetails({ id: 'other_course' } as Course, enrolledB.enrollmentId)
    );
    expect(loaders.detailsProps.mock.lastCall?.[0].isEnrolled).toBe(false);
  });
});
