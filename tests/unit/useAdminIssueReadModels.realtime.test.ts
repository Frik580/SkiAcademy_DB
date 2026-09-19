import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIssueId, AdminIssueInboxItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();
const registerFinanceListenerMock = vi.fn();
const unregisterFinanceMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIssueReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/issues/subscribeAdminIssueInboxRevision', () => ({
  subscribeAdminIssueInboxRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/issues/adminIssueInboxRevisionCoordinator', () => ({
  registerAdminIssueInboxRevisionListener: (...args: unknown[]) => registerListenerMock(...args),
  registerAdminIssueInboxRevisionFromCommand: (...args: unknown[]) =>
    registerFromCommandMock(...args),
  resetAdminIssueInboxRevisionCoordinatorForTests: vi.fn(),
}));

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: (...args: unknown[]) =>
    registerFinanceListenerMock(...args),
  registerAdminFinanceRevisionFromCommand: vi.fn(),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
}));

import { notifyAdminIssueInboxServerConfirmedPatch } from '../../src/features/admin/issues/adminIssueInboxLocalSync';
import { useAdminIssueReadModels } from '../../src/features/admin/issues/useAdminIssueReadModels';
import { applyAdminIssueInboxCommandResult } from '../../src/features/admin/issues/adminIssueInboxLocalSync';
import { removeResolvedAdminIssueInboxItems } from '../../src/features/admin/issues/adminIssueInboxLocalSync';

function item(
  suffix: string,
  revision = 1,
  kind: AdminIssueInboxItem['kind'] = 'missing_attendance'
): AdminIssueInboxItem {
  return {
    issueId: `admin_issue_ui_${suffix}` as AdminIssueInboxItem['issueId'],
    revision,
    kind,
    severity: kind === 'attendance_payment_conflict' ? 'critical' : 'normal',
    lifecycle: {
      status: 'open',
      openedAt: { seconds: revision, nanoseconds: 0 },
      lastDetectedAt: { seconds: revision, nanoseconds: 0 },
    },
    subjectRef: {
      subjectKind: 'course_enrollment',
      enrollmentId: `course_enrollment_ui_${suffix}`,
    } as AdminIssueInboxItem['subjectRef'],
    summaryCode: kind,
    actionRequirement: 'action_required',
    blockingCondition: kind === 'attendance_payment_conflict' ? 'outcome_and_delivery' : 'outcome',
    createdAt: { seconds: revision, nanoseconds: 0 },
    updatedAt: { seconds: revision, nanoseconds: 0 },
  };
}

describe('useAdminIssueReadModels realtime invalidation', () => {
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

  it('removes a locally resolved issue after server-confirmed attendance success', async () => {
    const visible = item('missing');
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [visible],
      hasMore: false,
    });
    const { result } = renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => {
      expect(result.current.list.items).toHaveLength(1);
    });

    act(() => {
      applyAdminIssueInboxCommandResult({
        status: 'success',
        kind: 'record_booking_attendance',
        correlationId: 'correlation_admin_issue_local_01',
        payload: {
          resolvedAdminIssueIds: [visible.issueId],
          adminIssueInboxRevision: 11,
        },
      });
    });

    expect(result.current.list.items).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(registerFromCommandMock).toHaveBeenCalledWith(11);
  });

  it('does not suppress inbox refresh when the command opened a new issue', () => {
    applyAdminIssueInboxCommandResult({
      status: 'success',
      kind: 'record_booking_attendance',
      correlationId: 'correlation_admin_issue_opened_01',
      payload: {
        resolvedAdminIssueIds: [],
        openedAdminIssueIds: ['admin_issue_ui_opened' as AdminIssueId],
        adminIssueInboxRevision: 12,
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });

  it('keeps the issue visible when the attendance command fails', async () => {
    const visible = item('stays');
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [visible],
      hasMore: false,
    });
    const { result } = renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => {
      expect(result.current.list.items.map((entry) => entry.issueId)).toEqual([visible.issueId]);
    });
    act(() => {
      applyAdminIssueInboxCommandResult({
        status: 'error',
        kind: 'record_booking_attendance',
        correlationId: 'correlation_admin_issue_local_fail_01',
        error: {
          code: 'validation',
          message: 'The request is invalid.',
          retryable: false,
          correlationId: 'correlation_admin_issue_local_fail_01',
        },
      });
    });
    expect(result.current.list.items.map((entry) => entry.issueId)).toEqual([visible.issueId]);
    expect(removeResolvedAdminIssueInboxItems(result.current.list.items, [])).toEqual(
      result.current.list.items
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the mounted inbox after a later invalidation', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [item('open')],
      hasMore: false,
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ scope: 'admin_open' });
  });

  it('refreshes only the mounted issue detail after a finance revision', async () => {
    const selected = item('detail');
    queryMock.mockImplementation(async (input: { scope: string }) => {
      if (input.scope === 'admin_detail') {
        return { scope: 'admin_detail', item: selected };
      }
      return { scope: 'admin_open', items: [selected], hasMore: false };
    });
    let emitFinance: (() => void) | undefined;
    registerFinanceListenerMock.mockImplementation((listener: () => void) => {
      emitFinance = listener;
      return unregisterFinanceMock;
    });

    renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
        selectedIssueId: selected.issueId,
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
      issueId: selected.issueId,
    });
  });

  it('does not subscribe to finance revision without a mounted issue detail', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [],
      hasMore: false,
    });
    renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerFinanceListenerMock).not.toHaveBeenCalled();
  });

  it('unsubscribes the revision listener when AdminIssueCenter unmounts', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [],
      hasMore: false,
    });
    const { unmount } = renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while history is open', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_history',
      items: [],
      hasMore: false,
    });
    renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_history',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(registerListenerMock).not.toHaveBeenCalled();
    expect(registerFinanceListenerMock).not.toHaveBeenCalled();
  });
});

describe('notifyAdminIssueInboxServerConfirmedPatch', () => {
  it('is a no-op when there is no active inbox listener', () => {
    expect(() =>
      notifyAdminIssueInboxServerConfirmedPatch({
        resolvedAdminIssueIds: ['admin_issue_ui_missing' as AdminIssueInboxItem['issueId']],
        openedAdminIssueIds: [],
      })
    ).not.toThrow();
  });
});
