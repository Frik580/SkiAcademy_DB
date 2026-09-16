import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIssueInboxItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const subscribeRevisionMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIssueReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/issues/subscribeAdminIssueInboxRevision', () => ({
  subscribeAdminIssueInboxRevision: (...args: unknown[]) => subscribeRevisionMock(...args),
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
    subscribeRevisionMock.mockReset();
    unsubscribeMock.mockReset();
    subscribeRevisionMock.mockImplementation(() => unsubscribeMock);
  });

  it('removes a locally resolved issue after server-confirmed attendance success', async () => {
    const visible = item('missing');
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [visible],
      hasMore: false,
    });
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeRevisionMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
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
      emitRevision?.(10);
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

    act(() => {
      emitRevision?.(11);
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
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

  it('does not refresh on the initial revision snapshot, then refreshes once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_open',
      items: [item('open')],
      hasMore: false,
    });
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeRevisionMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });

    renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));

    act(() => {
      emitRevision?.(10);
    });
    expect(queryMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitRevision?.(10);
    });
    expect(queryMock).toHaveBeenCalledTimes(1);

    act(() => {
      emitRevision?.(11);
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({ scope: 'admin_open' });
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
    await waitFor(() => expect(subscribeRevisionMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
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
    expect(subscribeRevisionMock).not.toHaveBeenCalled();
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
