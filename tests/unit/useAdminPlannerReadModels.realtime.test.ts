import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPlannerReadModel } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminPlannerReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/operations/subscribeAdminPlannerRevision', () => ({
  subscribeAdminPlannerRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/operations/adminPlannerRevisionCoordinator', () => ({
  registerAdminPlannerRevisionListener: (...args: unknown[]) => registerListenerMock(...args),
  registerAdminPlannerRevisionFromCommand: (...args: unknown[]) => registerFromCommandMock(...args),
  resetAdminPlannerRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminPlannerCommandResult } from '../../src/features/admin/operations/adminPlannerLocalSync';
import { useAdminPlannerReadModels } from '../../src/features/admin/operations/useAdminPlannerReadModels';

function plannerItem(): AdminPlannerReadModel {
  return {
    view: 'week',
    localDate: '2026-09-21',
    timeZone: 'Asia/Almaty',
    window: {
      startsAt: { seconds: 1, nanoseconds: 0 },
      endsAt: { seconds: 2, nanoseconds: 0 },
    },
    instructors: [],
    occupancy: [],
    truncated: false,
  };
}

describe('useAdminPlannerReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
  });

  it('does not refresh on the initial revision snapshot, then refreshes the current view once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_planner',
      item: plannerItem(),
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminPlannerReadModels({
        enabled: true,
        localDate: '2026-09-21',
        view: 'week',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
      scope: 'admin_planner',
      localDate: '2026-09-21',
      view: 'week',
    });

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({
      scope: 'admin_planner',
      localDate: '2026-09-21',
      view: 'week',
    });
  });

  it('unsubscribes when the planner unmounts', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_planner',
      item: plannerItem(),
    });
    const { unmount } = renderHook(() =>
      useAdminPlannerReadModels({
        enabled: true,
        localDate: '2026-09-21',
        view: 'week',
      })
    );
    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while the planner is closed', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_planner',
      item: plannerItem(),
    });
    renderHook(() =>
      useAdminPlannerReadModels({
        enabled: false,
        localDate: '2026-09-21',
        view: 'week',
      })
    );
    await waitFor(() => expect(queryMock).not.toHaveBeenCalled());
    expect(registerListenerMock).not.toHaveBeenCalled();
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminPlannerCommandResult({
      status: 'success',
      kind: 'reschedule_booking',
      correlationId: 'correlation_admin_planner_local_01',
      payload: { adminPlannerRevision: 44 },
    });
    expect(registerFromCommandMock).toHaveBeenCalledWith(44);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminPlannerCommandResult({
      status: 'error',
      kind: 'reschedule_booking',
      correlationId: 'correlation_admin_planner_local_fail_01',
      error: {
        code: 'validation',
        message: 'The request is invalid.',
        retryable: false,
        correlationId: 'correlation_admin_planner_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });
});
