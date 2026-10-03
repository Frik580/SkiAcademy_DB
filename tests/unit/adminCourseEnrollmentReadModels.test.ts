import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCourseEnrollmentRosterItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const subscribeMock = vi.fn();
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../../src/features/admin/courses/subscribeAdminCoursesRevision', () => ({
  subscribeAdminCoursesRevision: (...args: unknown[]) => subscribeMock(...args),
}));
vi.mock('../../src/features/admin/finance/useAdminFinanceRevisionRefresh', () => ({
  useAdminFinanceRevisionRefresh: vi.fn(),
}));

import { useAdminCourseEnrollmentReadModels } from '../../src/features/admin/course-enrollments/useAdminCourseEnrollmentReadModels';
import { resetAdminCoursesRevisionCoordinatorForTests } from '../../src/features/admin/courses/adminCoursesRevisionCoordinator';

const guest = {
  enrollmentId: 'enrollment_admin_live_guest',
  revision: 1,
  guestState: 'pending_unlinked',
  lifecycleStatus: 'pending',
  updatedAt: { seconds: 1, nanoseconds: 0 },
} as AdminCourseEnrollmentRosterItem;

describe('admin guest course enrollment realtime reads', () => {
  let emitRevision: (revision: number) => void;
  beforeEach(() => {
    resetAdminCoursesRevisionCoordinatorForTests();
    queryMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation((callback: typeof emitRevision) => {
      emitRevision = callback;
      return vi.fn();
    });
  });
  afterEach(() => resetAdminCoursesRevisionCoordinatorForTests());

  it('refreshes an already loaded empty list when guest creation arrives in the first subscription snapshot', async () => {
    queryMock
      .mockResolvedValueOnce({ scope: 'admin_pending_guest', items: [], hasMore: false })
      .mockResolvedValue({ scope: 'admin_pending_guest', items: [guest], hasMore: false });
    const { result } = renderHook(() =>
      useAdminCourseEnrollmentReadModels({ view: 'pending_guest' })
    );
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.items).toEqual([]);
    await act(async () => emitRevision(1));
    await waitFor(() => expect(result.current.list.items).toEqual([guest]));
    expect(queryMock).toHaveBeenLastCalledWith({ scope: 'admin_pending_guest' });
    await act(async () => emitRevision(1));
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes the mounted list on creation and cancellation revisions without reload or duplicate rows', async () => {
    let items: AdminCourseEnrollmentRosterItem[] = [];
    queryMock.mockImplementation(async () => ({
      scope: 'admin_pending_guest',
      items,
      hasMore: false,
    }));
    const { result } = renderHook(() =>
      useAdminCourseEnrollmentReadModels({ view: 'pending_guest' })
    );
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    await act(async () => emitRevision(0));
    items = [guest];
    await act(async () => emitRevision(1));
    await waitFor(() => expect(result.current.list.items).toEqual([guest]));
    items = [];
    await act(async () => emitRevision(2));
    await waitFor(() => expect(result.current.list.items).toEqual([]));
    const calls = queryMock.mock.calls.length;
    await act(async () => emitRevision(2));
    expect(queryMock).toHaveBeenCalledTimes(calls);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });
});
