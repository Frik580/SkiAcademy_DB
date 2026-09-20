import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminBookingChangeRequestInboxItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryBookingChangeRequestReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/issues/subscribeAdminBookingChangeRequestsRevision', () => ({
  subscribeAdminBookingChangeRequestsRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/issues/adminBookingChangeRequestsRevisionCoordinator', () => ({
  registerAdminBookingChangeRequestsRevisionListener: (...args: unknown[]) =>
    registerListenerMock(...args),
  registerAdminBookingChangeRequestsRevisionFromCommand: (...args: unknown[]) =>
    registerFromCommandMock(...args),
  resetAdminBookingChangeRequestsRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminBookingChangeRequestsCommandResult } from '../../src/features/admin/issues/adminBookingChangeRequestsLocalSync';
import { useAdminAttentionChangeRequests } from '../../src/features/admin/issues/useAdminAttentionChangeRequests';

function inboxItem(id: string, revision = 1): AdminBookingChangeRequestInboxItem {
  return {
    requestId: id,
    revision,
    createdAt: { seconds: revision, nanoseconds: 0 },
  } as unknown as AdminBookingChangeRequestInboxItem;
}

describe('useAdminAttentionChangeRequests realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
  });

  it('does not refresh on mount beyond the initial query, then refreshes open requests once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [inboxItem('booking_change_request_realtime_01')],
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    const { result } = renderHook(() =>
      useAdminAttentionChangeRequests({ enabled: true })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(result.current.list.items).toHaveLength(1);

    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [
        inboxItem('booking_change_request_realtime_01'),
        inboxItem('booking_change_request_realtime_02'),
      ],
    });
    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ scope: 'admin_open' });
    await waitFor(() => expect(result.current.list.items).toHaveLength(2));
  });

  it('refreshes selected request detail after an external revision', async () => {
    const selectedId = 'booking_change_request_realtime_01' as AdminBookingChangeRequestInboxItem['requestId'];
    queryMock.mockImplementation(async (input: { scope: string; requestId?: string }) => {
      if (input.scope === 'admin_detail') {
        return { scope: 'admin_detail', item: inboxItem(selectedId, 2) };
      }
      return { scope: 'admin_open', items: [inboxItem(selectedId)] };
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminAttentionChangeRequests({
        enabled: true,
        selectedRequestId: selectedId,
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(4));
    expect(queryMock.mock.calls[2]?.[0]).toMatchObject({ scope: 'admin_open' });
    expect(queryMock.mock.calls[3]?.[0]).toMatchObject({
      scope: 'admin_detail',
      requestId: selectedId,
    });
  });

  it('unsubscribes when unmounted', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [],
    });
    const { unmount } = renderHook(() =>
      useAdminAttentionChangeRequests({ enabled: true })
    );
    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while the open inbox is disabled', async () => {
    renderHook(() => useAdminAttentionChangeRequests({ enabled: false }));
    expect(registerListenerMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminBookingChangeRequestsCommandResult({
      status: 'success',
      kind: 'resolve_booking_change_request',
      correlationId: 'correlation_admin_change_request_local_01',
      payload: { adminBookingChangeRequestsRevision: 11 },
    });
    expect(registerFromCommandMock).toHaveBeenCalledWith(11);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminBookingChangeRequestsCommandResult({
      status: 'error',
      kind: 'resolve_booking_change_request',
      correlationId: 'correlation_admin_change_request_local_fail_01',
      error: {
        code: 'validation',
        message: 'The request is invalid.',
        retryable: false,
        correlationId: 'correlation_admin_change_request_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });
});
