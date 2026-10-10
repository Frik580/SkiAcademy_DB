import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCabinetSessionNow } from '../../src/features/student-cabinet/components/student/useCabinetSessionNow';
import type { CabinetSessionItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';

function course(start: number, end: number): CabinetSessionItem {
  return {
    kind: 'course_day',
    courseId: 'course',
    courseDayId: 'day',
    enrollmentId: 'enrollment',
    courseTitle: 'Course',
    participantId: 'a',
    lifecycleStatus: 'confirmed',
    date: '2026-10-10',
    time: '14:00',
    endTime: '15:00',
    timeZone: 'Asia/Almaty',
    startsAt: { seconds: Math.floor(start / 1000), nanoseconds: (start % 1000) * 1_000_000 },
    endsAt: { seconds: Math.floor(end / 1000), nanoseconds: (end % 1000) * 1_000_000 },
  } as CabinetSessionItem;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T08:59:59Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('owns one boundary timeout for simultaneous sessions, keeps it on rerender and cleans up', () => {
  const startsAt = Date.now() + 1000;
  const items = [course(startsAt, startsAt + 1000), course(startsAt, startsAt + 2000)];
  const intervals = vi.spyOn(window, 'setInterval');
  const { result, rerender, unmount } = renderHook(() => useCabinetSessionNow(items));
  expect(vi.getTimerCount()).toBe(1);
  const before = result.current;
  rerender();
  expect(result.current).toBe(before);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.getTime()).toBe(startsAt);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.getTime()).toBe(startsAt + 1000);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(intervals).not.toHaveBeenCalled();
});

it('stops at the last end and schedules nothing for past or inactive sessions', () => {
  const startsAt = Date.now() + 1000;
  const { unmount } = renderHook(() => useCabinetSessionNow([course(startsAt, startsAt + 1000)]));
  act(() => vi.advanceTimersByTime(1000));
  act(() => vi.advanceTimersByTime(1000));
  expect(vi.getTimerCount()).toBe(0);
  unmount();
  const inactive = {
    ...course(Date.now() + 1000, Date.now() + 2000),
    lifecycleStatus: 'cancelled',
  } as CabinetSessionItem;
  const view = renderHook(() =>
    useCabinetSessionNow([course(startsAt, startsAt + 1000), inactive])
  );
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});

it('replaces its timeout on changed input and caps long waits without overflow', () => {
  const startsAt = Date.now() + 1000;
  const { rerender, unmount } = renderHook(({ items }) => useCabinetSessionNow(items), {
    initialProps: { items: [course(startsAt, startsAt + 1000)] },
  });
  const timeouts = vi.spyOn(window, 'setTimeout');
  rerender({ items: [course(Date.now() + 3_000_000_000, Date.now() + 3_000_001_000)] });
  expect(vi.getTimerCount()).toBe(1);
  expect(timeouts).toHaveBeenLastCalledWith(expect.any(Function), 2_147_483_647);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('refreshes a boundary crossed between render and effect instead of skipping it', () => {
  const start = Date.now() + 1;
  const now = vi.spyOn(Date, 'now').mockReturnValue(start);
  const { result, unmount } = renderHook(() => useCabinetSessionNow([course(start, start + 1000)]));
  expect(result.current.getTime()).toBe(start - 1);
  expect(vi.getTimerCount()).toBe(1);
  now.mockRestore();
  vi.setSystemTime(start);
  act(() => vi.advanceTimersByTime(0));
  expect(result.current.getTime()).toBe(start);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
