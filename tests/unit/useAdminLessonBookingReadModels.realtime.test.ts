import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();
const registerFinanceListenerMock = vi.fn();
const unregisterFinanceMock = vi.fn();
const registerChangeRequestListenerMock = vi.fn();
const unregisterChangeRequestMock = vi.fn();

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

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: (...args: unknown[]) =>
    registerFinanceListenerMock(...args),
  registerAdminFinanceRevisionFromCommand: vi.fn(),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
}));

vi.mock('../../src/features/admin/issues/adminBookingChangeRequestsRevisionCoordinator', () => ({
  registerAdminBookingChangeRequestsRevisionListener: (...args: unknown[]) =>
    registerChangeRequestListenerMock(...args),
  registerAdminBookingChangeRequestsRevisionFromCommand: vi.fn(),
  resetAdminBookingChangeRequestsRevisionCoordinatorForTests: vi.fn(),
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
    registerFinanceListenerMock.mockReset();
    unregisterFinanceMock.mockReset();
    registerChangeRequestListenerMock.mockReset();
    unregisterChangeRequestMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
    registerFinanceListenerMock.mockImplementation(() => unregisterFinanceMock);
    registerChangeRequestListenerMock.mockImplementation(() => unregisterChangeRequestMock);
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

  it('refreshes only the mounted booking detail after a finance revision', async () => {
    const selectedId = 'booking_admin_realtime_01';
    queryMock.mockImplementation(async (input: { scope: string }) => {
      if (input.scope === 'admin_detail') {
        return { scope: 'admin_detail', items: [booking(selectedId, 2)] };
      }
      return { scope: 'admin_hot', items: [booking(selectedId, 1)], hasMore: false };
    });
    let emitFinance: (() => void) | undefined;
    registerFinanceListenerMock.mockImplementation((listener: () => void) => {
      emitFinance = listener;
      return unregisterFinanceMock;
    });

    renderHook(() =>
      useAdminLessonBookingReadModels({
        enabled: true,
        view: 'hot',
        selectedBookingId: selectedId as LessonBookingReadModel['bookingId'],
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(registerFinanceListenerMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitFinance?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(3));
    expect(queryMock.mock.calls[2]?.[0]).toMatchObject({
      scope: 'admin_detail',
      bookingId: selectedId,
    });
  });

  it('does not subscribe to finance or change-request revision without a mounted booking detail', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_hot',
      items: [],
      hasMore: false,
    });
    renderHook(() => useAdminLessonBookingReadModels({ enabled: true, view: 'hot' }));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerFinanceListenerMock).not.toHaveBeenCalled();
    expect(registerChangeRequestListenerMock).not.toHaveBeenCalled();
  });

  it('refreshes only the mounted booking detail after a change-request revision', async () => {
    const selectedId = 'booking_admin_realtime_01';
    queryMock.mockImplementation(async (input: { scope: string }) => {
      if (input.scope === 'admin_detail') {
        return { scope: 'admin_detail', items: [booking(selectedId, 2)] };
      }
      return { scope: 'admin_hot', items: [booking(selectedId, 1)], hasMore: false };
    });
    let emitChangeRequest: (() => void) | undefined;
    registerChangeRequestListenerMock.mockImplementation((listener: () => void) => {
      emitChangeRequest = listener;
      return unregisterChangeRequestMock;
    });

    renderHook(() =>
      useAdminLessonBookingReadModels({
        enabled: true,
        view: 'hot',
        selectedBookingId: selectedId as LessonBookingReadModel['bookingId'],
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(registerChangeRequestListenerMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitChangeRequest?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(3));
    expect(queryMock.mock.calls[2]?.[0]).toMatchObject({
      scope: 'admin_detail',
      bookingId: selectedId,
    });
  });
});
