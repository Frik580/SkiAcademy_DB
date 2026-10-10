import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountCourseSessionStore } from '../../src/features/course-enrollments/accountCourseSessionStore';
import {
  refreshAccountCourseSessions,
  useAccountCourseSessionSync,
} from '../../src/features/course-enrollments/useAccountCourseSessionSync';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: query,
}));
vi.mock('../../src/features/course-enrollments/courseEnrollmentViewModel', () => ({
  mergeCourseEnrollmentRecords: (
    items: Map<string, unknown>,
    page: { items: { enrollmentId: string }[] }
  ) => new Map([...items, ...page.items.map((item) => [item.enrollmentId, item] as const)]),
}));
const page = (ids: string[], hasMore = false, nextCursor?: string) => ({
  scope: 'account_hot',
  items: ids.map((enrollmentId) => ({ enrollmentId })),
  hasMore,
  nextCursor,
});

describe('account course session read ownership', () => {
  beforeEach(() => {
    useAccountCourseSessionStore.getState().reset();
    query.mockReset();
    query.mockResolvedValue(page([]));
  });
  afterEach(cleanup);

  it('drains hot pages, deduplicates enrollment IDs and never selects a participant', async () => {
    useAccountCourseSessionStore.getState().reset('account_a');
    query.mockResolvedValueOnce(page(['enrollment_a'], true, 'cursor_a'));
    query.mockResolvedValueOnce(page(['enrollment_a', 'enrollment_b']));
    await refreshAccountCourseSessions();
    expect(query.mock.calls).toEqual([
      [{ scope: 'account_hot' }],
      [{ scope: 'account_hot', cursor: 'cursor_a' }],
    ]);
    expect(useAccountCourseSessionStore.getState().items.map((item) => item.enrollmentId)).toEqual([
      'enrollment_a',
      'enrollment_b',
    ]);
  });

  it('keeps the account source stable across participant rerenders and clears on exit', async () => {
    query.mockResolvedValue(page(['enrollment_a']));
    const hook = renderHook(
      ({ participant }) => {
        useAccountCourseSessionSync(true, 'account_a');
        return participant;
      },
      { initialProps: { participant: 'a' } }
    );
    await waitFor(() => expect(useAccountCourseSessionStore.getState().items).toHaveLength(1));
    hook.rerender({ participant: 'b' });
    hook.rerender({ participant: 'a' });
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => hook.unmount());
    expect(useAccountCourseSessionStore.getState().items).toHaveLength(0);
  });

  it('discards a late response after logout or a new account generation', async () => {
    let resolve!: (result: ReturnType<typeof page>) => void;
    query.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    useAccountCourseSessionStore.getState().reset('account_a');
    const old = refreshAccountCourseSessions();
    useAccountCourseSessionStore.getState().reset('account_b');
    await refreshAccountCourseSessions();
    resolve(page(['account_a_private']));
    await old;
    expect(useAccountCourseSessionStore.getState().accountId).toBe('account_b');
    expect(useAccountCourseSessionStore.getState().items).toEqual([]);
  });

  it('refreshes after an in-flight pre-command read and removes cancelled enrollments', async () => {
    let resolve!: (result: ReturnType<typeof page>) => void;
    query.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    useAccountCourseSessionStore.getState().reset('account_a');
    const initial = refreshAccountCourseSessions();
    expect(refreshAccountCourseSessions()).toBe(initial);
    const command = refreshAccountCourseSessions(true);
    resolve(page(['cancelled_enrollment']));
    await command;
    expect(query).toHaveBeenCalledTimes(2);
    expect(useAccountCourseSessionStore.getState().items).toEqual([]);
  });

  it('rejects malformed pagination and preserves the previous complete snapshot', async () => {
    useAccountCourseSessionStore.getState().reset('account_a');
    query.mockResolvedValueOnce(page(['valid']));
    await refreshAccountCourseSessions();
    query.mockResolvedValue(page(['partial'], true, 'repeated'));
    await expect(refreshAccountCourseSessions()).rejects.toThrow('pagination did not advance');
    expect(useAccountCourseSessionStore.getState().items.map((item) => item.enrollmentId)).toEqual([
      'valid',
    ]);
    expect(useAccountCourseSessionStore.getState().error).toContain('pagination');
  });

  it('does not query when disabled and invalidates pending reads on account change', async () => {
    const hook = renderHook(
      ({ enabled, accountId }) => useAccountCourseSessionSync(enabled, accountId),
      {
        initialProps: { enabled: false, accountId: 'account_a' },
      }
    );
    expect(query).not.toHaveBeenCalled();
    await act(async () => hook.rerender({ enabled: true, accountId: 'account_b' }));
    expect(query).toHaveBeenCalledTimes(1);
    expect(useAccountCourseSessionStore.getState().accountId).toBe('account_b');
  });

  it('records a failed entry load and clears the error after an explicit retry', async () => {
    useAccountCourseSessionStore.getState().reset('account_a');
    query.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(refreshAccountCourseSessions()).rejects.toThrow('Network unavailable');
    expect(useAccountCourseSessionStore.getState().error).toBe('Network unavailable');
    query.mockResolvedValueOnce(page(['recovered']));
    await refreshAccountCourseSessions();
    expect(useAccountCourseSessionStore.getState().error).toBeUndefined();
    expect(useAccountCourseSessionStore.getState().items).toHaveLength(1);
  });

  it('reloads on a new authentication generation even if the account ID is unchanged', async () => {
    const hook = renderHook(
      ({ generation }) => useAccountCourseSessionSync(true, 'account_a', generation),
      {
        initialProps: { generation: 1 },
      }
    );
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    await act(async () => hook.rerender({ generation: 3 }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(useAccountCourseSessionStore.getState().accountId).toBe('account_a');
  });

  it('shares one query through StrictMode effect replay and clears on actual unmount', async () => {
    query.mockResolvedValueOnce(page(['valid']));
    const hook = renderHook(() => useAccountCourseSessionSync(true, 'account_a'), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(useAccountCourseSessionStore.getState().items).toHaveLength(1));
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => hook.unmount());
    expect(useAccountCourseSessionStore.getState().accountId).toBeUndefined();
    expect(useAccountCourseSessionStore.getState().items).toEqual([]);
  });
});
