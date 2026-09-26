import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLessonStartClock } from '../../src/features/booking-collaboration/useLessonStartClock';

afterEach(() => vi.useRealTimers());

describe('useLessonStartClock', () => {
  it('updates the lesson gate when the next start arrives without a page reload', () => {
    const startMs = Date.parse('2026-01-15T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(startMs - 1_000);
    const { result } = renderHook(() => useLessonStartClock([{ startsAtEpochMs: startMs }]));
    expect(result.current).toBe(startMs - 1_000);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(startMs);
  });

  it('updates when an already-started booking arrives after the initial render', () => {
    const startMs = Date.parse('2026-01-15T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(startMs - 60_000);
    const { result, rerender } = renderHook(({ bookings }) => useLessonStartClock(bookings), {
      initialProps: { bookings: [] as { startsAtEpochMs: number }[] },
    });
    vi.setSystemTime(startMs + 1_000);
    rerender({ bookings: [{ startsAtEpochMs: startMs }] });
    expect(result.current).toBe(startMs + 1_000);
  });
});
