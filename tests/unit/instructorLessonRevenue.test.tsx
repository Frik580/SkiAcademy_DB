import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstructorLessonRevenueState } from '@ski-academy/shared-domain';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  snapshots: new Map<
    string,
    { next: (snapshot: unknown) => void; error: () => void; stop: ReturnType<typeof vi.fn> }
  >(),
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  resolveInstructorLessonRevenue: mocks.resolve,
}));
vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: (_: unknown, path: string) => path,
  onSnapshot: (
    path: string,
    _options: unknown,
    next: (snapshot: unknown) => void,
    error: () => void
  ) => {
    const stop = vi.fn();
    mocks.snapshots.set(path, { next, error, stop });
    return stop;
  },
}));
import {
  revenueStateFromProjection,
  subscribeInstructorLessonRevenue,
} from '../../src/features/instructor-workspace/instructorLessonRevenue';
import { useInstructorLessonRevenue } from '../../src/features/instructor-workspace/useInstructorLessonRevenue';
import { InstructorDashboardHeader } from '../../src/features/instructor-workspace/components/InstructorDashboardHeader';
import type { useInstructorWorkspace } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { translations } from '../../src/lib/i18n/translations';

function emit(path: string, data: unknown, fromCache = false) {
  mocks.snapshots
    .get(path)!
    .next({ exists: () => data !== undefined, data: () => data, metadata: { fromCache } });
}
const amount = { retainedAmount: 125000, unavailableCount: 0, revision: 1 };
beforeEach(() => {
  mocks.resolve.mockReset().mockResolvedValue({ statePath: 'state', summaryPath: 'summary' });
  mocks.snapshots.clear();
});
afterEach(cleanup);

describe('instructor revenue live read states', () => {
  it('distinguishes real zero from unavailable, invalid, incomplete and uninitialized data', () => {
    expect(revenueStateFromProjection(true, undefined)).toEqual({
      status: 'loaded',
      retainedAmount: 0,
    });
    expect(revenueStateFromProjection(false, amount)).toEqual({ status: 'unavailable' });
    expect(revenueStateFromProjection(true, { ...amount, unavailableCount: 1 })).toEqual({
      status: 'unavailable',
    });
    expect(revenueStateFromProjection(true, { retainedAmount: 42 })).toEqual({
      status: 'unavailable',
    });
  });
  it('waits for both server snapshots, updates on refund and releases listeners', async () => {
    const states = vi.fn();
    const stop = subscribeInstructorLessonRevenue(states);
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    emit('state', { ready: true }, true);
    emit('summary', undefined, true);
    expect(states).toHaveBeenLastCalledWith({ status: 'loading' });
    emit('state', { ready: true });
    emit('summary', amount);
    expect(states).toHaveBeenLastCalledWith({ status: 'loaded', retainedAmount: 125000 });
    emit('summary', { ...amount, retainedAmount: 5000 });
    expect(states).toHaveBeenLastCalledWith({ status: 'loaded', retainedAmount: 5000 });
    emit('state', { ready: false });
    expect(states).toHaveBeenLastCalledWith({ status: 'unavailable' });
    stop();
    expect([...mocks.snapshots.values()].every((s) => s.stop.mock.calls.length === 1)).toBe(true);
  });
  it('reports callable and listener errors without substituting zero', async () => {
    const states = vi.fn();
    mocks.resolve.mockRejectedValueOnce(new Error('unavailable'));
    subscribeInstructorLessonRevenue(states);
    await waitFor(() => expect(states).toHaveBeenLastCalledWith({ status: 'error' }));
    subscribeInstructorLessonRevenue(states);
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    mocks.snapshots.get('summary')!.error();
    expect(states).toHaveBeenLastCalledWith({ status: 'error' });
    emit('state', { ready: true });
    expect(states).toHaveBeenLastCalledWith({ status: 'error' });
  });
  it('re-authorizes on remount/focus and cannot display the previous account total', async () => {
    const hook = renderHook(({ uid }) => useInstructorLessonRevenue(uid, 'coach'), {
      initialProps: { uid: 'account_a' },
    });
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => {
      emit('state', { ready: true });
      emit('summary', amount);
    });
    expect(hook.result.current).toMatchObject({ status: 'loaded', retainedAmount: 125000 });
    hook.rerender({ uid: 'account_b' });
    expect(hook.result.current).toMatchObject({ status: 'loading' });
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(3));
    hook.unmount();
    renderHook(() => useInstructorLessonRevenue('account_b', 'coach'));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(4));
  });
});

describe.each(['ru', 'en'] as const)('instructor revenue card %s', (language) => {
  const t = (key: string) =>
    translations[language][key as keyof (typeof translations)['en']] as string;
  function card(revenue: InstructorLessonRevenueState) {
    const workspace = {
      language,
      t,
      userProfile: { displayName: 'Coach' },
      linkedInstructor: undefined,
      stats: { total: 1, completed: 1, noShow: 0, pending: 0, confirmed: 0 },
      revenue,
    } as unknown as ReturnType<typeof useInstructorWorkspace>;
    return render(<InstructorDashboardHeader workspace={workspace} />);
  }
  it('shows the exact title and grouped KZT total in the existing responsive themed card', () => {
    const { container } = card({ status: 'loaded', retainedAmount: 125000 });
    expect(screen.getByText(t('instructorCompletedLessonRevenue'))).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('125 000 ₸');
    expect(container.querySelector('.lg\\:grid-cols-4')).toBeTruthy();
    expect(container.querySelectorAll('.dark\\:border-slate-800\\/70').length).toBeGreaterThan(0);
  });
  it.each(['loading', 'error', 'unavailable'] as const)(
    'renders %s without false zero',
    (status) => {
      card({ status });
      const key =
        status === 'loading'
          ? 'instructorRevenueLoading'
          : status === 'error'
            ? 'instructorRevenueError'
            : 'instructorRevenueUnavailable';
      expect(screen.getByRole('status')).toHaveTextContent(t(key));
      expect(screen.getByRole('status')).not.toHaveTextContent('0 ₸');
    }
  );
  it('renders a loaded zero', () => {
    card({ status: 'loaded', retainedAmount: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('0 ₸');
  });
});
