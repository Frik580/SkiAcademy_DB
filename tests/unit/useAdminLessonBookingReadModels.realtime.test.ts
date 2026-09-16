import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/lesson-bookings/subscribeAdminLessonBookingsRevision', () => ({
  subscribeAdminLessonBookingsRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/lesson-bookings/adminLessonBookingsRevisionCoordinator', () => ({
  registerAdminLessonBookingsRevisionListener: (...args: unknown[]) =>
    registerListenerMock(...args),
  registerAdminLessonBookingsRevisionFromCommand: (...args: unknown[]) =>
    registerFromCommandMock(...args),
  resetAdminLessonBookingsRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminLessonBookingsCommandResult } from '../../src/features/admin/lesson-bookings/adminLessonBookingsLocalSync';
import { useAdminLessonBookingReadModels } from '../../src/features/admin/lesson-bookings/useAdminLessonBookingReadModels';

function booking(id: string, revision: number): LessonBookingReadModel {
  return {
    bookingId: id,
    revision,
    updatedAt: { seconds: revision, nanoseconds: 0 },
  } as unknown as LessonBookingReadModel;
}

describe('useAdminLessonBookingReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
  });

  it('does not refresh on the initial revision snapshot, then refreshes once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_hot',
      items: [booking('booking_admin_realtime_01', 1)],
      hasMore: false,
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() => useAdminLessonBookingReadModels({ enabled: true, view: 'hot' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ scope: 'admin_hot' });
  });

  it('unsubscribes when unmounted', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_pending_guest',
      items: [],
      hasMore: false,
    });
    const { unmount } = renderHook(() =>
      useAdminLessonBookingReadModels({ enabled: true, view: 'pending_guest' })
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
    renderHook(() => useAdminLessonBookingReadModels({ enabled: true, view: 'history' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerListenerMock).not.toHaveBeenCalled();
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminLessonBookingsCommandResult({
      status: 'success',
      kind: 'resolve_booking_cancellation',
      correlationId: 'correlation_admin_lesson_local_01',
      payload: { lifecycleStatus: 'cancelled', adminLessonBookingsRevision: 11 },
    });
    expect(registerFromCommandMock).toHaveBeenCalledWith(11);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminLessonBookingsCommandResult({
      status: 'error',
      kind: 'resolve_booking_cancellation',
      correlationId: 'correlation_admin_lesson_local_fail_01',
      error: {
        code: 'validation',
        message: 'The request is invalid.',
        retryable: false,
        correlationId: 'correlation_admin_lesson_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });
});
