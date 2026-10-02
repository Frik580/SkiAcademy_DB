import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCourseEnrollmentRosterItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();
const registerFinanceListenerMock = vi.fn();
const unregisterFinanceMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/courses/subscribeAdminCoursesRevision', () => ({
  subscribeAdminCoursesRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/courses/adminCoursesRevisionCoordinator', () => ({
  registerAdminCoursesRevisionListener: (...args: unknown[]) => registerListenerMock(...args),
  registerAdminCoursesRevisionFromCommand: (...args: unknown[]) => registerFromCommandMock(...args),
  resetAdminCoursesRevisionCoordinatorForTests: vi.fn(),
}));

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: (...args: unknown[]) =>
    registerFinanceListenerMock(...args),
  registerAdminFinanceRevisionFromCommand: vi.fn(),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminCoursesCommandResult } from '../../src/features/admin/courses/adminCoursesLocalSync';
import { useAdminCourseEnrollmentReadModels } from '../../src/features/admin/course-enrollments/useAdminCourseEnrollmentReadModels';

function enrollment(id: string, updatedAtSeconds = 1): AdminCourseEnrollmentRosterItem {
  return {
    enrollmentId: id,
    revision: 1,
    updatedAt: { seconds: updatedAtSeconds, nanoseconds: 0 },
  } as unknown as AdminCourseEnrollmentRosterItem;
}

type EnrollmentPage = {
  scope: 'admin_course_roster';
  items: AdminCourseEnrollmentRosterItem[];
  hasMore: boolean;
  nextCursor?: string;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useAdminCourseEnrollmentReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerFinanceListenerMock.mockReset();
    unregisterFinanceMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
    registerFinanceListenerMock.mockImplementation(() => unregisterFinanceMock);
  });

  it('does not refresh on the initial revision snapshot, then refreshes the active scope once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [enrollment('course_enrollment_admin_realtime_01')],
      hasMore: false,
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
  await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({ scope: 'admin_course_roster' });

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ scope: 'admin_course_roster' });
  });

  it('refreshes only the loaded pages and follows the refreshed cursor after invalidation', async () => {
    let firstPageCalls = 0;
    queryMock.mockImplementation(async (input: { cursor?: string }) => {
      if (!input.cursor) {
        firstPageCalls += 1;
        return {
          scope: 'admin_course_roster',
          items: [
            enrollment(
              firstPageCalls === 1
                ? 'course_enrollment_admin_page_01'
                : 'course_enrollment_admin_inserted_front',
              firstPageCalls === 1 ? 2 : 3
            ),
          ],
          hasMore: true,
          nextCursor: firstPageCalls === 1 ? 'cursor_initial_page_1' : 'cursor_refreshed_page_1',
        };
      }
      if (input.cursor === 'cursor_initial_page_1') {
        return {
          scope: 'admin_course_roster',
          items: [enrollment('course_enrollment_admin_page_02')],
          hasMore: true,
          nextCursor: 'cursor_initial_page_2',
        };
      }
      if (input.cursor === 'cursor_initial_page_2') {
        return {
          scope: 'admin_course_roster',
          items: [enrollment('course_enrollment_admin_page_03')],
          hasMore: true,
          nextCursor: 'cursor_initial_page_3',
        };
      }
      if (input.cursor === 'cursor_refreshed_page_1') {
        return {
          scope: 'admin_course_roster',
          items: [enrollment('course_enrollment_admin_page_01', 2)],
          hasMore: true,
          nextCursor: 'cursor_refreshed_page_2',
        };
      }
      expect(input.cursor).toBe('cursor_refreshed_page_2');
      return {
        scope: 'admin_course_roster',
        items: [enrollment('course_enrollment_admin_page_02')],
        hasMore: false,
      };
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    const { result } = renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
  await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
  await waitFor(() => {
    expect(result.current.list.items).toHaveLength(1);
    expect(result.current.list.hasMore).toBe(true);
    expect(result.current.list.cursor).toBe('cursor_initial_page_1');
    expect(result.current.loadMore).toBeDefined();
  });

  await act(async () => {
    await result.current.loadMore?.();
  });

  await waitFor(() => {
    expect(result.current.list.items).toHaveLength(2);
    expect(result.current.list.cursor).toBe('cursor_initial_page_2');
  });
    await act(async () => {
      await result.current.loadMore?.();
    });

  await waitFor(() => {
    expect(result.current.list.items).toHaveLength(3);
    expect(result.current.list.cursor).toBe('cursor_initial_page_3');
  });
    expect(result.current.list.items).toHaveLength(3);
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cursor_initial_page_1' });
    expect(queryMock.mock.calls[2]?.[0]).toMatchObject({ cursor: 'cursor_initial_page_2' });

    act(() => {
      emitInvalidation?.();
    });

    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(6));

  await waitFor(() => {
    expect(queryMock.mock.calls[3]?.[0]).toMatchObject({ scope: 'admin_course_roster' });
    expect(queryMock.mock.calls[4]?.[0]).toMatchObject({
      scope: 'admin_course_roster',
      cursor: 'cursor_refreshed_page_1',
    });
    expect(queryMock.mock.calls[5]?.[0]).toMatchObject({
      scope: 'admin_course_roster',
      cursor: 'cursor_refreshed_page_2',
    });
    expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
      'course_enrollment_admin_inserted_front',
      'course_enrollment_admin_page_01',
      'course_enrollment_admin_page_02',
    ]);
    expect(new Set(result.current.list.items.map((item) => item.enrollmentId)).size).toBe(3);
    expect(result.current.list.hasMore).toBe(false);
    expect(result.current.list.cursor).toBeUndefined();
  });
  });

  it('lets realtime refresh supersede an in-flight load-more request', async () => {
    const pendingPage = deferred<EnrollmentPage>();
    let firstPageCalls = 0;
    queryMock.mockImplementation((input: { cursor?: string }) => {
      if (input.cursor) return pendingPage.promise;
      firstPageCalls += 1;
      return Promise.resolve({
        scope: 'admin_course_roster',
        items: [
          enrollment(
            firstPageCalls === 1
              ? 'course_enrollment_admin_before_refresh'
              : 'course_enrollment_admin_after_refresh'
          ),
        ],
        hasMore: true,
        nextCursor: firstPageCalls === 1 ? 'cursor_initial_page_1' : 'cursor_refreshed_page_1',
      });
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    const { result } = renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    let loadMoreRequest: Promise<void> | undefined;
    act(() => {
      loadMoreRequest = result.current.loadMore?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));

    act(() => emitInvalidation?.());
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
        'course_enrollment_admin_after_refresh',
      ])
    );

    await act(async () => {
      pendingPage.resolve({
        scope: 'admin_course_roster',
        items: [enrollment('course_enrollment_admin_stale_load_more')],
        hasMore: false,
      });
      await loadMoreRequest;
    });

    expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
      'course_enrollment_admin_after_refresh',
    ]);
    expect(result.current.list.hasMore).toBe(true);
    expect(result.current.list.cursor).toBe('cursor_refreshed_page_1');
  });

  it('removes a row that leaves the active scope and fills the refreshed page range', async () => {
    let firstPageCalls = 0;
    queryMock.mockImplementation(async (input: { cursor?: string }) => {
      if (!input.cursor) {
        firstPageCalls += 1;
        return firstPageCalls === 1
          ? {
              scope: 'admin_course_roster',
              items: [
                enrollment('course_enrollment_admin_leaves_roster', 5),
                enrollment('course_enrollment_admin_scope_row_02', 4),
              ],
              hasMore: true,
              nextCursor: 'cursor_initial_page_1',
            }
          : {
              scope: 'admin_course_roster',
              items: [
                enrollment('course_enrollment_admin_scope_row_02', 4),
                enrollment('course_enrollment_admin_scope_row_03', 3),
              ],
              hasMore: true,
              nextCursor: 'cursor_refreshed_page_1',
            };
      }
      if (input.cursor === 'cursor_initial_page_1') {
        return {
          scope: 'admin_course_roster',
          items: [
            enrollment('course_enrollment_admin_scope_row_03', 3),
            enrollment('course_enrollment_admin_scope_row_04', 2),
          ],
          hasMore: true,
          nextCursor: 'cursor_initial_page_2',
        };
      }
      expect(input.cursor).toBe('cursor_refreshed_page_1');
      return {
        scope: 'admin_course_roster',
        items: [
          enrollment('course_enrollment_admin_scope_row_04', 2),
          enrollment('course_enrollment_admin_scope_row_05', 1),
        ],
        hasMore: true,
        nextCursor: 'cursor_refreshed_page_2',
      };
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    const { result } = renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.loadMore?.();
    });
  await waitFor(() => {
    expect(result.current.list.items).toHaveLength(4);
  });

    act(() => emitInvalidation?.());
  await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(4));

  await waitFor(() => {
    expect(
      result.current.list.items.map((item) => item.enrollmentId)
    ).toEqual([
      'course_enrollment_admin_scope_row_02',
      'course_enrollment_admin_scope_row_03',
      'course_enrollment_admin_scope_row_04',
      'course_enrollment_admin_scope_row_05',
    ]);

    expect(
      result.current.list.items.map((item) => item.enrollmentId)
    ).not.toContain('course_enrollment_admin_leaves_roster');

    expect(
      new Set(
        result.current.list.items.map((item) => item.enrollmentId)
      ).size
    ).toBe(4);

    expect(result.current.list.cursor).toBe(
      'cursor_refreshed_page_2'
    );
  });

    expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
      'course_enrollment_admin_scope_row_02',
      'course_enrollment_admin_scope_row_03',
      'course_enrollment_admin_scope_row_04',
      'course_enrollment_admin_scope_row_05',
    ]);
    expect(result.current.list.items.map((item) => item.enrollmentId)).not.toContain(
      'course_enrollment_admin_leaves_roster'
    );
    expect(new Set(result.current.list.items.map((item) => item.enrollmentId)).size).toBe(4);
    expect(result.current.list.cursor).toBe('cursor_refreshed_page_2');
  });

  it('ignores an older realtime refresh when a newer revision resolves first', async () => {
    const olderRefresh = deferred<EnrollmentPage>();
    let firstPageCalls = 0;
    queryMock.mockImplementation((input: { cursor?: string }) => {
      expect(input.cursor).toBeUndefined();
      firstPageCalls += 1;
      if (firstPageCalls === 1) {
        return Promise.resolve({
          scope: 'admin_course_roster',
          items: [enrollment('course_enrollment_admin_initial')],
          hasMore: false,
        });
      }
      if (firstPageCalls === 2) return olderRefresh.promise;
      return Promise.resolve({
        scope: 'admin_course_roster',
        items: [enrollment('course_enrollment_admin_latest_refresh')],
        hasMore: false,
      });
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    const { result } = renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    act(() => emitInvalidation?.());
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    act(() => emitInvalidation?.());
    await waitFor(() =>
      expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
        'course_enrollment_admin_latest_refresh',
      ])
    );

    await act(async () => {
      olderRefresh.resolve({
        scope: 'admin_course_roster',
        items: [enrollment('course_enrollment_admin_stale_refresh')],
        hasMore: false,
      });
      await olderRefresh.promise;
    });

    expect(result.current.list.items.map((item) => item.enrollmentId)).toEqual([
      'course_enrollment_admin_latest_refresh',
    ]);
  });

  it('unsubscribes when unmounted', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_pending_guest',
      items: [],
      hasMore: false,
    });
    const { unmount } = renderHook(() =>
      useAdminCourseEnrollmentReadModels({ view: 'pending_guest' })
    );
    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe for history view', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_history',
      items: [],
      hasMore: false,
    });
    renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'history' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerListenerMock).not.toHaveBeenCalled();
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminCoursesCommandResult({
      status: 'success',
      kind: 'confirm_guest_course_enrollment',
      correlationId: 'correlation_admin_courses_local_01',
      payload: { adminCoursesRevision: 42 },
    });
    expect(registerFromCommandMock).toHaveBeenCalledWith(42);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminCoursesCommandResult({
      status: 'error',
      kind: 'confirm_guest_course_enrollment',
      correlationId: 'correlation_admin_courses_local_fail_01',
      error: {
        code: 'validation',
        message: 'The request is invalid.',
        retryable: false,
        correlationId: 'correlation_admin_courses_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });

  it('refreshes only the mounted enrollment detail after a finance revision', async () => {
    const selectedId = 'course_enrollment_admin_realtime_01';
    queryMock.mockImplementation(async (input: { scope: string; enrollmentId?: string }) => {
      if (input.scope === 'admin_enrollment_detail') {
        return { scope: 'admin_enrollment_detail', item: enrollment(selectedId) };
      }
      return { scope: 'admin_course_roster', items: [enrollment(selectedId)], hasMore: false };
    });
    let emitFinance: (() => void) | undefined;
    registerFinanceListenerMock.mockImplementation((listener: () => void) => {
      emitFinance = listener;
      return unregisterFinanceMock;
    });

    renderHook(() =>
      useAdminCourseEnrollmentReadModels({
        view: 'roster',
        selectedEnrollmentId: selectedId as AdminCourseEnrollmentRosterItem['enrollmentId'],
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(registerFinanceListenerMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitFinance?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(3));
    expect(queryMock.mock.calls[2]?.[0]).toMatchObject({
      scope: 'admin_enrollment_detail',
      enrollmentId: selectedId,
    });
  });

  it('does not subscribe to finance revision without a mounted enrollment detail', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [],
      hasMore: false,
    });
    renderHook(() => useAdminCourseEnrollmentReadModels({ view: 'roster' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerFinanceListenerMock).not.toHaveBeenCalled();
  });
});
