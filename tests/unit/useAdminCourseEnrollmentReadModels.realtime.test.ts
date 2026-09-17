import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCourseEnrollmentRosterItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

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

import { applyAdminCoursesCommandResult } from '../../src/features/admin/courses/adminCoursesLocalSync';
import { useAdminCourseEnrollmentReadModels } from '../../src/features/admin/course-enrollments/useAdminCourseEnrollmentReadModels';

function enrollment(id: string): AdminCourseEnrollmentRosterItem {
  return {
    enrollmentId: id,
    revision: 1,
    updatedAt: { seconds: 1, nanoseconds: 0 },
  } as unknown as AdminCourseEnrollmentRosterItem;
}

describe('useAdminCourseEnrollmentReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
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
});
