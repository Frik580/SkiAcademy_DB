import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalHost } from '../../src/features/shell/ModalHost';
import { useUiStore } from '../../src/features/shell/uiStore';
import { PersonalCabinetModals } from '../../src/features/student-cabinet/components/PersonalCabinetModals';
import type { Booking, Course, Instructor, UserProfile } from '../../src/types';
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
  chat: vi.fn(),
  resolve: new Map<string, () => void>(),
}));

async function delayImport(name: string) {
  await new Promise<void>((resolve) => loaders.resolve.set(name, resolve));
}

async function finishImport(
  name: string,
  loader: ReturnType<typeof vi.fn>,
  existingDialogs: HTMLElement[] = []
) {
  await waitFor(() => expect(loader).toHaveBeenCalledOnce(), { timeout: 5000 });
  const resolve = loaders.resolve.get(name);
  if (resolve) {
    expect(screen.queryAllByRole('dialog', { hidden: true })).toEqual(existingDialogs);
    expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument();
    loaders.resolve.delete(name);
    await act(async () => resolve());
  }
  return screen.findByRole('dialog', { name });
}

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => (key === 'loading' ? 'Загрузка...' : key),
    language: 'ru',
  }),
  translateCourse: (course: unknown) => course,
}));
vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (select: (state: unknown) => unknown) =>
    select({ userProfile: loaders.profile() ?? null }),
}));
vi.mock('../../src/features/profile', () => ({ ReviewFlow: () => null }));
vi.mock('../../src/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../src/features/bookings', async () => {
  loaders.chat();
  await delayImport('lesson chat');
  return {
    BookingChatModal: ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label="lesson chat">
        <button onClick={onClose}>close chat</button>
      </div>
    ),
  };
});
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
vi.mock('../../src/features/auth/components/Auth', () => ({
  Auth: () => <input aria-label="email" />,
}));
vi.mock('../../src/features/auth/components/AuthModal', async (importOriginal) => {
  const original = await importOriginal();
  loaders.auth();
  await delayImport('welcomeTitle');
  return original;
});
vi.mock('../../src/features/bookings/components/BookingModal', async () => {
  loaders.booking();
  await delayImport('booking');
  return {
    BookingModal: ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label="booking">
        <button onClick={onClose}>close booking</button>
      </div>
    ),
  };
});
vi.mock('../../src/features/courses/components/CourseDetailsModal', async () => {
  loaders.details();
  await delayImport('course details');
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
vi.mock('../../src/features/courses/components/CourseEnrollmentModal', async () => {
  loaders.enrollment();
  await delayImport('course enrollment');
  return { CourseEnrollmentModal: () => <div role="dialog" aria-label="course enrollment" /> };
});
vi.mock('../../src/features/profile/components/InstructorReviewsModal', async () => {
  loaders.reviews();
  await delayImport('reviews');
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
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
    expect(document.querySelector('[data-modal-layer]')).not.toBeInTheDocument();
    expect(useUiStore.getState().isAuthModalOpen).toBe(true);
    const dialog = await finishImport('welcomeTitle', loaders.auth);
    expect(within(dialog).getByRole('textbox', { name: 'email' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUiStore.getState().isAuthModalOpen).toBe(false);
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    act(() => useUiStore.getState().setIsAuthModalOpen(true));
    expect(screen.getByRole('dialog', { name: 'welcomeTitle' })).toBeInTheDocument();
    expect(loaders.auth).toHaveBeenCalledOnce();
  });

  it('opens booking and reviews from the first selection and preserves the course details → enrollment transition', async () => {
    const instructor = { id: 'instructor_01' } as Instructor;
    const course = { id: 'course_01' } as Course;
    render(<ModalHost />);
    act(() => useUiStore.getState().setSelectedInstructor(instructor));
    expect(await finishImport('booking', loaders.booking)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close booking' }));
    expect(useUiStore.getState().selectedInstructor).toBeNull();
    act(() => useUiStore.getState().setReviewsInstructor(instructor));
    expect(await finishImport('reviews', loaders.reviews)).toBeInTheDocument();
    act(() => useUiStore.getState().setReviewsInstructor(null));
    act(() => useUiStore.getState().setSelectedCourseForDetails(course));
    const detailsDialog = await finishImport('course details', loaders.details);
    fireEvent.click(screen.getByRole('button', { name: 'enroll' }));
    expect(
      await finishImport('course enrollment', loaders.enrollment, [detailsDialog])
    ).toBeInTheDocument();
    expect(useUiStore.getState().selectedCourseForAuth).toBe(course);
  });
});

it('opens the lesson chat after its import, and closes and reopens it', async () => {
  const booking = { id: 'lesson_01' } as Booking;
  const props: React.ComponentProps<typeof PersonalCabinetModals> = {
    userProfile: { uid: 'account' } as UserProfile,
    rawBookings: [],
    courses: [],
    instructors: [],
    usersList: [],
    reviews: [],
    lessonDetailsId: null,
    onCloseLessonDetails: vi.fn(),
    onWriteReviewFromLesson: vi.fn(),
    reviewBooking: null,
    reviewRating: 0,
    setReviewRating: vi.fn(),
    reviewComment: '',
    setReviewComment: vi.fn(),
    isSubmittingReview: false,
    onCloseReview: vi.fn(),
    onSubmitReview: vi.fn(),
    confirmModal: null,
    cancelReason: '',
    setCancelReason: vi.fn(),
    onCloseConfirm: vi.fn(),
    onConfirmAction: vi.fn(),
    selectedChatBooking: null,
    onCloseChat: vi.fn(),
    levelUpModal: null,
    onCloseLevelUp: vi.fn(),
  };
  const { rerender } = render(<PersonalCabinetModals {...props} />);
  expect(loaders.chat).not.toHaveBeenCalled();
  rerender(<PersonalCabinetModals {...props} selectedChatBooking={booking} />);
  const chat = await finishImport('lesson chat', loaders.chat);
  fireEvent.click(within(chat).getByRole('button', { name: 'close chat' }));
  expect(props.onCloseChat).toHaveBeenCalledOnce();
  rerender(<PersonalCabinetModals {...props} />);
  expect(chat).not.toBeInTheDocument();
  rerender(<PersonalCabinetModals {...props} selectedChatBooking={booking} />);
  expect(screen.getByRole('dialog', { name: 'lesson chat' })).toBeInTheDocument();
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
    await finishImport('course details', loaders.details);
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
    await finishImport('course details', loaders.details);
    expect(loaders.detailsProps.mock.lastCall?.[0].isEnrolled).toBe(false);
    act(() =>
      useUiStore
        .getState()
        .setSelectedCourseForDetails({ id: 'other_course' } as Course, enrolledB.enrollmentId)
    );
    expect(loaders.detailsProps.mock.lastCall?.[0].isEnrolled).toBe(false);
  });
});
