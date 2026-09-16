import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';

const executeAuthenticatedMock = vi.fn();
const executeGuestMock = vi.fn();
const queryReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeAuthenticatedMock(...args),
  executeGuestCanonicalCommand: (...args: unknown[]) => executeGuestMock(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryReadModelsMock(...args),
}));

import { useLessonBookingCommands } from '../../src/features/lesson-bookings/useLessonBookingCommands';
import {
  refreshAccountLessonBookingsHotOnly,
  refreshAccountLessonBookingsWithHistory,
  resolveLessonBookingCommandRefreshStrategy,
} from '../../src/features/lesson-bookings';
import { resetAccountLessonBookingSyncStateForTests } from '../../src/features/lesson-bookings/syncAccountLessonBookings';

function scopedReadCount(scope: 'account_hot' | 'account_history'): number {
  return queryReadModelsMock.mock.calls.filter((call) => call[0]?.scope === scope).length;
}

function futureStartSeconds(): number {
  return Math.floor(Date.now() / 1000) + 86_400;
}

function createdHotReadModel(
  bookingId: string,
  options: { readonly startsAtSeconds: number }
): LessonBookingReadModel {
  const participantId = ParticipantIdSchema.parse('participant_fixture_01');
  return {
    bookingId: BookingIdSchema.parse(bookingId),
    revision: 1,
    partyKind: 'individual',
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Student' }],
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
      displayName: 'Coach',
    },
    occurrence: {
      startsAt: timestampFromDate(new Date(options.startsAtSeconds * 1000)),
      endsAt: timestampFromDate(new Date((options.startsAtSeconds + 7200) * 1000)),
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle: { status: 'confirmed' },
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: true,
      canWithdrawCancellation: false,
      canReschedule: true,
      canCreateChangeRequest: false,
    },
    paymentPresentation: { kind: 'visible', paymentStatus: 'paid', price: 100 },
    updatedAt: timestampFromDate(new Date(options.startsAtSeconds * 1000)),
  };
}

describe('lessonBooking commands integration', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    executeGuestMock.mockReset();
    queryReadModelsMock.mockReset();
    resetAccountLessonBookingSyncStateForTests();
    localStorage.clear();
  });

  it('create on a non-history surface refreshes account_hot only and stores the new booking', async () => {
    const bookingId = 'booking_auth_create_01';
    const accountId = 'account_fixture_01';
    const created = createdHotReadModel(bookingId, {
      startsAtSeconds: futureStartSeconds(),
    });
    executeAuthenticatedMock.mockResolvedValueOnce({ status: 'success', payload: {} });
    queryReadModelsMock.mockResolvedValueOnce({
      scope: 'account_hot',
      items: [created],
      hasMore: false,
    });

    const { result } = renderHook(() => useLessonBookingCommands(accountId));
    await result.current.createAuthenticatedBooking({
      instructorId: 'instructor_fixture_01',
      participantIds: ['participant_fixture_01'],
      exercisedCapability: 'account_owner',
      localDate: '2026-06-15',
      localTime: '08:00',
      durationMinutes: 120,
      timezone: 'Asia/Almaty',
      identity: {
        bookingId,
        idempotencyKey: `create-confirmed:${bookingId}`,
      },
      difficulty: 'intermediate',
      notes: '  Work on carving  ',
    });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        idempotencyKey: `create-confirmed:${bookingId}`,
        intent: expect.objectContaining({
          bookingId: BookingIdSchema.parse(bookingId),
          difficulty: 'intermediate',
          notes: 'Work on carving',
        }),
      })
    );
    // Non-history surface: account_hot carries the newly created booking; the
    // account_history read is not paid for.
    expect(scopedReadCount('account_hot')).toBe(1);
    expect(scopedReadCount('account_history')).toBe(0);
    expect(queryReadModelsMock).toHaveBeenCalledWith({ scope: 'account_hot' });
    expect(useLessonBookingStore.getState().items.get(bookingId)?.status).toBe('confirmed');
  });

  it('creates guest booking, persists credential, and does not call legacy callables', async () => {
    const bookingId = 'booking_guest_create_01';
    const credential = {
      bookingId: BookingIdSchema.parse(bookingId),
      guestSubjectId: 'guest_fixture_01',
      nonce: 'nonce_fixture_16chars',
      signature: 'c'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { guestActionCredential: credential },
    });

    const { result } = renderHook(() => useLessonBookingCommands(undefined));
    const returned = await result.current.createGuestBooking({
      instructorId: 'instructor_fixture_01',
      participantId: 'participant_fixture_01',
      localDate: '2026-06-15',
      localTime: '08:00',
      durationMinutes: 120,
      timezone: 'Asia/Almaty',
      identity: {
        bookingId,
        idempotencyKey: `create-guest-request:${bookingId}`,
      },
      guestDisplayName: 'Guest User',
      guestSkillLevel: 'beginner',
      guestDiscipline: 'ski',
      guestAgeYears: 12,
      difficulty: 'freeride',
      notes: 'First off-piste',
    });

    expect(returned.nonce).toBe('nonce_fixture_16chars');
    expect(localStorage.getItem(`ski_academy_guest_booking_credential:${bookingId}`)).toBeTruthy();
    expect(executeGuestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create_guest_booking_request',
        guestParticipantDisplayName: 'Guest User',
        guestParticipantSkillLevel: 'beginner',
        intent: expect.objectContaining({
          difficulty: 'freeride',
          notes: 'First off-piste',
        }),
      })
    );
  });

  it('treats guest booking as successful when local credential persistence fails after remote success', async () => {
    const bookingId = 'booking_guest_create_02';
    const credential = {
      bookingId: BookingIdSchema.parse(bookingId),
      guestSubjectId: '9441275176b1dfa9078cd642e85c68c97ff485459218c90a1936a68255e37ef5',
      nonce: 'nonce_fixture_16chars',
      signature: 'c'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      payload: { guestActionCredential: credential },
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    const { result } = renderHook(() => useLessonBookingCommands(undefined));
    const returned = await result.current.createGuestBooking({
      instructorId: 'instructor_fixture_01',
      participantId: 'participant_fixture_01',
      localDate: '2026-06-15',
      localTime: '08:00',
      durationMinutes: 120,
      timezone: 'Asia/Almaty',
      identity: {
        bookingId,
        idempotencyKey: `create-guest-request:${bookingId}`,
      },
      guestDisplayName: 'Guest User',
      guestSkillLevel: 'beginner',
      guestDiscipline: 'ski',
      guestAgeYears: 12,
      difficulty: 'beginner',
    });

    expect(returned.nonce).toBe('nonce_fixture_16chars');
    expect(localStorage.getItem(`ski_academy_guest_booking_credential:${bookingId}`)).toBeNull();
    setItemSpy.mockRestore();
  });

  it('rejects when remote success payload omits guestActionCredential', async () => {
    executeGuestMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'create_guest_booking_request',
      correlationId: 'correlation_missing_payload',
      payload: {},
    });

    const { result } = renderHook(() => useLessonBookingCommands(undefined));
    await expect(
      result.current.createGuestBooking({
        instructorId: 'instructor_fixture_01',
        participantId: 'participant_fixture_01',
        localDate: '2026-06-15',
        localTime: '08:00',
        durationMinutes: 120,
        timezone: 'Asia/Almaty',
        identity: {
          bookingId: 'booking_guest_create_03',
          idempotencyKey: 'create-guest-request:booking_guest_create_03',
        },
        guestDisplayName: 'Guest User',
        guestSkillLevel: 'beginner',
        guestDiscipline: 'ski',
        guestAgeYears: 12,
        difficulty: 'beginner',
      })
    ).rejects.toThrow('Guest credential was not returned.');
  });

  it('cancellation on a non-history surface refreshes account_hot only', async () => {
    const accountId = 'account_fixture_01';
    const bookingId = 'booking_cancel_01';
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'request_booking_cancellation',
      correlationId: 'correlation_cancel_01',
      payload: { lifecycleStatus: 'cancelled' },
    });
    queryReadModelsMock.mockResolvedValueOnce({ scope: 'account_hot', items: [], hasMore: false });

    const { result } = renderHook(() => useLessonBookingCommands(accountId));
    const outcome = await result.current.requestCancellation({
      bookingId,
      expectedRevision: 4,
      idempotencyKey: `cancel:${bookingId}:4`,
      exercisedCapability: 'account_owner',
    });

    expect(outcome).toEqual({ lifecycleStatus: 'cancelled', refreshFailed: false });

    expect(executeAuthenticatedMock).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        kind: 'request_booking_cancellation',
        expectedRevision: 4,
        intent: { bookingId: BookingIdSchema.parse(bookingId) },
      })
    );
    // Cancel on a non-history surface: hot-only refresh, no history scan.
    expect(scopedReadCount('account_hot')).toBe(1);
    expect(scopedReadCount('account_history')).toBe(0);
  });

  it('surfaces canonical errors without legacy fallback', async () => {
    executeAuthenticatedMock.mockResolvedValueOnce({
      status: 'error',
      error: {
        code: 'insufficient_funds',
        message: 'Insufficient funds',
        retryable: false,
        correlationId: 'correlation_funds',
      },
    });

    const { result } = renderHook(() => useLessonBookingCommands('account_fixture_01'));
    await expect(
      result.current.createAuthenticatedBooking({
        instructorId: 'instructor_fixture_01',
        participantIds: ['participant_fixture_01'],
        exercisedCapability: 'account_owner',
        localDate: '2026-06-15',
        localTime: '08:00',
        durationMinutes: 120,
        timezone: 'Asia/Almaty',
        identity: {
          bookingId: 'booking_fail_01',
          idempotencyKey: 'create-confirmed:booking_fail_01',
        },
      })
    ).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(queryReadModelsMock).not.toHaveBeenCalled();
  });
});

describe('lessonBooking command refresh is surface-aware', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    executeAuthenticatedMock.mockReset();
    queryReadModelsMock.mockReset();
    resetAccountLessonBookingSyncStateForTests();
  });

  it.each(['/cabinet', '/cabinet/calendar'])(
    'resolves the account_hot-only refresh for %s (no history ownership)',
    (pathname) => {
      expect(
        resolveLessonBookingCommandRefreshStrategy({ pathname, accountId: 'account_fixture_01' })
      ).toBe(refreshAccountLessonBookingsHotOnly);
    }
  );

  it.each(['/cabinet/history', '/cabinet/profile_journey'])(
    'resolves the hot + account_history refresh for %s',
    (pathname) => {
      expect(
        resolveLessonBookingCommandRefreshStrategy({
          pathname,
          accountId: 'account_fixture_01',
        })
      ).toBe(refreshAccountLessonBookingsWithHistory);
    }
  );

  it('route-aware container wiring: history surfaces read hot + history, other surfaces read hot only', async () => {
    queryReadModelsMock.mockImplementation(async (input: { scope: string }) => ({
      scope: input.scope,
      items: [],
      hasMore: false,
    }));

    // Mirrors CabinetRouteContainer: the surface derives the strategy from the
    // active pathname and hands it to the hook, which never reads router state.
    async function runCancellationRefresh(pathname: string) {
      queryReadModelsMock.mockClear();
      resetAccountLessonBookingSyncStateForTests();
      executeAuthenticatedMock.mockReset();
      executeAuthenticatedMock.mockResolvedValueOnce({
        status: 'success',
        kind: 'request_booking_cancellation',
        correlationId: 'correlation_route_refresh',
        payload: { lifecycleStatus: 'cancelled' },
      });

      const { result } = renderHook(
        () => {
          const { pathname: activePathname } = useLocation();
          return useLessonBookingCommands({
            accountId: 'account_fixture_01',
            refresh: resolveLessonBookingCommandRefreshStrategy({
              pathname: activePathname,
              accountId: 'account_fixture_01',
            }),
          });
        },
        {
          wrapper: ({ children }: { children: React.ReactNode }) =>
            createElement(MemoryRouter, { initialEntries: [pathname] }, children),
        }
      );

      await result.current.requestCancellation({
        bookingId: 'booking_route_refresh_01',
        expectedRevision: 2,
        idempotencyKey: 'cancel:booking_route_refresh_01:2',
        exercisedCapability: 'account_owner',
      });

      return {
        hot: scopedReadCount('account_hot'),
        history: scopedReadCount('account_history'),
      };
    }

    expect(await runCancellationRefresh('/cabinet/history')).toEqual({ hot: 1, history: 1 });
    expect(await runCancellationRefresh('/cabinet/profile_journey')).toEqual({
      hot: 1,
      history: 1,
    });
    expect(await runCancellationRefresh('/cabinet')).toEqual({ hot: 1, history: 0 });
    expect(await runCancellationRefresh('/cabinet/calendar')).toEqual({ hot: 1, history: 0 });
  });
});
