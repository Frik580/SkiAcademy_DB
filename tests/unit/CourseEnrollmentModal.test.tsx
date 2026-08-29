/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { CourseEnrollmentModal } from '../../src/features/courses/components/CourseEnrollmentModal';

const mocks = vi.hoisted(() => ({
  participants: [] as ManagedParticipantOption[],
  selectedParticipantIds: [] as string[],
  loading: false,
  error: undefined as string | undefined,
  reload: vi.fn(),
  toggleParticipant: vi.fn(),
  resetSelection: vi.fn(),
  createGuestEnrollment: vi.fn(),
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
  getGroupCourseLabel: (title: string) => title,
}));

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (price: number) => `${price}` }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/features/course-enrollments', () => ({
  createLogicalEnrollmentAttemptId: () => 'attempt_01',
  deriveGuestCreateEnrollmentIdempotencyKey: () => 'guest-idempotency',
  deriveGuestParticipantIdForEnrollment: () => 'guest_participant_01',
  useCourseEnrollmentCommands: () => ({
    createGuestEnrollment: mocks.createGuestEnrollment,
  }),
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
    onEnroll.mockResolvedValue(undefined);
  });

  it('preselects a single managed participant and enrolls with that participantId', async () => {
    render(
      <CourseEnrollmentModal
        isOpen
        onClose={vi.fn()}
        course={course}
        userProfile={userProfile}
        onEnroll={onEnroll}
      />
    );

    expect(screen.getByText('Self Client')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enroll/i }));

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith('course_01', {
        participantIds: ['participant_self'],
        exercisedCapability: 'account_owner',
      });
    });
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
