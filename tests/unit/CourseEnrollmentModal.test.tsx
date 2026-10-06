/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { CourseEnrollmentModal } from '../../src/features/courses/components/CourseEnrollmentModal';
import { GroupCourseCard } from '../../src/features/courses/components/GroupCourseCard';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { persistGuestCourseEnrollmentCredential } from '../../src/features/course-enrollments/guestCourseEnrollmentCredentialStorage';

const mocks = vi.hoisted(() => ({
  participants: [] as ManagedParticipantOption[],
  selectedParticipantIds: [] as string[],
  loading: false,
  error: undefined as string | undefined,
  reload: vi.fn(),
  toggleParticipant: vi.fn(),
  resetSelection: vi.fn(),
  createGuestEnrollment: vi.fn(),
  completeGuestParticipantProfile: vi.fn(),
  requestCancellation: vi.fn(),
  loadGuestSingleCourseEnrollment: vi.fn(),
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

vi.mock('../../src/features/auth', () => ({
  Auth: ({ onSuccess }: any) => (
    <div aria-label="Existing auth UI">
      <button type="button">Sign in</button>
      <button type="button">Register</button>
      <button type="button" onClick={() => onSuccess(userProfile)}>
        Finish auth
      </button>
    </div>
  ),
}));

vi.mock('canvas-confetti', () => ({ default: mocks.confetti }));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      (
        ({
          submitGuestCourseApplicationShort: 'Send request',
          guestCourseSignIn: 'Already have an account? Sign in',
          guestCourseAddOptionalDetails: '+ Add email or comment',
          guestCourseHoldUntil: 'Your place on the course is temporarily held until {deadline}.',
          guestCoursePrice: 'Course price: {amount}.',
          guestAdminContactPayment: 'An administrator will contact you to arrange payment.',
        }) as Record<string, string>
      )[key] ?? key,
    language: 'en',
  }),
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
  deriveRequestCancellationIdempotencyKey: (id: string, revision: number) =>
    `cancel:${id}:${revision}`,
  resolveGuestCourseSessionParticipantId: () => 'guest_session_participant_01',
  useCourseEnrollmentCommands: () => ({
    createGuestEnrollment: mocks.createGuestEnrollment,
    completeGuestParticipantProfile: mocks.completeGuestParticipantProfile,
    requestCancellation: mocks.requestCancellation,
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

vi.mock('../../src/features/course-enrollments/useCourseEnrollmentReadSync', () => ({
  loadGuestSingleCourseEnrollment: (...args: unknown[]) =>
    mocks.loadGuestSingleCourseEnrollment(...args),
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
  discipline: 'ski',
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

  it('updates authenticated tuition as participants are toggled', async () => {
    const secondDependent: ManagedParticipantOption = {
      ...dependent,
      participantId: 'participant_dependent_2',
      participantManagementId: 'management_dependent_2',
      displayName: 'Second Dependent',
    };
    mocks.participants = [selfOnly, dependent, secondDependent];
    mocks.selectedParticipantIds = ['participant_self'];

    const props = {
      isOpen: true,
      onClose: vi.fn(),
      course,
      userProfile,
      onEnroll,
    };
    const { rerender } = render(<CourseEnrollmentModal {...props} />);

    expect(screen.getByText('45000', { exact: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Dependent Child/i }));
    expect(mocks.toggleParticipant).toHaveBeenCalledWith('participant_dependent');
    mocks.selectedParticipantIds = ['participant_self', 'participant_dependent'];
    rerender(<CourseEnrollmentModal {...props} />);
    expect(screen.getByText('90000', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('45000 × 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Second Dependent/i }));
    expect(mocks.toggleParticipant).toHaveBeenCalledWith('participant_dependent_2');
    mocks.selectedParticipantIds = [
      'participant_self',
      'participant_dependent',
      'participant_dependent_2',
    ];
    rerender(<CourseEnrollmentModal {...props} />);
    expect(screen.getByText('135000', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('45000 × 3')).toBeInTheDocument();

    mocks.selectedParticipantIds = [];
    rerender(<CourseEnrollmentModal {...props} />);
    expect(screen.getByText('—', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
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

const guestCredential = {
  enrollmentId: 'attempt_01',
  guestSubjectId: 'a'.repeat(64),
  nonce: 'lookup_nonce_fixture_01',
  signature: 'b'.repeat(64),
  expiresAt: { seconds: 4_070_908_800, nanoseconds: 0 },
  cancellationCredential: {
    nonce: 'cancel_nonce_fixture_01',
    signature: 'c'.repeat(64),
    expiresAt: { seconds: 4_070_908_800, nanoseconds: 0 },
  },
};

const pendingGuestReservation = {
  enrollmentId: 'attempt_01',
  revision: 1,
  lifecycle: { status: 'pending' },
  courseDisplay: { courseId: 'course_01', title: 'Canonical course title' },
  participant: { participantId: 'guest_session_participant_01', displayName: 'Canonical Guest' },
  courseSchedule: {
    courseId: 'course_01',
    courseScheduleRevision: 1,
    courseDayCount: 1,
    startAt: { seconds: 1_800_003_600, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_800_010_800, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_01',
        dayOrder: 1,
        revision: 1,
        timeZone: 'Asia/Almaty',
        interval: {
          startsAt: { seconds: 1_800_003_600, nanoseconds: 0 },
          endsAt: { seconds: 1_800_010_800, nanoseconds: 0 },
        },
      },
    ],
  },
  guestPaymentSummary: {
    currency: 'KZT',
    price: 45_000,
    outstandingAmount: 45_000,
    paymentSatisfied: false,
    unpaidCancellationEligible: true,
  },
};

describe('CourseEnrollmentModal guest enrollment', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.createGuestEnrollment.mockResolvedValue({ enrollmentId: 'attempt_01' });
    mocks.completeGuestParticipantProfile.mockResolvedValue(undefined);
    mocks.loadGuestSingleCourseEnrollment.mockResolvedValue({
      lifecycle: {
        status: 'pending',
        reservationExpiresAt: { seconds: 1_800_000_000, nanoseconds: 0 },
      },
      guestPaymentSummary: {
        currency: 'KZT',
        price: 45_000,
        outstandingAmount: 45_000,
        paymentSatisfied: false,
      },
    });
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue(undefined);
  });

  it.each(['cancelled', 'pending'])(
    'keeps submit → status → canonical cancellation → cancelled when reconcile returns %s',
    async (reconciledStatus) => {
      mocks.createGuestEnrollment.mockImplementationOnce(async () => {
        persistGuestCourseEnrollmentCredential(guestCredential as never);
        return guestCredential;
      });
      mocks.loadGuestSingleCourseEnrollment.mockResolvedValueOnce(pendingGuestReservation);
      mocks.requestCancellation.mockResolvedValueOnce(undefined);
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
      const dialog = screen.getByRole('dialog');
      fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
        target: { value: 'Guest One' },
      });
      fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
        target: { value: '+77001234567' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Send request/i }));
      await waitFor(() =>
        expect(within(dialog).getByRole('status')).toHaveTextContent('guestPendingTitle')
      );
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(dialog.querySelector('form')).toBeNull();
      expect(within(dialog).getByRole('status')).toHaveTextContent('Canonical course title');
      expect(within(dialog).getByRole('status')).toHaveTextContent('Canonical Guest');
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(localStorage.getItem('ski_academy_guest_reservation:course:course_01')).toBe(
        'attempt_01'
      );
      let finishReconcile!: (value: unknown) => void;
      mocks.loadGuestSingleCourseEnrollment.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishReconcile = resolve;
          })
      );
      fireEvent.click(screen.getByRole('button', { name: 'guestCancelPending' }));
      fireEvent.click(screen.getByRole('button', { name: 'guestCancelPending' }));
      await waitFor(() =>
        expect(within(dialog).getByRole('status')).toHaveTextContent('guestCourseCancelledTitle')
      );
      expect(mocks.requestCancellation).toHaveBeenCalledWith({
        enrollmentId: 'attempt_01',
        expectedRevision: 1,
        idempotencyKey: 'cancel:attempt_01:1',
        exercisedCapability: 'account_owner',
        guestCredential,
      });
      expect(screen.queryByRole('button', { name: 'guestCancelPending' })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => {
        finishReconcile({
          ...pendingGuestReservation,
          revision: 2,
          lifecycle: { status: reconciledStatus, reasonCode: 'guest_cancelled' },
        });
      });
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(within(dialog).getByRole('status')).toHaveTextContent('guestCourseCancelledTitle');
      expect(screen.queryByRole('button', { name: 'guestCancelPending' })).not.toBeInTheDocument();
      expect(mocks.createGuestEnrollment).toHaveBeenCalledOnce();
      expect(mocks.loadGuestSingleCourseEnrollment).toHaveBeenCalledTimes(2);
    }
  );

  it('automatically restores a saved credential on reopen, including StrictMode effect replay', async () => {
    persistGuestCourseEnrollmentCredential(guestCredential as never);
    localStorage.setItem('ski_academy_guest_reservation:course:course_01', 'attempt_01');
    mocks.loadGuestSingleCourseEnrollment.mockResolvedValue(pendingGuestReservation);
    const props = { onClose: vi.fn(), course, onEnroll: vi.fn() };
    const { rerender } = render(
      <StrictMode>
        <CourseEnrollmentModal {...props} isOpen />
      </StrictMode>
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Canonical Guest'));
    expect(mocks.loadGuestSingleCourseEnrollment).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
    rerender(
      <StrictMode>
        <CourseEnrollmentModal {...props} isOpen={false} />
      </StrictMode>
    );
    mocks.loadGuestSingleCourseEnrollment.mockResolvedValue({
      ...pendingGuestReservation,
      lifecycle: { status: 'confirmed' },
    });
    rerender(
      <StrictMode>
        <CourseEnrollmentModal {...props} isOpen />
      </StrictMode>
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('guestCourseConfirmedTitle')
    );
    expect(mocks.loadGuestSingleCourseEnrollment).toHaveBeenCalledTimes(2);
    expect(mocks.createGuestEnrollment).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('ignores a delayed saved reservation lookup after switching courses', async () => {
    persistGuestCourseEnrollmentCredential(guestCredential as never);
    localStorage.setItem('ski_academy_guest_reservation:course:course_01', 'attempt_01');
    let finishLookup!: (value: unknown) => void;
    mocks.loadGuestSingleCourseEnrollment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        })
    );
    const props = { isOpen: true, onClose: vi.fn(), onEnroll: vi.fn() };
    const { rerender } = render(<CourseEnrollmentModal {...props} course={course} />);
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
    rerender(
      <CourseEnrollmentModal
        {...props}
        course={{ ...course, id: 'course_02', title: 'Other course' }}
      />
    );
    await act(async () => {
      finishLookup(pendingGuestReservation);
    });
    expect(screen.getByRole('button', { name: /Send request/i })).toBeEnabled();
    expect(screen.queryByText('Canonical Guest')).not.toBeInTheDocument();
    expect(mocks.createGuestEnrollment).not.toHaveBeenCalled();
  });

  it('starts with only required contacts and discloses optional details without losing them in auth', async () => {
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    expect(screen.getByLabelText('guestCourseNameLabel *')).toBeRequired();
    expect(screen.getByLabelText('guestCoursePhoneLabel *')).toBeRequired();
    expect(screen.queryByLabelText('participantsAgeLabel *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('participantsSkillLabel *')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('guestEmailPlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('personalGoalsPlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByText('guestBookingNotice')).not.toBeInTheDocument();
    expect(screen.getAllByText('45000')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: '+ Add email or comment' }));
    const email = screen.getByLabelText('guestCourseEmailLabel');
    const comment = screen.getByLabelText('guestCourseCommentLabel');
    expect(email).not.toBeRequired();
    expect(comment).not.toBeRequired();
    await userEvent.type(email, 'guest@example.com');
    await userEvent.type(comment, 'Please call');
    await userEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
    expect(screen.getByLabelText('Existing auth UI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'guestBookingTab' }));
    expect(screen.getByLabelText('guestCourseEmailLabel')).toHaveValue('guest@example.com');
    expect(screen.getByLabelText('guestCourseCommentLabel')).toHaveValue('Please call');
  });

  it('continues into the existing authenticated enrollment after auth succeeds', async () => {
    mocks.participants = [selfOnly];
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish auth' }));
    expect(screen.getByRole('button', { name: /enroll/i })).toBeEnabled();
    expect(mocks.resetSelection).toHaveBeenCalledOnce();
    expect(mocks.createGuestEnrollment).not.toHaveBeenCalled();
  });

  it.each(['ski', 'snowboard'])(
    'submits %s guest enrollment with real profile data and the stable session participantId',
    async (discipline) => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();
      render(
        <CourseEnrollmentModal
          isOpen
          onClose={onClose}
          onSuccess={onSuccess}
          course={{ ...course, level: 'intermediate', discipline }}
          onEnroll={vi.fn()}
        />
      );

      expect(screen.queryByLabelText('participantsDisciplineLabel *')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('participantsAgeLabel *')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('participantsSkillLabel *')).not.toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
        target: { value: 'Guest One' },
      });
      fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
        target: { value: '+77001234567' },
      });
      fireEvent.click(screen.getByRole('button', { name: '+ Add email or comment' }));
      fireEvent.change(screen.getByPlaceholderText('guestEmailPlaceholder'), {
        target: { value: 'guest@example.com' },
      });
      fireEvent.change(screen.getByLabelText('guestCourseCommentLabel'), {
        target: { value: '  Please call  ' },
      });
      await userEvent.click(screen.getByRole('button', { name: /Send request/i }));

      await waitFor(() => {
        expect(mocks.createGuestEnrollment).toHaveBeenCalledWith(
          expect.objectContaining({
            courseId: 'course_01',
            participantId: 'guest_session_participant_01',
            enrollmentId: 'attempt_01',
            guestDisplayName: 'Guest One',
            guestPhone: '+77001234567',
            guestEmail: 'guest@example.com',
            guestComment: 'Please call',
            guestDiscipline: discipline,
          })
        );
      });
      expect(mocks.createGuestEnrollment.mock.calls[0]?.[0]).not.toHaveProperty('guestAgeYears');
      expect(mocks.createGuestEnrollment.mock.calls[0]?.[0]).not.toHaveProperty('guestSkillLevel');
      expect(onClose).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(screen.getByText('guestPendingTitle')).toBeInTheDocument();
      expect(screen.getByText(/Course price: 45,000 KZT/)).toBeInTheDocument();
      expect(screen.getByText(/temporarily held until/)).toBeInTheDocument();
      expect(screen.getByText(/administrator will contact you/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /pay/i })).not.toBeInTheDocument();
      expect(mocks.loadGuestSingleCourseEnrollment).toHaveBeenCalledWith('attempt_01');
      expect(mocks.confetti).not.toHaveBeenCalled();
    }
  );

  it.each(['', '   ', 'x'.repeat(500)])(
    'submits optional comment with trim and the 500-character limit (%s)',
    async (comment) => {
      render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('guestCourseNameLabel *'), {
        target: { value: 'Guest One' },
      });
      fireEvent.change(screen.getByLabelText('guestCoursePhoneLabel *'), {
        target: { value: '+77001234567' },
      });
      await userEvent.click(screen.getByRole('button', { name: '+ Add email or comment' }));
      const textarea = screen.getByLabelText('guestCourseCommentLabel');
      expect(textarea).toHaveAttribute('maxLength', '500');
      fireEvent.change(textarea, { target: { value: comment } });
      await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
      await waitFor(() => expect(mocks.createGuestEnrollment).toHaveBeenCalledOnce());
      const input = mocks.createGuestEnrollment.mock.calls[0][0];
      if (comment.trim()) expect(input.guestComment).toBe(comment.trim());
      else expect(input).not.toHaveProperty('guestComment');
    }
  );

  it('completes age and skill level after the guest reservation is created', async () => {
    mocks.createGuestEnrollment.mockImplementationOnce(async () => {
      persistGuestCourseEnrollmentCredential(guestCredential as never);
      return guestCredential;
    });
    mocks.loadGuestSingleCourseEnrollment
      .mockResolvedValueOnce(pendingGuestReservation)
      .mockResolvedValueOnce({
        ...pendingGuestReservation,
        participant: {
          ...pendingGuestReservation.participant,
          ageYears: 12,
          skillLevel: 'intermediate',
          discipline: 'ski',
        },
      });

    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest Child' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Complete profile' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete profile' }));
    fireEvent.change(screen.getByLabelText('participantsAgeLabel *'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('participantsSkillLabel *'), {
      target: { value: 'intermediate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() =>
      expect(mocks.completeGuestParticipantProfile).toHaveBeenCalledWith({
        enrollmentId: 'attempt_01',
        ageYears: 12,
        skillLevel: 'intermediate',
        guestCredential,
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Complete profile' })).not.toBeInTheDocument()
    );
  });

  it('does not ask for age or skill before submitting a course with catalog discipline', async () => {
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    expect(screen.queryByLabelText('participantsAgeLabel *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('participantsSkillLabel *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('participantsDisciplineLabel *')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest Child' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() =>
      expect(mocks.createGuestEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({
          guestDisplayName: 'Guest Child',
          guestDiscipline: 'ski',
          guestPhone: '+77001234567',
        })
      )
    );
    const submitted = mocks.createGuestEnrollment.mock.calls[0]?.[0];
    expect(submitted).not.toHaveProperty('guestAgeYears');
    expect(submitted).not.toHaveProperty('guestSkillLevel');
  });

  it('asks only for discipline on a legacy course without catalog discipline', () => {
    const legacyCourse = { ...course };
    delete legacyCourse.discipline;
    expect(legacyCourse).not.toHaveProperty('discipline');
    render(
      <CourseEnrollmentModal isOpen onClose={vi.fn()} course={legacyCourse} onEnroll={vi.fn()} />
    );
    expect(
      screen.getByRole('combobox', { name: /^participantsDisciplineLabel \*/ })
    ).toBeRequired();
    expect(screen.queryByLabelText('participantsAgeLabel *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('participantsSkillLabel *')).not.toBeInTheDocument();
  });

  it('stays in created state when post-create enrollment read fails', async () => {
    mocks.loadGuestSingleCourseEnrollment.mockRejectedValueOnce(new Error('read failed'));
    const onClose = vi.fn();
    render(<CourseEnrollmentModal isOpen onClose={onClose} course={course} onEnroll={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() => {
      expect(mocks.createGuestEnrollment).toHaveBeenCalledTimes(1);
      expect(screen.getByText('postCreateRefreshFailedCourseTitle')).toBeInTheDocument();
      expect(screen.getByText('postCreateRefreshFailedBody')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'guestCheckStatus' })).toBeEnabled();

    mocks.loadGuestSingleCourseEnrollment.mockResolvedValueOnce({
      lifecycle: { status: 'pending' },
      guestPaymentSummary: { price: 45_000 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'guestCheckStatus' }));
    await waitFor(() => expect(screen.getByText('guestPendingTitle')).toBeInTheDocument());
    expect(mocks.createGuestEnrollment).toHaveBeenCalledTimes(1);
  });

  it('refreshes a guest course request from pending to confirmed without closing the modal', async () => {
    mocks.loadGuestSingleCourseEnrollment
      .mockResolvedValueOnce({
        lifecycle: { status: 'pending' },
        guestPaymentSummary: { price: 45_000 },
      })
      .mockResolvedValueOnce({
        lifecycle: { status: 'confirmed' },
        guestPaymentSummary: { price: 45_000, paymentSatisfied: true },
      });
    const onClose = vi.fn();
    render(<CourseEnrollmentModal isOpen onClose={onClose} course={course} onEnroll={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guestNamePlaceholder'), {
      target: { value: 'Guest One' },
    });
    fireEvent.change(screen.getByPlaceholderText('guestPhonePlaceholder'), {
      target: { value: '+77001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));
    await waitFor(() => expect(screen.getByText('guestPendingTitle')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'guestCheckStatus' }));
    await waitFor(() => expect(screen.getByText('guestCourseConfirmedTitle')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reopens a stored course request to read its current expired state', async () => {
    localStorage.setItem('ski_academy_guest_reservation:course:course_01', 'attempt_01');
    mocks.loadGuestSingleCourseEnrollment.mockResolvedValueOnce({
      lifecycle: { status: 'cancelled', reasonCode: 'reservation_expired' },
      guestPaymentSummary: {
        currency: 'KZT',
        price: 45_000,
        outstandingAmount: 45_000,
        paymentSatisfied: false,
      },
    });
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'guestCheckPreviousStatus' }));
    await waitFor(() => expect(screen.getByText('guestCourseExpiredTitle')).toBeInTheDocument());
    expect(screen.queryByText('guestAdminContactPayment')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'guestNewBooking' }));
    expect(screen.getByRole('button', { name: /Send request/i })).toBeInTheDocument();
    expect(localStorage.getItem('ski_academy_guest_reservation:course:course_01')).toBeNull();
  });

  it('clears an unusable saved course request and leaves the form available', async () => {
    const key = 'ski_academy_guest_reservation:course:course_01';
    localStorage.setItem(key, 'attempt_01');
    mocks.loadGuestSingleCourseEnrollment.mockRejectedValueOnce(new Error('expired'));
    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'guestCheckPreviousStatus' }));
    await waitFor(() => expect(screen.getByText('guestPreviousUnavailable')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'guestCheckPreviousStatus' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send request/i })).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));
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
    const submit = screen.getByRole('button', { name: /Send request/i });
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
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.confetti).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: /Send request/i }));
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
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
  });

  it('hides the enroll CTA when the same guest is already confirmed', () => {
    mocks.selectActiveGuestCourseEnrollment.mockReturnValue({
      enrollmentId: 'enrollment_confirmed_01',
      lifecycleStatus: 'confirmed',
    });

    render(<CourseEnrollmentModal isOpen onClose={vi.fn()} course={course} onEnroll={vi.fn()} />);

    expect(screen.getByRole('button', { name: /courseEnrolled/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Send request/i })).not.toBeInTheDocument();
  });
});
