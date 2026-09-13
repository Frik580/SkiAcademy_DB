import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { useLessonBookingReadSync } from '../../src/features/lesson-bookings/useLessonBookingReadSync';
import {
  ACCOUNT_LESSON_BOOKING_FRESH_MS,
  resetAccountLessonBookingSyncStateForTests,
  syncAccountHotLessonBookingsFromServer,
} from '../../src/features/lesson-bookings/syncAccountLessonBookings';
import {
  shouldSyncAccountLessonBookings,
  shouldSyncAccountLessonHistory,
} from '../../src/store/accountLessonBookingSync';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

function accountHotCallCount(): number {
  return queryLessonBookingReadModelsMock.mock.calls.filter(
    (call) => call[0]?.scope === 'account_hot'
  ).length;
}

function renderSurfaceSync(pathname: string, accountId = 'account_p0b_01') {
  const hotEnabled = shouldSyncAccountLessonBookings({ pathname, accountId });
  const historyEnabled = shouldSyncAccountLessonHistory({ pathname, accountId });
  return renderHook(
    ({ path }: { path: string }) => {
      const hot = shouldSyncAccountLessonBookings({ pathname: path, accountId });
      const history = shouldSyncAccountLessonHistory({ pathname: path, accountId });
      return useLessonBookingReadSync(hot || history, accountId, history, hot);
    },
    { initialProps: { path: pathname } }
  );
}

describe('T32.9R.P0B surface-scoped account_hot refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useLessonBookingStore.getState().reset();
    resetAccountLessonBookingSyncStateForTests();
    queryLessonBookingReadModelsMock.mockReset();
    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A: unrelated Training surface idle — 0 timer-driven account_hot requests', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const { unmount } = renderSurfaceSync('/cabinet/training');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(accountHotCallCount()).toBe(0);
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 30_000)).toBe(false);
    setIntervalSpy.mockRestore();
    unmount();
  });

  it('B: hot Home surface initial entry — exactly 1 account_hot ensure', async () => {
    renderSurfaceSync('/cabinet');

    await waitFor(() => expect(accountHotCallCount()).toBe(1));
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'account_hot' });
    expect(useLessonBookingStore.getState().loaded).toBe(true);
  });

  it('C: idle hot surface — still exactly 1 total after 60–120s (timer removed)', async () => {
    renderSurfaceSync('/cabinet/home');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(accountHotCallCount()).toBe(1);
  });

  it('D: navigate away from hot surface stops ownership — no further account_hot', async () => {
    const { rerender } = renderSurfaceSync('/cabinet');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    rerender({ path: '/cabinet/training' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await Promise.resolve();
    });

    expect(accountHotCallCount()).toBe(1);
  });

  it('E: navigate back while fresh — 0 additional; while stale — exactly 1 more', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { rerender } = renderSurfaceSync('/cabinet');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    rerender({ path: '/cabinet/profile_personal' });
    rerender({ path: '/cabinet' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(accountHotCallCount()).toBe(1);

    rerender({ path: '/cabinet/training' });
    nowSpy.mockReturnValue(1_000_000 + ACCOUNT_LESSON_BOOKING_FRESH_MS + 1);
    rerender({ path: '/cabinet' });
    await waitFor(() => expect(accountHotCallCount()).toBe(2));
    nowSpy.mockRestore();
  });

  it('F: visibility change on unrelated surface — 0 account_hot', async () => {
    renderSurfaceSync('/cabinet/training');
    expect(accountHotCallCount()).toBe(0);

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await Promise.resolve();
    });

    expect(accountHotCallCount()).toBe(0);
  });

  it('G: visibility change on relevant stale surface — at most 1 additional', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
    renderSurfaceSync('/cabinet/calendar');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    nowSpy.mockReturnValue(5_000_000 + ACCOUNT_LESSON_BOOKING_FRESH_MS + 1);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(accountHotCallCount()).toBe(2));

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await Promise.resolve();
    });
    expect(accountHotCallCount()).toBe(2);
    nowSpy.mockRestore();
  });

  it('H: empty account_hot result is loaded — no request loop', async () => {
    renderSurfaceSync('/cabinet/coach');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));
    expect(useLessonBookingStore.getState().loaded).toBe(true);
    expect(useLessonBookingStore.getState().items.size).toBe(0);
    expect(useLessonBookingStore.getState().hotLoadedAtMs).toBeTypeOf('number');

    // Fresh visibility + idle time within TTL must not refetch merely because items=[].
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await Promise.resolve();
    });

    expect(accountHotCallCount()).toBe(1);
  });

  it('I: relevant mutation refresh — one deliberate sync then stable', async () => {
    renderSurfaceSync('/cabinet');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    queryLessonBookingReadModelsMock.mockResolvedValue({
      scope: 'account_hot',
      items: [],
      hasMore: false,
    });
    await act(async () => {
      await syncAccountHotLessonBookingsFromServer();
    });
    expect(accountHotCallCount()).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(accountHotCallCount()).toBe(2);
  });

  it('J: unrelated rerender / store update does not trigger account_hot', async () => {
    const { rerender } = renderSurfaceSync('/cabinet');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    act(() => {
      useLessonBookingStore.getState().setError(undefined);
    });
    rerender({ path: '/cabinet' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(accountHotCallCount()).toBe(1);
  });

  it('K: unmount clears visibility listener and issues no post-unmount request', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderSurfaceSync('/cabinet/instructors');
    await waitFor(() => expect(accountHotCallCount()).toBe(1));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(accountHotCallCount()).toBe(1);
    removeSpy.mockRestore();
  });

  it('History route loads account_history without account_hot ensure', async () => {
    queryLessonBookingReadModelsMock.mockImplementation(async (input: { scope: string }) => {
      if (input.scope === 'account_history') {
        return { scope: 'account_history', items: [], hasMore: false };
      }
      return { scope: 'account_hot', items: [], hasMore: false };
    });

    renderSurfaceSync('/cabinet/history');
    await waitFor(() =>
      expect(
        queryLessonBookingReadModelsMock.mock.calls.some(
          (call) => call[0]?.scope === 'account_history'
        )
      ).toBe(true)
    );
    expect(accountHotCallCount()).toBe(0);
  });
});
