import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instructor, UserProfile } from '../../src/types';

const mocks = vi.hoisted(() => ({
  addNotification: vi.fn(),
  confetti: vi.fn(),
  createAuthenticatedBooking: vi.fn(),
  createGuestBooking: vi.fn(),
  managedParticipants: [] as Array<Record<string, unknown>>,
  queryInstructorOccupancy: vi.fn(),
  queryLessonPricingSettings: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({ default: mocks.confetti }));
vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mocks.addNotification }),
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
  parseCourseDates: () => ({
    start: new Date('2026-06-15T00:00:00.000Z'),
    end: new Date('2026-06-15T00:00:00.000Z'),
    startTime: '08:00',
    endTime: '10:00',
  }),
  getDifficultyLabel: (difficulty: string) => difficulty,
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryInstructorOccupancyReadModels: (...args: unknown[]) =>
    mocks.queryInstructorOccupancy(...args),
  queryLessonPricingSettingsReadModel: (...args: unknown[]) =>
    mocks.queryLessonPricingSettings(...args),
}));
vi.mock('../../src/features/bookings/instructorOccupancyForBookingModal', () => ({
  getAvailableLessonStartTimes: () => ['08:00'],
  mapInstructorOccupancyReadModelForBookingModal: () => ({ slots: [], courses: [] }),
  addBookingLocalDays: (date: string) => date,
  normalizeBookingLocalDate: (date: string) => date,
  resolveLessonStartTimeSelection: (time: string, slots: string[]) =>
    slots.includes(time) ? time : (slots[0] ?? ''),
}));
vi.mock('../../src/domain/availability', () => ({
  blocksInstructorAvailability: () => false,
  DEFAULT_LESSON_TIME_SLOTS: ['08:00'],
  toAvailabilitySlot: (booking: unknown) => booking,
  toLocalDateStr: () => '2026-06-15',
}));
vi.mock('../../src/features/lesson-bookings', () => ({
  createLogicalBookingAttemptId: () => 'booking_guest_fixture_01',
  deriveAuthenticatedCreateIdempotencyKey: (bookingId: string) => `auth:${bookingId}`,
  deriveGuestCreateIdempotencyKey: (bookingId: string) => `guest:${bookingId}`,
  deriveGuestParticipantIdForBooking: () => 'participant_guest_fixture_01',
  deriveExercisedCapabilityFromParticipants: () => 'account_owner',
  presentCanonicalCommandErrorWithContext: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    shouldRefresh: false,
  }),
  resolveLessonBookingTimezone: () => 'Asia/Almaty',
  useLessonBookingCommands: () => ({
    createAuthenticatedBooking: mocks.createAuthenticatedBooking,
    createGuestBooking: mocks.createGuestBooking,
  }),
  useManagedParticipants: () => ({
    participants: mocks.managedParticipants,
    loading: false,
    error: undefined,
    reload: vi.fn(),
  }),
}));

import {
  useBookingModal,
  type BookingModalInput,
} from '../../src/features/bookings/components/booking_modal/useBookingModal';

const instructor = {
  id: 'instructor_fixture_01',
  name: 'Coach',
  isAvailable: true,
  pricePerHourKZT: 10_000,
} as Instructor;
const courses: NonNullable<BookingModalInput['courses']> = [];

function createProps(overrides: Partial<BookingModalInput> = {}): BookingModalInput {
  return {
    isOpen: true,
    onClose: vi.fn(),
    instructor,
    userProfile: null,
    courses,
    ...overrides,
  };
}

async function waitForAvailableSlot(result: {
  readonly current: ReturnType<typeof useBookingModal>;
}): Promise<void> {
  await waitFor(() => {
    expect(result.current.date).toBe('2026-06-15');
    expect(result.current.isLoadingBookings).toBe(false);
    expect(result.current.isTimeSlotOccupied).toBe(false);
  });
}

describe('booking modal submit success UX', () => {
  beforeEach(() => {
    mocks.addNotification.mockReset();
    mocks.confetti.mockReset();
    mocks.createAuthenticatedBooking.mockReset().mockResolvedValue(undefined);
    mocks.createGuestBooking.mockReset().mockResolvedValue(undefined);
    mocks.managedParticipants.splice(0, mocks.managedParticipants.length);
    mocks.queryInstructorOccupancy.mockReset().mockResolvedValue({
      item: { occupancy: [] },
    });
    mocks.queryLessonPricingSettings.mockReset().mockResolvedValue({
      item: {
        configured: true,
        additionalParticipantSurchargePerHourKzt: 0,
        maxParticipantsPerLesson: 6,
      },
    });
  });

  it('shows guest success feedback, runs confetti, closes, and accepts one request per click', async () => {
    const props = createProps();
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
    });
    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      const firstClick = result.current.handleSubmitGuest(event);
      const secondClick = result.current.handleSubmitGuest(event);
      await Promise.all([firstClick, secondClick]);
    });

    expect(mocks.createGuestBooking).toHaveBeenCalledTimes(1);
    expect(mocks.addNotification).toHaveBeenCalledWith(
      'success',
      'guestApplicationSuccess',
      'guestApplicationSuccessDesc'
    );
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('keeps the guest modal open and form data after request failure', async () => {
    const props = createProps();
    mocks.createGuestBooking.mockRejectedValueOnce(new Error('Request failed'));
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);

    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
    });
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(props.onClose).not.toHaveBeenCalled();
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.addNotification).toHaveBeenCalledWith('error', 'bookingError', 'Request failed');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.guestName).toBe('Guest Name');
  });

  it('clears guest transient state on close and does not replay success when reopened', async () => {
    const props = createProps();
    const { result, rerender } = renderHook(
      (currentProps: BookingModalInput) => useBookingModal(currentProps),
      {
        initialProps: props,
      }
    );
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Previous Guest');
      result.current.setGuestPhone('123456');
      result.current.setGuestEmail('previous@example.com');
      result.current.setNotes('Previous note');
      result.current.setUnauthTab('auth');
    });

    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
    const occupancyReadsBeforeReopen = mocks.queryInstructorOccupancy.mock.calls.length;

    await act(async () => {
      rerender({ ...props, isOpen: false });
    });
    expect(result.current.guestName).toBe('');
    expect(result.current.guestPhone).toBe('');
    expect(result.current.guestEmail).toBe('');
    expect(result.current.notes).toBe('');
    expect(result.current.unauthTab).toBe('guest');
    expect(result.current.isSubmitting).toBe(false);

    await act(async () => {
      rerender({ ...props, isOpen: true });
    });
    await waitForAvailableSlot(result);
    expect(mocks.queryInstructorOccupancy.mock.calls.length).toBeGreaterThan(
      occupancyReadsBeforeReopen
    );
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
    expect(mocks.addNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps authenticated success feedback working and suppresses a duplicate submit', async () => {
    mocks.managedParticipants.push({
      participantId: 'participant_fixture_01',
      authority: 'self',
    });
    const props = createProps({
      userProfile: { uid: 'account_fixture_01', isClientActive: true } as UserProfile,
    });
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    act(() => {
      void result.current.handleSubmit(event);
      void result.current.handleSubmit(event);
    });

    await waitFor(() => expect(mocks.createAuthenticatedBooking).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(mocks.addNotification).toHaveBeenCalledWith(
      'success',
      'lessonBooked',
      expect.stringContaining('Coach')
    );
    expect(mocks.confetti).toHaveBeenCalledTimes(1);
  });
});
