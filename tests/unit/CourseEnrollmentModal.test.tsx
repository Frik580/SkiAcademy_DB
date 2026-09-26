/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { CourseEnrollmentModal } from '../../src/features/courses/components/CourseEnrollmentModal';
import { GroupCourseCard } from '../../src/features/courses/components/GroupCourseCard';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const mocks = vi.hoisted(() => ({
  participants: [] as ManagedParticipantOption[],
  selectedParticipantIds: [] as string[],
  loading: false,
  error: undefined as string | undefined,
  reload: vi.fn(),
  toggleParticipant: vi.fn(),
  resetSelection: vi.fn(),
  createGuestEnrollment: vi.fn(),
  isAnySelectedParticipantEnrolledInCourse: vi.fn(
    (_enrollments: unknown, _courseId: string, _ids: readonly string[]) => false
  ),
  selectActiveGuestCourseEnrollment: vi.fn(() => undefined),
  addNotification: vi.fn(),
  confetti: vi.fn(),
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('canvas-confetti', () => ({ default: mocks.confetti }));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  getGroupCourseLabel: (title: string) => title,
  translateCourse: (course: unknown) => course,
  formatCourseCardDuration: (duration: string) => duration,
}));
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

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (price: number) => `${price}` }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mocks.addNotification }),
}));

vi.mock('../../src/features/course-enrollments', () => ({
  createLogicalEnrollmentAttemptId: () => 'attempt_01',
  deriveGuestCreateEnrollmentIdempotencyKey: () => 'guest-idempotency',
  resolveGuestCourseSessionParticipantId: () => 'guest_session_participant_01',
  useCourseEnrollmentCommands: () => ({
    createGuestEnrollment: mocks.createGuestEnrollment,
  }),
  selectCourseEnrollmentItems: () => [],
  useCourseEnrollmentStore: (selector: (state: { items: Map<string, never> }) => unknown) =>
    selector({ items: new Map() }),
  isAnySelectedParticipantEnrolledInCourse: (
    enrollments: unknown,
    courseId: string,
    ids: readonly string[]
  ) => mocks.isAnySelectedParticipantEnrolledInCourse(enrollments, courseId, ids),
  selectActiveGuestCourseEnrollment: () => mocks.selectActiveGuestCourseEnrollment(),
}));

vi.mock('../../src/features/participants/useParticipantSelection', () => ({
  useParticipantSelection: () => ({
    participants: mocks.participants,
    loading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
    selectedParticipantIds: mocks.selectedParticipantIds,
    toggleParticipant: mocks.toggleParticipant,
    resetSelection: mocks.resetSelection,
  }),
}));

const course = {
  id: 'course_01',
  title: 'Group Ski',
  price: 100,
  priceKZT: 45000,
  dates: '2026-03-01',
} as any;

const userProfile = {
  uid: 'account_self',
  displayName: 'Self Client',
  isClientActive: true,
} as any;

const selfOnly: ManagedParticipantOption = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Self Client',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 30 },
  authority: 'self',
  revision: 1,
};

const dependent: ManagedParticipantOption = {
  participantId: 'participant_dependent',
  participantManagementId: 'management_dependent',
  displayName: 'Dependent Child',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 8 },
  authority: 'parent_guardian',
  revision: 1,
};

describe('CourseEnrollmentModal authenticated enrollment', () => {
  const onEnroll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.participants = [selfOnly];
    mocks.selectedParticipantIds = ['participant_self'];
    mocks.loading = false;
    mocks.error = undefined;
    mocks.isAnySelectedParticipantEnrolledInCourse.mockReturnValue(false);
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue(undefined);
    onEnroll.mockResolvedValue(undefined);
  });

  it('hides the picker and enrolls the sole participant without an explicit selection', async () => {
    mocks.selectedParticipantIds = [];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.queryByText('Self Client')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('courseEnrollmentParticipantPrompt')).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /enroll/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith('course_01', {
        participantIds: ['participant_self'],
        exercisedCapability: 'account_owner',
      });
    });
  });

  it('shows the picker while participants are loading, then hides it for a sole participant', () => {
    mocks.participants = [];
    mocks.selectedParticipantIds = [];
    mocks.loading = true;

    const { rerender } = render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('participantsNoneAvailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enroll/i })).toBeDisabled();

    mocks.participants = [selfOnly];
    mocks.loading = false;
    rerender(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enroll/i })).toBeEnabled();
  });

  it('requires explicit selection when multiple participants exist', async () => {
    mocks.participants = [selfOnly, dependent];
    mocks.selectedParticipantIds = [];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    const submit = screen.getByRole('button', { name: /enroll/i });
    expect(submit).toBeDisabled();
    expect(onEnroll).not.toHaveBeenCalled();
    expect(screen.getByText('participantsChooseExplicitly')).toBeInTheDocument();
  });

  it('blocks enroll when the participant list is empty without showing an empty picker', () => {
    mocks.participants = [];
    mocks.selectedParticipantIds = [];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.queryByText('participantsNoneAvailable')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('courseEnrollmentParticipantPrompt')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enroll/i })).toBeDisabled();
    expect(onEnroll).not.toHaveBeenCalled();
  });

  it('does not block participant A when only participant B is already enrolled', async () => {
    mocks.participants = [selfOnly, dependent];
    mocks.selectedParticipantIds = ['participant_self'];
    mocks.isAnySelectedParticipantEnrolledInCourse.mockImplementation(
      (_enrollments, _courseId, ids) => ids.includes('participant_dependent')
    );

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    const submit = screen.getByRole('button', { name: /enroll/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith('course_01', {
        participantIds: ['participant_self'],
        exercisedCapability: 'account_owner',
      });
    });
  });

  it('passes selected participantIds into the enrollment command', async () => {
    mocks.participants = [selfOnly, dependent];
    mocks.selectedParticipantIds = ['participant_dependent'];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /enroll/i }));

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith('course_01', {
        participantIds: ['participant_dependent'],
        exercisedCapability: 'parent_guardian',
      });
    });
  });

  it('supports multi-select enrollment for multiple chosen participants', async () => {
    const secondDependent: ManagedParticipantOption = {
      ...dependent,
      participantId: 'participant_dependent_2',
      participantManagementId: 'management_dependent_2',
      displayName: 'Second Dependent',
    };
    mocks.participants = [selfOnly, dependent, secondDependent];
    mocks.selectedParticipantIds = ['participant_self', 'participant_dependent'];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /enroll/i }));

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith('course_01', {
        participantIds: ['participant_self', 'participant_dependent'],
        exercisedCapability: 'parent_guardian',
      });
    });
  });

  it('does not auto-select the first participant when multiple exist', async () => {
    mocks.participants = [selfOnly, dependent];
    mocks.selectedParticipantIds = [];

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    fireEvent.submit(screen.getByRole('button', { name: /enroll/i }).closest('form')!);

    await waitFor(() => {
      expect(onEnroll).not.toHaveBeenCalled();
    });
  });

  it('blocks selecting more than eight participants in the picker', async () => {
    mocks.participants = Array.from({ length: 9 }, (_, index) => ({
      ...dependent,
      participantId: `participant_${index}`,
      participantManagementId: `management_${index}`,
      displayName: `Dependent ${index}`,
    }));
    mocks.selectedParticipantIds = mocks.participants.slice(0, 8).map((item) => item.participantId);

    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.getByText('participantsMaxSelected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dependent 8/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Dependent 8/i }));
    expect(mocks.toggleParticipant).not.toHaveBeenCalled();
  });
});

describe('CourseEnrollmentModal guest enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGuestEnrollment.mockResolvedValue({ enrollmentId: 'attempt_01' });
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue(undefined);
  });

  it('submits guest enrollment with the stable session participantId', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
      <CourseEnrollmentModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        course={course}
        onEnroll={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestEmailPlaceholder'), {
      target: { value: 'guest@example.com' },
    });
    await userEvent.click(screen.getByRole('button', { name: /submitGuestCourseApplication/i }));

    await waitFor(() => {
      expect(mocks.createGuestEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course_01',
          participantId: 'guest_session_participant_01',
          enrollmentId: 'attempt_01',
          guestPhone: '+77001234567',
          guestEmail: 'guest@example.com',
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
  });

  it('keeps a card-initiated quota error in the guest form and off other cards', async () => {
    const onRequireAuth = vi.fn();
    render(
      <>
        <GroupCourseCard
          rawCourse={course}
          courseEnrollments={[]}
          userProfile={null}
          language="en"
          onViewDetails={vi.fn()}
          onRequireAuth={onRequireAuth}
        />
        <GroupCourseCard
          rawCourse={{ ...course, id: 'course_02', title: 'Group Snowboard' }}
          courseEnrollments={[]}
          userProfile={null}
          language="en"
          onViewDetails={vi.fn()}
          onRequireAuth={onRequireAuth}
        />
      </>
    );
    const cardA = screen.getByText('Group Ski').closest('article')!;
    const cardB = screen.getByText('Group Snowboard').closest('article')!;
    fireEvent.click(cardA.querySelector('button')!);
    expect(onRequireAuth).toHaveBeenCalledWith(course);

    mocks.createGuestEnrollment.mockRejectedValueOnce(
      new CanonicalCommandClientError('guest_reservation_limit', {
        correlationId: 'correlation_card_limit',
      })
    );
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submitGuestCourseApplication/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(cardA.querySelector('[role="alert"]')).toBeNull();
    expect(cardB.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.addNotification).not.toHaveBeenCalled();
  });

  it('shows quota rejection only in the current course form and clears it on retry', async () => {
    let rejectFirst: ((error: unknown) => void) | undefined;
    let rejectSecond: ((error: unknown) => void) | undefined;
    mocks.createGuestEnrollment
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSecond = reject;
          })
      );
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const { rerender } = render(
      <CourseEnrollmentModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        course={course}
        onEnroll={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    const submit = screen.getByRole('button', { name: /submitGuestCourseApplication/i });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createGuestEnrollment).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rejectFirst?.(
      new CanonicalCommandClientError('guest_reservation_limit', {
        correlationId: 'correlation_course_limit',
      })
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(submit).toBeEnabled();
    expect(
      screen.getByRole('alert').compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('guestNamePlaceholder')).toHaveValue('Guest One');
    expect(screen.getByPlaceholderText('guestPhonePlaceholder')).toHaveValue('+77001234567');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.addNotification).not.toHaveBeenCalled();
    expect(mocks.confetti).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createGuestEnrollment).toHaveBeenCalledTimes(2));
    expect(submit).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rejectSecond?.(
      new CanonicalCommandClientError('guest_reservation_limit', {
        correlationId: 'correlation_course_limit_retry',
      })
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(submit).toBeEnabled();

    rerender(
      <CourseEnrollmentModal
        isOpen
        onClose={onClose}
        course={{ ...course, id: 'course_02' }}
        onEnroll={vi.fn()}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(
      <CourseEnrollmentModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        course={course}
        onEnroll={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
  });

  it('keeps unrelated canonical failures in the existing toast path', async () => {
    mocks.createGuestEnrollment.mockRejectedValueOnce(
      new CanonicalCommandClientError('course_full', { correlationId: 'correlation_full' })
    );
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submitGuestCourseApplication/i }));
    await waitFor(() =>
      expect(mocks.addNotification).toHaveBeenCalledWith(
        'error',
        'bookingError',
        expect.any(String)
      )
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the enroll CTA when the same guest already has a pending enrollment', () => {
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue({
      enrollmentId: 'enrollment_pending_01',
      lifecycleStatus: 'pending',
    });

    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);

    expect(screen.getByRole('button', { name: /courseAwaitingPayment/i })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /submitGuestCourseApplication/i })
    ).not.toBeInTheDocument();
  });

  it('hides the enroll CTA when the same guest is already confirmed', () => {
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue({
      enrollmentId: 'enrollment_confirmed_01',
      lifecycleStatus: 'confirmed',
    });

    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);

    expect(screen.getByRole('button', { name: /courseEnrolled/i })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /submitGuestCourseApplication/i })
    ).not.toBeInTheDocument();
  });
});
