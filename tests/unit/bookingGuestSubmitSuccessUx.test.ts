import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instructor, UserProfile } from '../../src/types';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { translations } from '../../src/lib/i18n/translations';

const mocks = vi.hoisted(() => ({
  addNotification: vi.fn(),
  confetti: vi.fn(),
  createAuthenticatedBooking: vi.fn(),
  createGuestBooking: vi.fn(),
  createLogicalBookingAttemptId: vi.fn(),
  loadGuestSingleLessonBooking: vi.fn(),
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
vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (value: number) => String(value) }),
}));
vi.mock('../../src/features/bookings/components/booking_modal/BookingSelectors', () => ({
  BookingSelectors: () => null,
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
  createLogicalBookingAttemptId: () => mocks.createLogicalBookingAttemptId(),
  deriveAuthenticatedCreateIdempotencyKey: (bookingId: string) => `auth:${bookingId}`,
  deriveGuestCreateIdempotencyKey: (bookingId: string) => `guest:${bookingId}`,
  deriveGuestParticipantIdForBooking: () => 'participant_guest_fixture_01',
  deriveExercisedCapabilityFromParticipants: () => 'account_owner',
  presentCanonicalCommandErrorWithContext: (error: unknown) => ({
    code: error instanceof CanonicalCommandClientError ? error.code : 'internal',
    message: error instanceof Error ? error.message : String(error),
    shouldRefresh: false,
  }),
  resolveLessonBookingTimezone: () => 'Asia/Almaty',
  useLessonBookingCommands: () => ({
    createAuthenticatedBooking: mocks.createAuthenticatedBooking,
    createGuestBooking: mocks.createGuestBooking,
  }),
  loadGuestSingleLessonBooking: (...args: unknown[]) => mocks.loadGuestSingleLessonBooking(...args),
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
import { GuestBookingForm } from '../../src/features/bookings/components/booking_modal/GuestBookingForm';
import { GuestReservationStatus } from '../../src/features/guest-reservations/GuestReservationStatus';

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
    localStorage.clear();
    mocks.addNotification.mockReset();
    mocks.confetti.mockReset();
    mocks.createAuthenticatedBooking.mockReset().mockResolvedValue({});
    mocks.createGuestBooking
      .mockReset()
      .mockResolvedValue({ bookingId: 'booking_guest_fixture_01' });
    mocks.createLogicalBookingAttemptId.mockReset().mockReturnValue('booking_guest_fixture_01');
    mocks.loadGuestSingleLessonBooking.mockReset().mockResolvedValue({
      lifecycle: {
        status: 'pending',
        reservationExpiresAt: { seconds: 1_800_000_000, nanoseconds: 0 },
      },
      guestPaymentSummary: {
        currency: 'KZT',
        price: 25_000,
        outstandingAmount: 25_000,
        paymentSatisfied: false,
      },
    });
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

  it('shows the canonical KZT rate in the guest total when legacy data conflicts', async () => {
    const props = createProps({
      instructor: {
        ...instructor,
        pricePerHour: 60,
        pricePerHourKZT: 30_000,
      },
    });
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    const { container } = render(
      React.createElement(GuestBookingForm, { workspace: result.current })
    );

    expect(container.textContent).toContain('60000');
    expect(container.textContent).not.toContain('$60');
    expect(container.textContent).not.toContain('60 ₸');
  });

  it('shows an unavailable guest total and disables submit without a KZT rate', async () => {
    const props = createProps({
      instructor: {
        ...instructor,
        pricePerHour: 60,
        pricePerHourKZT: undefined,
      },
    });
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    render(React.createElement(GuestBookingForm, { workspace: result.current }));

    expect(screen.getByText('—', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submitGuestApplication/i })).toBeDisabled();
  });

  it('keeps the guest modal open with canonical pending data and accepts one request per click', async () => {
    const props = createProps();
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
      result.current.setGuestEmail('guest@example.com');
    });
    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      const firstClick = result.current.handleSubmitGuest(event);
      const secondClick = result.current.handleSubmitGuest(event);
      await Promise.all([firstClick, secondClick]);
    });

    expect(mocks.createGuestBooking).toHaveBeenCalledTimes(1);
    expect(mocks.createGuestBooking).toHaveBeenCalledWith(
      expect.objectContaining({ guestPhone: '123456', guestEmail: 'guest@example.com' })
    );
    expect(result.current.guestReservation?.lifecycle.status).toBe('pending');
    expect(result.current.guestReservation?.guestPaymentSummary?.price).toBe(25_000);
    expect(mocks.loadGuestSingleLessonBooking).toHaveBeenCalledWith('booking_guest_fixture_01');
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it.each(['ski', 'snowboard'] as const)(
    'submits actual %s guest data and the selected lesson level',
    async (discipline) => {
      const props = createProps({ instructor: { ...instructor, specialty: 'both' } });
      const { result } = renderHook(() => useBookingModal(props));
      await waitForAvailableSlot(result);
      act(() => {
        result.current.setGuestName('Guest Child');
        result.current.setGuestPhone('+77001234567');
        result.current.setGuestAgeYears('12');
        result.current.setGuestDiscipline(discipline);
        result.current.setDifficulty('intermediate');
      });
      await act(async () => {
        await result.current.handleSubmitGuest({
          preventDefault: vi.fn(),
        } as unknown as React.FormEvent);
      });
      expect(mocks.createGuestBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          guestDisplayName: 'Guest Child',
          guestAgeYears: 12,
          guestDiscipline: discipline,
          guestSkillLevel: 'intermediate',
          difficulty: 'intermediate',
        })
      );
    }
  );

  it('requires real age and explicit discipline in the guest UI and submit handler', async () => {
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    const { rerender } = render(
      React.createElement(GuestBookingForm, { workspace: result.current })
    );
    expect(screen.getByLabelText('participantsAgeLabel *')).toBeRequired();
    expect(screen.getByLabelText('participantsAgeLabel *')).toHaveValue(null);
    expect(screen.getByLabelText('participantsDisciplineLabel *')).toBeRequired();
    expect(screen.getByLabelText('participantsDisciplineLabel *')).toHaveValue('');
    act(() => {
      result.current.setGuestName('Guest Child');
      result.current.setGuestPhone('+77001234567');
      result.current.setGuestDiscipline('snowboard');
    });
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(mocks.createGuestBooking).not.toHaveBeenCalled();
    expect(mocks.addNotification).toHaveBeenCalledWith(
      'warning',
      'missingDetails',
      'participantsAgeLabel'
    );
    act(() => {
      result.current.setGuestAgeYears('12');
    });
    rerender(React.createElement(GuestBookingForm, { workspace: result.current }));
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(mocks.createGuestBooking).toHaveBeenCalledWith(
      expect.objectContaining({ guestAgeYears: 12 })
    );
  });

  it('keeps created state when post-create status read fails and allows read-only retry', async () => {
    mocks.loadGuestSingleLessonBooking.mockRejectedValueOnce(new Error('read failed'));
    const props = createProps();
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
    });
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(mocks.createGuestBooking).toHaveBeenCalledTimes(1);
    expect(result.current.guestCreatedBookingId).toBe('booking_guest_fixture_01');
    expect(result.current.guestRefreshError).toBe(true);
    expect(result.current.guestReservation).toBeUndefined();
    expect(mocks.addNotification).not.toHaveBeenCalledWith(
      'error',
      'bookingError',
      expect.anything()
    );
    expect(props.onClose).not.toHaveBeenCalled();

    mocks.loadGuestSingleLessonBooking.mockResolvedValueOnce({
      lifecycle: { status: 'pending' },
      guestPaymentSummary: { price: 25_000 },
    });
    await act(async () => {
      await result.current.refreshGuestStatus();
    });
    expect(result.current.guestRefreshError).toBe(false);
    expect(result.current.guestReservation?.lifecycle.status).toBe('pending');
    expect(mocks.createGuestBooking).toHaveBeenCalledTimes(1);
  });

  it('refreshes the same guest Lesson from pending to canonical confirmed', async () => {
    mocks.loadGuestSingleLessonBooking
      .mockResolvedValueOnce({
        lifecycle: { status: 'pending' },
        guestPaymentSummary: { price: 25_000 },
      })
      .mockResolvedValueOnce({
        lifecycle: { status: 'confirmed' },
        guestPaymentSummary: { price: 25_000, paymentSatisfied: true },
      });
    const props = createProps();
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
    });
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.guestReservation?.lifecycle.status).toBe('pending');
    await act(async () => {
      await result.current.refreshGuestStatus();
    });
    expect(result.current.guestReservation?.lifecycle.status).toBe('confirmed');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('reopens a stored Lesson request and reads its current status', async () => {
    localStorage.setItem(
      'ski_academy_guest_reservation:lesson:instructor_fixture_01',
      'booking_guest_fixture_01'
    );
    mocks.loadGuestSingleLessonBooking.mockResolvedValueOnce({
      lifecycle: { status: 'confirmed' },
    });
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    expect(result.current.guestCreatedBookingId).toBe('booking_guest_fixture_01');
    expect(result.current.guestReservation?.lifecycle.status).toBe('confirmed');
  });

  it('shows a saved pending request with canonical payment details and preserves its pointer', async () => {
    localStorage.setItem(
      'ski_academy_guest_reservation:lesson:instructor_fixture_01',
      'booking_guest_fixture_01'
    );
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    expect(result.current.guestReservation?.lifecycle.status).toBe('pending');
    expect(result.current.guestReservation?.guestPaymentSummary?.price).toBe(25_000);
    expect(result.current.previousGuestReservationId).toBe('booking_guest_fixture_01');
    expect(mocks.createGuestBooking).not.toHaveBeenCalled();
  });

  it('shows expiry, clears the pointer on close, and hides the status button on reopen', async () => {
    const key = 'ski_academy_guest_reservation:lesson:instructor_fixture_01';
    localStorage.setItem(key, 'booking_guest_fixture_01');
    mocks.loadGuestSingleLessonBooking.mockResolvedValueOnce({
      lifecycle: { status: 'cancelled', reasonCode: 'reservation_expired' },
    });
    const props = createProps();
    const { result, rerender } = renderHook((input: BookingModalInput) => useBookingModal(input), {
      initialProps: props,
    });
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    render(
      React.createElement(GuestReservationStatus, {
        kind: 'lesson',
        lifecycleStatus: result.current.guestReservation!.lifecycle.status,
        reasonCode: result.current.guestReservation!.lifecycle.reasonCode,
        language: 'en',
        t: (key) => translations.en[key],
        onRefresh: result.current.refreshGuestStatus,
        refreshing: false,
        refreshError: false,
        statusHydrated: true,
        onClose: result.current.closeGuestStatus,
        onNewBooking: result.current.startNewGuestBooking,
      })
    );
    expect(screen.getByText('Reservation expired')).toBeInTheDocument();
    expect(screen.getByText(/Your place is no longer being held/)).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe('booking_guest_fixture_01');
    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click();
    });
    expect(localStorage.getItem(key)).toBeNull();
    await act(async () => {
      rerender({ ...props, isOpen: false });
      rerender(props);
    });
    expect(result.current.previousGuestReservationId).toBeNull();
  });

  it('starts a new create attempt after an expired request', async () => {
    const key = 'ski_academy_guest_reservation:lesson:instructor_fixture_01';
    localStorage.setItem(key, 'booking_old');
    mocks.loadGuestSingleLessonBooking.mockResolvedValueOnce({
      lifecycle: { status: 'cancelled', reasonCode: 'reservation_expired' },
    });
    mocks.createLogicalBookingAttemptId.mockReturnValueOnce('booking_new');
    mocks.createGuestBooking.mockResolvedValueOnce({ bookingId: 'booking_new' });
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    act(() => {
      result.current.startNewGuestBooking();
    });
    expect(result.current.guestCreatedBookingId).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    act(() => {
      result.current.setGuestName('New Guest');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
    });
    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(mocks.createGuestBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { bookingId: 'booking_new', idempotencyKey: 'guest:booking_new' },
      })
    );
  });

  it('clears an unusable saved credential and leaves the form available', async () => {
    const key = 'ski_academy_guest_reservation:lesson:instructor_fixture_01';
    localStorage.setItem(key, 'booking_old');
    mocks.loadGuestSingleLessonBooking.mockRejectedValueOnce(new Error('expired'));
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    expect(result.current.guestLookupError).toBe('stale');
    expect(result.current.previousGuestReservationId).toBeNull();
    expect(result.current.guestCreatedBookingId).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('disables status lookup during a read and ignores a double click', async () => {
    localStorage.setItem(
      'ski_academy_guest_reservation:lesson:instructor_fixture_01',
      'booking_guest_fixture_01'
    );
    let resolveRead: ((value: unknown) => void) | undefined;
    mocks.loadGuestSingleLessonBooking.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    let first: Promise<void>;
    act(() => {
      first = result.current.checkPreviousGuestStatus();
      void result.current.checkPreviousGuestStatus();
    });
    const { rerender } = render(
      React.createElement(GuestBookingForm, { workspace: result.current })
    );
    expect(screen.getByRole('button', { name: 'processing' })).toBeDisabled();
    expect(mocks.loadGuestSingleLessonBooking).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveRead?.({ lifecycle: { status: 'pending' } });
      await first!;
    });
    rerender(React.createElement(GuestBookingForm, { workspace: result.current }));
    expect(result.current.guestRefreshing).toBe(false);
  });

  it('keeps a usable pointer and shows an inline recoverable lookup error', async () => {
    const key = 'ski_academy_guest_reservation:lesson:instructor_fixture_01';
    localStorage.setItem(key, 'booking_guest_fixture_01');
    mocks.loadGuestSingleLessonBooking.mockRejectedValueOnce(new Error('network unavailable'));
    const { result } = renderHook(() => useBookingModal(createProps()));
    await waitForAvailableSlot(result);
    await act(async () => {
      await result.current.checkPreviousGuestStatus();
    });
    expect(result.current.guestLookupError).toBe('recoverable');
    expect(localStorage.getItem(key)).toBe('booking_guest_fixture_01');
  });

  it('keeps the guest modal open and form data after request failure', async () => {
    const props = createProps();
    mocks.createGuestBooking.mockRejectedValueOnce(new Error('Request failed'));
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);

    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
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

  it('shows only inline quota feedback, preserves fields, and clears it during a retry', async () => {
    let rejectRetry: ((error: unknown) => void) | undefined;
    const quotaError = new CanonicalCommandClientError('guest_reservation_limit', {
      correlationId: 'correlation_guest_limit',
    });
    mocks.createGuestBooking.mockRejectedValueOnce(quotaError).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRetry = reject;
        })
    );
    const props = createProps();
    const { result } = renderHook(() => useBookingModal(props));
    await waitForAvailableSlot(result);
    act(() => {
      result.current.setGuestName('Guest Name');
      result.current.setGuestPhone('123456');
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
      result.current.setGuestEmail('guest@example.com');
      result.current.setDifficulty('advanced');
      result.current.setDuration(3);
    });
    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmitGuest(event);
    });
    expect(result.current.guestQuotaError).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.guestName).toBe('Guest Name');
    expect(result.current.guestPhone).toBe('123456');
    expect(result.current.guestEmail).toBe('guest@example.com');
    expect(result.current.difficulty).toBe('advanced');
    expect(result.current.duration).toBe(3);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.addNotification).not.toHaveBeenCalled();

    const { rerender: rerenderForm } = render(
      React.createElement(GuestBookingForm, { workspace: result.current })
    );
    const alert = screen.getByRole('alert');
    const submit = screen.getByRole('button', { name: /submitGuestApplication/i });
    expect(alert).toHaveTextContent('guestReservationLimitTitle');
    expect(alert).toHaveTextContent('guestReservationLimit');
    expect(alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(submit).toBeEnabled();

    let retry: Promise<void>;
    act(() => {
      retry = result.current.handleSubmitGuest(event);
    });
    expect(result.current.guestQuotaError).toBe(false);
    expect(result.current.isSubmitting).toBe(true);
    rerenderForm(React.createElement(GuestBookingForm, { workspace: result.current }));
    expect(submit).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.createGuestBooking).toHaveBeenCalledTimes(2);
    await act(async () => {
      rejectRetry?.(quotaError);
      await retry!;
    });
    expect(result.current.guestQuotaError).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
    rerenderForm(React.createElement(GuestBookingForm, { workspace: result.current }));
    expect(submit).toBeEnabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mocks.addNotification).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleSubmitGuest(event);
    });
    expect(result.current.guestQuotaError).toBe(false);
    expect(result.current.guestCreatedBookingId).toBe('booking_guest_fixture_01');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(mocks.confetti).not.toHaveBeenCalled();
  });

  it('has the requested Russian and English inline copy', () => {
    expect(translations.ru.guestReservationLimitTitle).toBe('Бронирование не создано');
    expect(translations.ru.guestReservationLimit).toBe(
      'С этого подключения уже создано слишком много активных заявок. Дождитесь завершения или отмены одной из них и попробуйте снова.'
    );
    expect(translations.en.guestReservationLimitTitle).toBe('Booking not created');
    expect(translations.en.guestReservationLimit).toBe(
      'Too many active reservations have been created from this connection. Please wait for one to expire or be cancelled and try again.'
    );
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
      result.current.setGuestAgeYears('12');
      result.current.setGuestDiscipline('ski');
      result.current.setGuestEmail('previous@example.com');
      result.current.setNotes('Previous note');
      result.current.setUnauthTab('auth');
    });

    await act(async () => {
      await result.current.handleSubmitGuest({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.guestCreatedBookingId).toBe('booking_guest_fixture_01');
    const occupancyReadsBeforeReopen = mocks.queryInstructorOccupancy.mock.calls.length;

    await act(async () => {
      rerender({ ...props, isOpen: false });
    });
    expect(result.current.guestName).toBe('');
    expect(result.current.guestPhone).toBe('');
    expect(result.current.guestEmail).toBe('');
    expect(result.current.guestAgeYears).toBe('');
    expect(result.current.guestDiscipline).toBe('');
    expect(result.current.notes).toBe('');
    expect(result.current.unauthTab).toBe('guest');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.guestCreatedBookingId).toBeNull();

    await act(async () => {
      rerender({ ...props, isOpen: true });
    });
    await waitForAvailableSlot(result);
    expect(mocks.queryInstructorOccupancy.mock.calls.length).toBeGreaterThan(
      occupancyReadsBeforeReopen
    );
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.addNotification).not.toHaveBeenCalled();
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
