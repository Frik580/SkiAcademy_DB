import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTRUCTOR_LESSON_REVENUE_STATE_PATH as statePath } from '@ski-academy/shared-domain';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  snapshots: new Map<
    string,
    {
      next: (snapshot: unknown) => void;
      error: (error?: unknown) => void;
      stop: ReturnType<typeof vi.fn>;
    }
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
    error: (error?: unknown) => void
  ) => {
    const stop = vi.fn();
    mocks.snapshots.set(path, { next, error, stop });
    return stop;
  },
}));
vi.mock('../../src/features/auth/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({})) };
});
vi.mock('../../src/features/profile/profileStore', async () => {
  const { create } = await import('zustand');
  return { useProfileStore: create(() => ({})) };
});
import { useAuthStore } from '../../src/features/auth/authStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import {
  observeInstructorLessonRevenue,
  revenueStateFromProjection,
  type InstructorRevenueRead,
} from '../../src/features/instructor-workspace/instructorLessonRevenue';
import { useInstructorLessonRevenue } from '../../src/features/instructor-workspace/useInstructorLessonRevenue';
import { InstructorDashboardHeader } from '../../src/features/instructor-workspace/components/InstructorDashboardHeader';
import type { useInstructorWorkspace } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { translations } from '../../src/lib/i18n/translations';

function emit(path: string, data: unknown, fromCache = false, hasPendingWrites = false) {
  mocks.snapshots.get(path)!.next({
    exists: () => data !== undefined,
    data: () => data,
    metadata: { fromCache, hasPendingWrites },
  });
}
const amount = { retainedAmount: 125000, unavailableCount: 0, revision: 1 };
const summaryPath = 'instructor_lesson_revenue/live/instructors/coach';
const paths = { statePath, summaryPath };
const loaded = { status: 'loaded', retainedAmount: 125000 };
const focus = () => window.dispatchEvent(new Event('focus'));

function signIn(uid: string, authGeneration: number) {
  useAuthStore.setState({
    firebaseUser: { uid } as NonNullable<ReturnType<typeof useAuthStore.getState>['firebaseUser']>,
    authGeneration,
  });
}

function profile(
  uid: string,
  instructorId: string | undefined = 'coach',
  overrides: Partial<NonNullable<ReturnType<typeof useProfileStore.getState>['userProfile']>> & {
    testSessionId?: string;
  } = {}
) {
  const userProfile = {
    uid,
    instructorId,
    dataScope: 'live',
    role: 'user',
    isInstructor: true,
    ...overrides,
  } as NonNullable<ReturnType<typeof useProfileStore.getState>['userProfile']>;
  useProfileStore.setState({
    userProfile,
    canonicalReadyAccountId: uid,
    profileLoading: false,
    profileLoadError: false,
  });
}

function deferredPaths() {
  let resolve!: (value: typeof paths) => void;
  let reject!: (reason: unknown) => void;
  const pending = new Promise<typeof paths>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  mocks.resolve.mockReturnValueOnce(pending);
  return { resolve, reject };
}

function deliver(total: typeof amount | undefined = amount, path = summaryPath) {
  emit(statePath, { ready: true });
  emit(path, total);
}

function observe(onState: (state: InstructorRevenueRead) => void) {
  const observer = observeInstructorLessonRevenue({
    key: 'account_a:coach:all-time',
    instructorId: 'coach',
    dataScope: 'live',
    isCurrent: () => true,
    onState,
  });
  void observer.refresh();
  return observer.stop;
}

beforeEach(() => {
  mocks.resolve.mockReset().mockResolvedValue(paths);
  mocks.snapshots.clear();
  signIn('account_a', 1);
  profile('account_a');
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
    const stop = observe(states);
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    emit(statePath, { ready: true }, true);
    emit(summaryPath, undefined, true);
    expect(states).toHaveBeenLastCalledWith({ status: 'loading' });
    deliver();
    expect(states).toHaveBeenLastCalledWith({ status: 'loaded', retainedAmount: 125000 });
    emit(summaryPath, { ...amount, retainedAmount: 5000 });
    expect(states).toHaveBeenLastCalledWith({ status: 'loaded', retainedAmount: 5000 });
    emit(statePath, { ready: false });
    expect(states).toHaveBeenLastCalledWith({ status: 'unavailable' });
    stop();
    expect([...mocks.snapshots.values()].every((s) => s.stop.mock.calls.length === 1)).toBe(true);
  });
  it('reports callable and listener errors without substituting zero', async () => {
    const states = vi.fn();
    mocks.resolve.mockRejectedValueOnce(new Error('unavailable'));
    observe(states);
    await waitFor(() => expect(states).toHaveBeenLastCalledWith({ status: 'error' }));
    observe(states);
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    mocks.snapshots.get(summaryPath)!.error();
    expect(states).toHaveBeenLastCalledWith({ status: 'error' });
    emit(statePath, { ready: true });
    expect(states).toHaveBeenLastCalledWith({ status: 'error' });
  });
  it('re-authorizes on remount/focus and cannot display the previous account total', async () => {
    const hook = renderHook(({ uid }) => useInstructorLessonRevenue(uid, 'coach'), {
      initialProps: { uid: 'account_a' },
    });
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => deliver());
    expect(hook.result.current.revenue).toEqual(loaded);
    act(() => {
      signIn('account_b', 2);
      profile('account_b');
    });
    hook.rerender({ uid: 'account_b' });
    expect(hook.result.current.revenue).toEqual({ status: 'loading' });
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2));
    act(focus);
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(3));
    hook.unmount();
    renderHook(() => useInstructorLessonRevenue('account_b', 'coach'));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(4));
  });

  it('waits for a canonical Account, then authorizes a linked admin with both roles', async () => {
    useProfileStore.setState({ canonicalReadyAccountId: null, profileLoading: true });
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    expect(hook.result.current.revenue.status).toBe('loading');
    expect(mocks.resolve).not.toHaveBeenCalled();
    const access = deferredPaths();
    act(() => profile('account_a', 'coach', { role: 'admin' }));
    expect(mocks.snapshots.size).toBe(0);
    await act(async () => access.resolve(paths));
    act(() => {
      emit(statePath, { ready: true });
      emit(summaryPath, undefined, false, true);
    });
    expect(hook.result.current.revenue.status).toBe('loading');
    act(() => emit(summaryPath, undefined));
    expect(hook.result.current.revenue).toEqual({ status: 'loaded', retainedAmount: 0 });
    act(() => profile('account_a', '', { role: 'admin', isInstructor: false }));
    expect(hook.result.current.revenue.status).toBe('denied');
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });

  it('holds the last amount during live updates and resumes the same listeners after access recheck', async () => {
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => deliver());
    const original = mocks.snapshots.get(summaryPath)!;
    const recheck = deferredPaths();
    expect(hook.result.current.revenue).toEqual(loaded);
    act(() => {
      focus();
      focus();
    });
    expect(hook.result.current.revenue).toEqual({ status: 'checking' });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    await act(async () => recheck.resolve(paths));
    expect(hook.result.current.revenue).toEqual(loaded);
    expect(mocks.snapshots.get(summaryPath)).toBe(original);
    expect(original.stop).not.toHaveBeenCalled();
    act(() => emit(summaryPath, { ...amount, retainedAmount: 124999, revision: 2 }));
    expect(hook.result.current.revenue).toEqual({ status: 'loaded', retainedAmount: 124999 });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });

  it('hides offline snapshots until server confirmation resumes', async () => {
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => deliver());
    expect(hook.result.current.revenue).toEqual(loaded);
    act(() => emit(summaryPath, amount, true));
    expect(hook.result.current.revenue.status).toBe('loading');
    act(() => emit(summaryPath, amount));
    expect(hook.result.current.revenue).toEqual(loaded);
  });

  it('hides the amount when reauthorization fails and recovers only after a manual retry is verified', async () => {
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => deliver());
    const original = mocks.snapshots.get(summaryPath)!;
    const recheck = deferredPaths();
    act(focus);
    await act(async () => recheck.reject({ code: 'functions/unavailable' }));
    expect(hook.result.current.revenue).toEqual({ status: 'error' });
    expect(original.stop).toHaveBeenCalledTimes(1);
    act(() => emit(summaryPath, amount));
    expect(hook.result.current.revenue).toEqual({ status: 'error' });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    await act(async () => hook.result.current.retryRevenue());
    expect(hook.result.current.revenue).toEqual({ status: 'loading' });
    act(() => deliver({ ...amount, retainedAmount: 0 }));
    expect(hook.result.current.revenue).toEqual({ status: 'loaded', retainedAmount: 0 });
    expect(mocks.resolve).toHaveBeenCalledTimes(3);
  });

  it.each(['role', 'logout', 'link', 'listener'] as const)(
    'drops all data and ignores a late access response after revocation via %s',
    async (source) => {
      const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
      await waitFor(() => expect(mocks.snapshots.size).toBe(2));
      act(() => deliver());
      const recheck = deferredPaths();
      act(focus);
      act(() => {
        switch (source) {
          case 'role':
            profile('account_a', 'coach', { isInstructor: false });
            break;
          case 'logout':
            useAuthStore.setState({ firebaseUser: null, authGeneration: 2 });
            break;
          case 'link':
            profile('account_a', '');
            break;
          case 'listener':
            mocks.snapshots.get(summaryPath)!.error({ code: 'permission-denied' });
            break;
        }
      });
      expect(hook.result.current.revenue).toEqual({ status: 'denied' });
      await act(async () => recheck.resolve(paths));
      act(() => emit(summaryPath, amount));
      expect(hook.result.current.revenue).toEqual({ status: 'denied' });
      expect(mocks.snapshots.get(summaryPath)!.stop).toHaveBeenCalledTimes(1);
    }
  );

  it('reports a callable denial without leaking the existing total', async () => {
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.size).toBe(2));
    act(() => deliver());
    mocks.resolve.mockRejectedValueOnce({ code: 'functions/permission-denied' });
    await act(async () => focus());
    expect(hook.result.current.revenue).toEqual({ status: 'denied' });
    expect(mocks.snapshots.get(summaryPath)!.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores the old request when Instructor A changes to B', async () => {
    const oldRead = deferredPaths();
    const hook = renderHook(({ id }) => useInstructorLessonRevenue('account_a', id), {
      initialProps: { id: 'coach' },
    });
    const otherPath = 'instructor_lesson_revenue/live/instructors/other';
    mocks.resolve.mockResolvedValueOnce({ statePath, summaryPath: otherPath });
    act(() => profile('account_a', 'other'));
    hook.rerender({ id: 'other' });
    await waitFor(() => expect(mocks.snapshots.has(otherPath)).toBe(true));
    act(() => deliver({ ...amount, retainedAmount: 1000 }, otherPath));
    await act(async () => oldRead.resolve(paths));
    expect(hook.result.current.revenue).toEqual({ status: 'loaded', retainedAmount: 1000 });
    expect(mocks.snapshots.has(summaryPath)).toBe(false);
  });

  it('does not restore the previous total when the server assigns a different test session', async () => {
    profile('account_a', 'coach', { dataScope: 'test' });
    const sessionA = 'instructor_lesson_revenue/test_a/instructors/coach';
    const sessionB = 'instructor_lesson_revenue/test_b/instructors/coach';
    mocks.resolve.mockResolvedValueOnce({ statePath, summaryPath: sessionA });
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.has(sessionA)).toBe(true));
    act(() => deliver(amount, sessionA));
    expect(hook.result.current.revenue).toEqual(loaded);
    mocks.resolve.mockResolvedValueOnce({ statePath, summaryPath: sessionB });
    await act(async () => focus());
    expect(hook.result.current.revenue).toEqual({ status: 'loading' });
    act(() => emit(sessionA, amount));
    expect(hook.result.current.revenue).toEqual({ status: 'loading' });
    act(() => deliver({ ...amount, retainedAmount: 7 }, sessionB));
    expect(hook.result.current.revenue).toEqual({ status: 'loaded', retainedAmount: 7 });
  });

  it('immediately invalidates the total when the observed Account test session changes', async () => {
    const sessionA = 'instructor_lesson_revenue/test_a/instructors/coach';
    profile('account_a', 'coach', { dataScope: 'test', testSessionId: 'a' });
    mocks.resolve.mockResolvedValueOnce({ statePath, summaryPath: sessionA });
    const hook = renderHook(() => useInstructorLessonRevenue('account_a', 'coach'));
    await waitFor(() => expect(mocks.snapshots.has(sessionA)).toBe(true));
    act(() => deliver(amount, sessionA));
    expect(hook.result.current.revenue).toEqual(loaded);
    const recheck = deferredPaths();
    act(() => profile('account_a', 'coach', { dataScope: 'test', testSessionId: 'b' }));
    expect(hook.result.current.revenue).toEqual({ status: 'loading' });
    await act(async () => recheck.resolve({ statePath, summaryPath: sessionA }));
    expect(hook.result.current.revenue).toEqual({ status: 'denied' });
    expect(mocks.snapshots.get(sessionA)!.stop).toHaveBeenCalledOnce();
  });
});

describe.each(['ru', 'en'] as const)('instructor revenue card %s', (language) => {
  const t = (key: string) =>
    translations[language][key as keyof (typeof translations)['en']] as string;
  function card(revenue: InstructorRevenueRead, retryRevenue = vi.fn()) {
    const workspace = {
      language,
      t,
      userProfile: { displayName: 'Coach' },
      linkedInstructor: undefined,
      stats: { total: 1, completed: 1, noShow: 0, pending: 0, confirmed: 0 },
      revenue,
      retryRevenue,
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
  it.each([
    ['loading', 'instructorRevenueLoading'],
    ['checking', 'instructorRevenueChecking'],
    ['error', 'instructorRevenueError'],
    ['unavailable', 'instructorRevenueUnavailable'],
    ['denied', 'instructorRevenueDenied'],
  ] as const)('renders %s without false zero', (status, key) => {
    card({ status });
    expect(screen.getByRole('status')).toHaveTextContent(t(key));
    expect(screen.getByRole('status')).not.toHaveTextContent('0 ₸');
  });
  it('offers a localized retry for a temporary error', () => {
    const retry = vi.fn();
    card({ status: 'error' }, retry);
    fireEvent.click(screen.getByRole('button', { name: t('retry') }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('renders a loaded zero', () => {
    card({ status: 'loaded', retainedAmount: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('0 ₸');
  });
});
