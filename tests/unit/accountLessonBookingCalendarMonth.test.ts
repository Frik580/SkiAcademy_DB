import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useAccountLessonBookingCalendarMonth } from '../../src/features/lesson-bookings/useAccountLessonBookingCalendarMonth';
import {
  selectLessonBookingItems,
  useLessonBookingStore,
} from '../../src/features/lesson-bookings/lessonBookingStore';
import {
  applyAccountLessonBookingReadResults,
  ensureAccountCalendarMonthLoaded,
  resetAccountLessonBookingSyncStateForTests,
} from '../../src/features/lesson-bookings/syncAccountLessonBookings';
import { mapLessonBookingReadModelToCabinetItem } from '../../src/features/lesson-bookings/lessonBookingViewModel';
import {
  accountCalendarMonthKey,
  buildAccountCalendarMonthRange,
  resolveInitialVisibleAccountCalendarMonth,
  shiftVisibleAccountCalendarMonth,
} from '../../src/features/lesson-bookings/calendarMonthRange';
import { useState } from 'react';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import { isSessionOnDate } from '../../src/features/course-enrollments/sessionScheduleHelpers';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

function buildReadModel(input: {
  readonly bookingId: string;
  readonly revision: number;
  readonly status: 'confirmed' | 'completed' | 'cancelled';
  readonly startsAt: Date;
  readonly endsAt?: Date;
}): LessonBookingReadModel {
  const participantId = ParticipantIdSchema.parse('participant_fixture_01');
  const startsAt = timestampFromDate(input.startsAt);
  const endsAt = timestampFromDate(
    input.endsAt ?? new Date(input.startsAt.getTime() + 60 * 60 * 1000)
  );
  const lifecycle =
    input.status === 'cancelled'
      ? {
          status: 'cancelled' as const,
          cancelledAt: timestampFromDate(new Date('2026-09-10T00:00:00.000Z')),
        }
      : input.status === 'completed'
        ? {
            status: 'completed' as const,
            completedAt: endsAt,
          }
        : { status: 'confirmed' as const };

  return {
    bookingId: BookingIdSchema.parse(input.bookingId),
    revision: input.revision,
    partyKind: 'individual',
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Student' }],
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
      displayName: 'Coach',
    },
    occurrence: {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle,
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: input.status === 'confirmed',
      canWithdrawCancellation: false,
      canReschedule: input.status === 'confirmed',
      canCreateChangeRequest: false,
    },
    paymentPresentation: { kind: 'visible', paymentStatus: 'paid', price: 100 },
    updatedAt: startsAt,
  };
}

describe('account calendar month cache', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    useAuthStore.setState({ firebaseUser: { uid: 'account_cal_a' } as never });
  });

  it('loads September once and reuses the cache after visiting August', async () => {
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: string; rangeStart: { seconds: number } }) => ({
        scope: input.scope,
        items: [],
        hasMore: false,
      })
    );

    const { rerender } = renderHook(
      ({ monthIndex }: { monthIndex: number }) =>
        useAccountLessonBookingCalendarMonth({
          enabled: true,
          year: 2026,
          monthIndex,
        }),
      { initialProps: { monthIndex: 8 } }
    );

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'account_calendar_month' })
    );

    rerender({ monthIndex: 7 });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-08')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);

    rerender({ monthIndex: 8 });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    expect(
      queryLessonBookingReadModelsMock.mock.calls.every(
        (call) => (call[0] as { scope: string }).scope !== 'account_history'
      )
    ).toBe(true);
  });

  it('does not mark a month loaded on error and retries the server request', async () => {
    queryLessonBookingReadModelsMock
      .mockRejectedValueOnce(new Error('calendar month failed'))
      .mockResolvedValueOnce({ scope: 'account_calendar_month', items: [], hasMore: false });

    const { result } = renderHook(() =>
      useAccountLessonBookingCalendarMonth({
        enabled: true,
        year: 2026,
        monthIndex: 8,
      })
    );

    await waitFor(() => {
      expect(result.current.error).toBe('calendar month failed');
    });
    expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBeUndefined();

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent loads of the same month into one server request', async () => {
    let resolveQuery: ((value: unknown) => void) | undefined;
    queryLessonBookingReadModelsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        })
    );
    const range = buildAccountCalendarMonthRange(2026, 8);

    const first = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    const second = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);

    resolveQuery?.({ scope: 'account_calendar_month', items: [], hasMore: false });
    await Promise.all([first, second]);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);
    expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
  });
});

describe('account calendar month store merge', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
  });

  it('keeps August items, history items, and dedupes when merging September', () => {
    const aug = buildReadModel({
      bookingId: 'booking_cal_aug',
      revision: 1,
      status: 'completed',
      startsAt: new Date('2026-08-15T04:00:00.000Z'),
    });
    const history = buildReadModel({
      bookingId: 'booking_cal_history',
      revision: 2,
      status: 'cancelled',
      startsAt: new Date('2026-07-01T04:00:00.000Z'),
    });
    const sep = buildReadModel({
      bookingId: 'booking_cal_sep',
      revision: 3,
      status: 'completed',
      startsAt: new Date('2026-09-15T04:00:00.000Z'),
    });

    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [history],
      calendarItems: [aug],
    });
    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      calendarItems: [sep, sep],
    });

    const items = useLessonBookingStore.getState().items;
    expect(items.get('booking_cal_aug')?.date).toBe('2026-08-15');
    expect(items.get('booking_cal_history')?.status).toBe('cancelled');
    expect(items.get('booking_cal_sep')?.date).toBe('2026-09-15');
    expect(items.size).toBe(3);
  });

  it('does not let hot refresh prune past calendar items', () => {
    const past = buildReadModel({
      bookingId: 'booking_cal_past',
      revision: 4,
      status: 'completed',
      startsAt: new Date('2026-09-02T04:00:00.000Z'),
    });
    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      calendarItems: [past],
    });

    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      reconcileHot: true,
    });

    expect(useLessonBookingStore.getState().items.has('booking_cal_past')).toBe(true);
  });

  it('moves a rescheduled September booking to October without a month refetch', () => {
    const original = buildReadModel({
      bookingId: 'booking_cal_reschedule',
      revision: 2,
      status: 'confirmed',
      startsAt: new Date('2026-09-30T04:00:00.000Z'),
    });
    const moved = buildReadModel({
      bookingId: 'booking_cal_reschedule',
      revision: 3,
      status: 'confirmed',
      startsAt: new Date('2026-10-02T04:00:00.000Z'),
    });
    applyAccountLessonBookingReadResults({
      hotItems: [],
      historyItems: [],
      calendarItems: [original],
    });
    applyAccountLessonBookingReadResults({
      hotItems: [moved],
      historyItems: [],
    });

    const item = useLessonBookingStore.getState().items.get('booking_cal_reschedule');
    expect(item?.date).toBe('2026-10-02');
    const sessions = buildMixedCabinetSessionItems({
      lessonBookings: selectLessonBookingItems(useLessonBookingStore.getState()),
      courseEnrollments: [],
    });
    expect(sessions.some((session) => isSessionOnDate(session, '2026-09-30'))).toBe(false);
    expect(sessions.some((session) => isSessionOnDate(session, '2026-10-02'))).toBe(true);
  });
});

describe('account calendar month account safety and UI path', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    useAuthStore.setState({ firebaseUser: { uid: 'account_cal_a' } as never });
  });

  it('does not treat account A loaded months as a cache hit after account switch', async () => {
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_calendar_month',
      items: [],
      hasMore: false,
    });

    const { rerender } = renderHook(
      ({ accountId: _accountId }: { accountId: string }) =>
        useAccountLessonBookingCalendarMonth({
          enabled: true,
          year: 2026,
          monthIndex: 8,
        }),
      { initialProps: { accountId: 'account_cal_a' } }
    );

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);

    act(() => {
      useLessonBookingStore.getState().reset();
      useAuthStore.setState({ firebaseUser: { uid: 'account_cal_b' } as never });
    });
    rerender({ accountId: 'account_cal_b' });

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
  });

  it('drops a late account A month response after the current account changes', async () => {
    let resolveQuery: ((value: unknown) => void) | undefined;
    queryLessonBookingReadModelsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        })
    );
    const range = buildAccountCalendarMonthRange(2026, 8);
    let currentAccountId = 'account_cal_a';
    const pending = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      getCurrentAccountId: () => currentAccountId,
    });

    currentAccountId = 'account_cal_b';
    useLessonBookingStore.getState().reset();
    resolveQuery?.({
      scope: 'account_calendar_month',
      items: [
        buildReadModel({
          bookingId: 'booking_from_account_a',
          revision: 1,
          status: 'completed',
          startsAt: new Date('2026-09-15T04:00:00.000Z'),
        }),
      ],
      hasMore: false,
    });
    await pending;

    expect(useLessonBookingStore.getState().items.has('booking_from_account_a')).toBe(false);
    expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBeUndefined();
  });

  it('shows a past completed September lesson from calendar month without account_history', async () => {
    const completed = buildReadModel({
      bookingId: 'booking_cal_completed_sep',
      revision: 6,
      status: 'completed',
      startsAt: new Date('2026-09-15T04:00:00.000Z'),
    });
    queryLessonBookingReadModelsMock.mockResolvedValueOnce({
      scope: 'account_calendar_month',
      items: [completed],
      hasMore: false,
    });

    renderHook(() =>
      useAccountLessonBookingCalendarMonth({
        enabled: true,
        year: 2026,
        monthIndex: 8,
      })
    );

    await waitFor(() => {
      expect(useLessonBookingStore.getState().items.has('booking_cal_completed_sep')).toBe(true);
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'account_calendar_month' })
    );
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'account_history' })
    );

    const sessions = buildMixedCabinetSessionItems({
      lessonBookings: selectLessonBookingItems(useLessonBookingStore.getState()),
      courseEnrollments: [],
    });
    expect(sessions.some((session) => isSessionOnDate(session, '2026-09-15'))).toBe(true);
    expect(mapLessonBookingReadModelToCabinetItem(completed).status).toBe('completed');
  });

  it('wires Student Calendar month navigation to the calendar-month read path', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/student-cabinet/components/ClientBookingsList.tsx'),
      'utf8'
    );
    expect(source).toContain('useAccountLessonBookingCalendarMonth');
    expect(source).toContain('setCurrentMonth');
    expect(source).toContain('resolveInitialVisibleAccountCalendarMonth');
    expect(source).toContain('shiftVisibleAccountCalendarMonth');
    expect(source).not.toMatch(/useState<Date>\(\(\)\s*=>\s*\{[\s\S]*sessionItems\.find/);
  });
});

describe('student cabinet calendar initial visible month', () => {
  it('uses the current calendar month when today is in September 2026', () => {
    const now = new Date(2026, 8, 14, 15, 30, 0);
    const initial = resolveInitialVisibleAccountCalendarMonth(now);
    expect(initial.getFullYear()).toBe(2026);
    expect(initial.getMonth()).toBe(8);
    expect(initial.getDate()).toBe(1);

    const range = buildAccountCalendarMonthRange(initial.getFullYear(), initial.getMonth());
    expect(range.monthKey).toBe('2026-09');
    expect(range.rangeStart).toEqual(timestampFromDate(new Date(2026, 8, 1)));
    expect(range.rangeEnd).toEqual(timestampFromDate(new Date(2026, 9, 1)));
  });

  it('keeps a manually selected month across re-renders', () => {
    const { result, rerender } = renderHook(
      (_props: { participantId: string }) => {
        const [currentMonth, setCurrentMonth] = useState(() =>
          resolveInitialVisibleAccountCalendarMonth(new Date(2026, 8, 14))
        );
        return {
          year: currentMonth.getFullYear(),
          monthIndex: currentMonth.getMonth(),
          monthKey: accountCalendarMonthKey(currentMonth.getFullYear(), currentMonth.getMonth()),
          goPrev: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, -1)),
          goNext: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, 1)),
        };
      },
      { initialProps: { participantId: 'participant_a' } }
    );

    expect(result.current.monthKey).toBe('2026-09');

    act(() => {
      result.current.goPrev();
    });
    expect(result.current.monthKey).toBe('2026-08');

    rerender({ participantId: 'participant_a' });
    expect(result.current.monthKey).toBe('2026-08');

    act(() => {
      result.current.goNext();
    });
    expect(result.current.monthKey).toBe('2026-09');

    rerender({ participantId: 'participant_a' });
    expect(result.current.monthKey).toBe('2026-09');
  });

  it('keeps the manually selected month when the participant changes', () => {
    const { result, rerender } = renderHook(
      (_props: { participantId: string }) => {
        const [currentMonth, setCurrentMonth] = useState(() =>
          resolveInitialVisibleAccountCalendarMonth(new Date(2026, 8, 14))
        );
        return {
          monthKey: accountCalendarMonthKey(currentMonth.getFullYear(), currentMonth.getMonth()),
          goPrev: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, -1)),
        };
      },
      { initialProps: { participantId: 'participant_a' } }
    );

    act(() => {
      result.current.goPrev();
    });
    expect(result.current.monthKey).toBe('2026-08');

    rerender({ participantId: 'participant_b' });
    expect(result.current.monthKey).toBe('2026-08');
  });

  it('loads the current YYYY-MM month key/range on first open', async () => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    useAuthStore.setState({ firebaseUser: { uid: 'account_cal_a' } as never });
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_calendar_month',
      items: [],
      hasMore: false,
    });

    const now = new Date(2026, 8, 14);
    const initial = resolveInitialVisibleAccountCalendarMonth(now);
    const expected = buildAccountCalendarMonthRange(initial.getFullYear(), initial.getMonth());

    renderHook(() =>
      useAccountLessonBookingCalendarMonth({
        enabled: true,
        year: initial.getFullYear(),
        monthIndex: initial.getMonth(),
      })
    );

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09')).toBe('loaded');
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'account_calendar_month',
        rangeStart: expected.rangeStart,
        rangeEnd: expected.rangeEnd,
      })
    );
    expect(expected.monthKey).toBe('2026-09');
  });
});
