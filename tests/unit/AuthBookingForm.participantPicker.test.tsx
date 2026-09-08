/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { AuthBookingForm } from '../../src/features/bookings/components/booking_modal/AuthBookingForm';
import type { useBookingModal } from '../../src/features/bookings/components/booking_modal/useBookingModal';

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (price: number) => `${price}` }),
}));

vi.mock('../../src/features/bookings/components/booking_modal/BookingSelectors', () => ({
  BookingSelectors: () => <div data-testid="booking-selectors" />,
}));

vi.mock('../../src/features/bookings/components/booking_modal/BookingOverlapWarnings', () => ({
  BookingOverlapWarnings: () => null,
}));

vi.mock('../../src/features/bookings/components/booking_modal/BookingPriceAccordion', () => ({
  BookingPriceAccordion: () => <div data-testid="booking-price" />,
}));

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

function createWorkspace(
  overrides: Record<string, unknown> = {}
): ReturnType<typeof useBookingModal> {
  return {
    t: (key: string) => key,
    language: 'en',
    getDifficultyLabel: (difficulty: string) => difficulty,
    date: '2026-03-01',
    setDate: vi.fn(),
    time: '08:00',
    setTime: vi.fn(),
    duration: 2,
    setDuration: vi.fn(),
    difficulty: 'beginner',
    setDifficulty: vi.fn(),
    notes: '',
    setNotes: vi.fn(),
    isSubmitting: false,
    isLoadingBookings: false,
    occupancyLoadFailed: false,
    availableSlots: ['08:00'],
    minBookingDateStr: '2026-03-01',
    isTimeSlotOccupied: false,
    overlappingBooking: null,
    overlappingCourse: null,
    totalCost: 20000,
    additionalParticipantSurchargePerHourKzt: 6000,
    maxParticipantsPerLesson: 4,
    pricingSettingsLoading: false,
    lessonSettingsUnavailable: false,
    participantSelectionExceedsMax: false,
    managedParticipants: [selfOnly],
    managedParticipantsLoading: false,
    managedParticipantsError: undefined,
    reloadManagedParticipants: vi.fn(),
    selectedParticipantIds: [],
    toggleParticipant: vi.fn(),
    targetInstructor: {
      id: 'instructor_1',
      name: 'Coach',
      isAvailable: true,
      pricePerHourKZT: 10000,
    },
    userProfile: {
      uid: 'account_self',
      displayName: 'Self Client',
      isClientActive: true,
    },
    handleSubmit: vi.fn((event: Event) => event.preventDefault()),
    ...overrides,
  } as any;
}

describe('AuthBookingForm participant picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the picker and enables submit for a sole participant without explicit selection', async () => {
    const handleSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [selfOnly],
          selectedParticipantIds: [],
          handleSubmit,
        })}
      />
    );

    expect(screen.queryByText('Self Client')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /payConfirmLesson/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('shows the picker and requires an explicit choice when two participants exist', () => {
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [selfOnly, dependent],
          selectedParticipantIds: [],
        })}
      />
    );

    expect(screen.getByText('bookingParticipantsLabel')).toBeInTheDocument();
    expect(screen.getByText('Self Client')).toBeInTheDocument();
    expect(screen.getByText('Dependent Child')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payConfirmLesson/i })).toBeDisabled();
  });

  it('enables submit once a participant is chosen among multiple options', () => {
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [selfOnly, dependent],
          selectedParticipantIds: ['participant_dependent'],
        })}
      />
    );

    expect(screen.getByText('bookingParticipantsLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payConfirmLesson/i })).toBeEnabled();
  });

  it('shows a clear validation and blocks submit when cached selection exceeds current max', () => {
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [selfOnly, dependent],
          selectedParticipantIds: ['participant_self', 'participant_dependent'],
          maxParticipantsPerLesson: 1,
          participantSelectionExceedsMax: true,
        })}
      />
    );

    expect(screen.getByText('Too many participants selected. Maximum: 1.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payConfirmLesson/i })).toBeDisabled();
  });

  it('blocks submit during empty loading without showing an empty picker list', () => {
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [],
          selectedParticipantIds: [],
          managedParticipantsLoading: true,
        })}
      />
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('participantsNoneAvailable')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payConfirmLesson/i })).toBeDisabled();
  });

  it('blocks submit when the read model is empty without an empty-user picker', () => {
    render(
      <AuthBookingForm
        workspace={createWorkspace({
          managedParticipants: [],
          selectedParticipantIds: [],
        })}
      />
    );

    expect(screen.queryByText('participantsNoneAvailable')).not.toBeInTheDocument();
    expect(screen.queryByText('bookingParticipantsLabel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payConfirmLesson/i })).toBeDisabled();
  });
});
