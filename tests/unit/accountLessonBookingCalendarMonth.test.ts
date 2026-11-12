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
  buildAccountCalendarMonthSearchRange,
  resolveInitialVisibleAccountCalendarMonth,
  shiftVisibleAccountCalendarMonth,
} from '../../src/features/lesson-bookings/calendarMonthRange';
import { useState } from 'react';
import { buildMixedCabinetSessionItems } from '../../src/features/course-enrollments/cabinetSessionItems';
import { isSessionOnDate } from '../../src/features/course-enrollments/sessionScheduleHelpers';

const school = vi.hoisted(() => ({
  timeZone: 'Asia/Almaty',
  ready: true,
  error: undefined as Error | undefined,
  retry: vi.fn(),
}));
vi.mock('../../src/features/settings/schoolTimeZone', () => ({
  useSchoolTimeZone: () => school,
  requireSchoolTimeZone: () => {
    if (!school.ready || school.error) throw new Error('not ready');
    return school.timeZone;
  },
  retrySchoolTimeZone: () => school.retry(),
}));
beforeEach(() => {
  school.timeZone = 'Asia/Almaty';
  school.ready = true;
  school.error = undefined;
  school.retry.mockReset();
});

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
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'account_calendar_month' })
    );

    rerender({ monthIndex: 7 });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-08@Asia/Almaty')).toBe(
        'loaded'
      );
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);

    rerender({ monthIndex: 8 });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
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
    expect(
      useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')
    ).toBeUndefined();

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
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
    const range = buildAccountCalendarMonthRange(2026, 8, 'Asia/Almaty');

    const first = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      timeZone: 'Asia/Almaty',
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    const second = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      timeZone: 'Asia/Almaty',
      monthKey: range.monthKey,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);

    resolveQuery?.({ scope: 'account_calendar_month', items: [], hasMore: false });
    await Promise.all([first, second]);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);
    expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
      'loaded'
    );
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
      reconcileHot: { hasMore: false },
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
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(1);

    act(() => {
      useLessonBookingStore.getState().reset();
      useAuthStore.setState({ firebaseUser: { uid: 'account_cal_b' } as never });
    });
    rerender({ accountId: 'account_cal_b' });

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
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
    const range = buildAccountCalendarMonthRange(2026, 8, 'Asia/Almaty');
    let currentAccountId = 'account_cal_a';
    const pending = ensureAccountCalendarMonthLoaded({
      accountId: 'account_cal_a',
      timeZone: 'Asia/Almaty',
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
    expect(
      useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')
    ).toBeUndefined();
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
    const initial = resolveInitialVisibleAccountCalendarMonth('Asia/Almaty', now);
    expect(initial.year).toBe(2026);
    expect(initial.monthIndex).toBe(8);

    const range = buildAccountCalendarMonthRange(initial.year, initial.monthIndex, 'Asia/Almaty');
    expect(range.monthKey).toBe('2026-09@Asia/Almaty');
    expect(range.rangeStart).toEqual(timestampFromDate(new Date('2026-08-31T19:00:00Z')));
    expect(range.rangeEnd).toEqual(timestampFromDate(new Date('2026-09-30T19:00:00Z')));
  });

  it('keeps a manually selected month across re-renders', () => {
    const { result, rerender } = renderHook(
      (_props: { participantId: string }) => {
        const [currentMonth, setCurrentMonth] = useState(() =>
          resolveInitialVisibleAccountCalendarMonth('Asia/Almaty', new Date('2026-09-14T00:00:00Z'))
        );
        return {
          year: currentMonth.year,
          monthIndex: currentMonth.monthIndex,
          monthKey: accountCalendarMonthKey(
            currentMonth.year,
            currentMonth.monthIndex,
            'Asia/Almaty'
          ),
          goPrev: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, -1)),
          goNext: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, 1)),
        };
      },
      { initialProps: { participantId: 'participant_a' } }
    );

    expect(result.current.monthKey).toBe('2026-09@Asia/Almaty');

    act(() => {
      result.current.goPrev();
    });
    expect(result.current.monthKey).toBe('2026-08@Asia/Almaty');

    rerender({ participantId: 'participant_a' });
    expect(result.current.monthKey).toBe('2026-08@Asia/Almaty');

    act(() => {
      result.current.goNext();
    });
    expect(result.current.monthKey).toBe('2026-09@Asia/Almaty');

    rerender({ participantId: 'participant_a' });
    expect(result.current.monthKey).toBe('2026-09@Asia/Almaty');
  });

  it('keeps the manually selected month when the participant changes', () => {
    const { result, rerender } = renderHook(
      (_props: { participantId: string }) => {
        const [currentMonth, setCurrentMonth] = useState(() =>
          resolveInitialVisibleAccountCalendarMonth('Asia/Almaty', new Date('2026-09-14T00:00:00Z'))
        );
        return {
          monthKey: accountCalendarMonthKey(
            currentMonth.year,
            currentMonth.monthIndex,
            'Asia/Almaty'
          ),
          goPrev: () => setCurrentMonth((prev) => shiftVisibleAccountCalendarMonth(prev, -1)),
        };
      },
      { initialProps: { participantId: 'participant_a' } }
    );

    act(() => {
      result.current.goPrev();
    });
    expect(result.current.monthKey).toBe('2026-08@Asia/Almaty');

    rerender({ participantId: 'participant_b' });
    expect(result.current.monthKey).toBe('2026-08@Asia/Almaty');
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
    const initial = resolveInitialVisibleAccountCalendarMonth('Asia/Almaty', now);
    const expected = buildAccountCalendarMonthSearchRange(
      initial.year,
      initial.monthIndex,
      'Asia/Almaty'
    );

    renderHook(() =>
      useAccountLessonBookingCalendarMonth({
        enabled: true,
        year: initial.year,
        monthIndex: initial.monthIndex,
      })
    );

    await waitFor(() => {
      expect(useLessonBookingStore.getState().calendarMonths.get('2026-09@Asia/Almaty')).toBe(
        'loaded'
      );
    });
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'account_calendar_month',
        rangeStart: expected.rangeStart,
        rangeEnd: expected.rangeEnd,
      })
    );
    expect(expected.monthKey).toBe('2026-09@Asia/Almaty');
  });
});

describe('school timezone calendar contract', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    useAuthStore.setState({ firebaseUser: { uid: 'account_cal_a' } as never });
  });
  it.each([
    ['Asia/Almaty', 8, '2026-08-31T19:00:00Z', '2026-09-30T19:00:00Z'],
    ['UTC', 8, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'],
    ['America/New_York', 10, '2026-11-01T04:00:00Z', '2026-12-01T05:00:00Z'],
    ['Europe/Paris', 2, '2026-02-28T23:00:00Z', '2026-03-31T22:00:00Z'],
  ])('converts independent boundaries in %s', (zone, month, start, end) => {
    const range = buildAccountCalendarMonthRange(2026, Number(month), String(zone));
    expect(range.rangeStart).toEqual(timestampFromDate(new Date(start)));
    expect(range.rangeEnd).toEqual(timestampFromDate(new Date(end)));
  });
  it('uses the school date near midnight and crosses years without local Date math', () => {
    expect(
      resolveInitialVisibleAccountCalendarMonth('Asia/Almaty', new Date('2026-08-31T19:00:00Z'))
    ).toEqual({ year: 2026, monthIndex: 8 });
    expect(
      resolveInitialVisibleAccountCalendarMonth(
        'America/New_York',
        new Date('2026-09-01T00:00:00Z')
      )
    ).toEqual({ year: 2026, monthIndex: 7 });
    expect(shiftVisibleAccountCalendarMonth({ year: 2026, monthIndex: 11 }, 1)).toEqual({
      year: 2027,
      monthIndex: 0,
    });
    expect(shiftVisibleAccountCalendarMonth({ year: 2027, monthIndex: 0 }, -1)).toEqual({
      year: 2026,
      monthIndex: 11,
    });
  });
  it('waits for confirmed settings, exposes config errors, and retries configuration', async () => {
    school.ready = false;
    queryLessonBookingReadModelsMock.mockResolvedValue({ items: [], hasMore: false });
    const { result, rerender } = renderHook(() =>
      useAccountLessonBookingCalendarMonth({ enabled: true, year: 2026, monthIndex: 8 })
    );
    expect(result.current.status).toBe('loading');
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();
    school.error = new Error('config denied');
    rerender();
    expect(result.current.error).toBe('config denied');
    act(() => result.current.retry());
    expect(school.retry).toHaveBeenCalledOnce();
    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();
    school.error = undefined;
    school.ready = true;
    rerender();
    await waitFor(() => expect(result.current.status).toBe('loaded'));
  });
  it('reloads on timezone changes, ignores late results, and retains existing history', async () => {
    let finish!: (value: unknown) => void;
    queryLessonBookingReadModelsMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue({ items: [], hasMore: false });
    const retained = buildReadModel({
      bookingId: 'booking_retained',
      revision: 1,
      status: 'completed',
      startsAt: new Date('2026-06-01T00:00:00Z'),
    });
    applyAccountLessonBookingReadResults({ hotItems: [], historyItems: [retained] });
    const { result, rerender } = renderHook(() =>
      useAccountLessonBookingCalendarMonth({ enabled: true, year: 2026, monthIndex: 8 })
    );
    school.timeZone = 'UTC';
    rerender();
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    await act(async () =>
      finish({
        items: [
          buildReadModel({
            bookingId: 'booking_late',
            revision: 1,
            status: 'completed',
            startsAt: new Date('2026-09-01T00:00:00Z'),
          }),
        ],
        hasMore: false,
      })
    );
    expect(useLessonBookingStore.getState().items.has('booking_late')).toBe(false);
    expect(useLessonBookingStore.getState().items.has('booking_retained')).toBe(true);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    school.timeZone = 'Asia/Almaty';
    rerender();
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(3);
    expect(queryLessonBookingReadModelsMock.mock.calls[0][0]).not.toEqual(
      queryLessonBookingReadModelsMock.mock.calls[1][0]
    );
  });
  it.each([
    ['Pacific/Kiritimati', '2026-08-31T10:00:00Z', '2026-09-01'],
    ['Etc/GMT+12', '2026-10-01T11:00:00Z', '2026-09-30'],
  ])(
    'retains %s Booking labels at both month edges after settings change',
    (zone, instant, date) => {
      const record = buildReadModel({
        bookingId: 'booking_old_zone',
        revision: 1,
        status: 'completed',
        startsAt: new Date(instant),
      });
      const oldZoneRecord = {
        ...record,
        occurrence: { ...record.occurrence, timeZone: zone },
      } as LessonBookingReadModel;
      const before = JSON.stringify(oldZoneRecord);
      const item = mapLessonBookingReadModelToCabinetItem(oldZoneRecord);
      expect(item.date).toBe(date);
      for (const schoolZone of ['Asia/Almaty', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
        const range = buildAccountCalendarMonthSearchRange(2026, 8, schoolZone);
        expect(record.occurrence.startsAt.seconds).toBeGreaterThanOrEqual(range.rangeStart.seconds);
        expect(record.occurrence.startsAt.seconds).toBeLessThan(range.rangeEnd.seconds);
      }
      expect(JSON.stringify(oldZoneRecord)).toBe(before);
    }
  );
});

describe('calendar generation safety', () => {
  it('does not dedupe against a request from a previous session of the same account', async () => {
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    let finishOld!: (value: unknown) => void;
    queryLessonBookingReadModelsMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValue({ items: [], hasMore: false });
    const range = buildAccountCalendarMonthRange(2026, 8, 'Asia/Almaty');
    const input = { accountId: 'account_cal_a', timeZone: 'Asia/Almaty', ...range };
    const first = ensureAccountCalendarMonthLoaded(input);
    useLessonBookingStore.getState().reset();
    const second = ensureAccountCalendarMonthLoaded(input);
    await second;
    finishOld({
      items: [
        buildReadModel({
          bookingId: 'booking_old_session',
          revision: 1,
          status: 'completed',
          startsAt: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
      hasMore: false,
    });
    await first;
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    expect(useLessonBookingStore.getState().items.has('booking_old_session')).toBe(false);
    expect(useLessonBookingStore.getState().calendarMonths.get(range.monthKey)).toBe('loaded');
  });
});
