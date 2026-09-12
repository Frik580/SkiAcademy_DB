import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';
import { resetAccountParticipantLessonStatsSyncStateForTests } from '../../src/features/lesson-bookings/syncAccountParticipantLessonStats';
import { useAccountParticipantLessonStatsSync } from '../../src/features/lesson-bookings/useAccountParticipantLessonStatsSync';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

describe('participant lesson stats surface containment', () => {
  beforeEach(() => {
    resetAccountParticipantLessonStatsSyncStateForTests();
    useAccountParticipantLessonStatsStore.getState().reset();
    queryLessonBookingReadModelsMock.mockReset();
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'account_hot' | 'account_history' }) => ({
        scope: input.scope,
        items: [],
        hasMore: false,
      })
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('does not drain history, poll, or visibility-refresh while the stats surface is inactive', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    renderHook(() => useAccountParticipantLessonStatsSync(false, 'account_stats_01'));

    document.dispatchEvent(new Event('visibilitychange'));

    expect(queryLessonBookingReadModelsMock).not.toHaveBeenCalled();
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 30_000)).toBe(false);
    setIntervalSpy.mockRestore();
  });

  it('loads on activation and does not timer- or visibility-refresh while active', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const { rerender } = renderHook(
      ({ enabled }) => useAccountParticipantLessonStatsSync(enabled, 'account_stats_01'),
      { initialProps: { enabled: false } }
    );

    rerender({ enabled: true });
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(useAccountParticipantLessonStatsStore.getState().loading).toBe(false)
    );
    expect(queryLessonBookingReadModelsMock.mock.calls.map((call) => call[0].scope)).toEqual([
      'account_hot',
      'account_history',
    ]);
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => undefined);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 30_000)).toBe(false);

    rerender({ enabled: false });
    setIntervalSpy.mockRestore();
  });

  it('reuses a fresh completed drain on a quick surface round-trip', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useAccountParticipantLessonStatsSync(enabled, 'account_stats_01'),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(useAccountParticipantLessonStatsStore.getState().loading).toBe(false)
    );

    rerender({ enabled: false });
    rerender({ enabled: true });
    await act(async () => undefined);

    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes a stale completed drain only when the stats surface is reactivated', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const { rerender } = renderHook(
      ({ enabled }) => useAccountParticipantLessonStatsSync(enabled, 'account_stats_01'),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(useAccountParticipantLessonStatsStore.getState().loading).toBe(false)
    );

    rerender({ enabled: false });
    nowSpy.mockReturnValue(31_001);
    rerender({ enabled: true });
    await waitFor(() => expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(4));

    nowSpy.mockRestore();
  });
});
