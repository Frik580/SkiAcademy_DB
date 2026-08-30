import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIssueInboxItem } from '@ski-academy/shared-domain';

const queryMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIssueReadModels: (...args: unknown[]) => queryMock(...args),
}));

import { useAdminIssueReadModels } from '../../src/features/admin/issues/useAdminIssueReadModels';

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

describe('useAdminIssueReadModels', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('represents an empty inbox and retries a failed read', async () => {
    queryMock.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValueOnce({
      scope: 'admin_open',
      items: [],
      hasMore: false,
    });

    const { result } = renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );

    await waitFor(() => {
      expect(result.current.list.error).toBe('read-failed');
    });
    await act(async () => {
      await result.current.retryList();
    });
    expect(result.current.list).toMatchObject({
      items: [],
      loading: false,
      hasMore: false,
    });
    expect(result.current.list.error).toBeUndefined();
  });

  it('classifies canonical permission denial separately', async () => {
    queryMock.mockRejectedValueOnce({
      code: 'functions/permission-denied',
    });
    const { result } = renderHook(() =>
      useAdminIssueReadModels({
        enabled: true,
        scope: 'admin_open',
      })
    );
    await waitFor(() => {
      expect(result.current.list.error).toBe('permission-denied');
    });
  });

  it('prevents an obsolete response from replacing a newer filtered query', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    queryMock
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({
        scope: 'admin_open',
        items: [item('new', 2, 'attendance_payment_conflict')],
        hasMore: false,
      });

    const { result, rerender } = renderHook(
      ({ severity }: { severity?: 'critical' }) =>
        useAdminIssueReadModels({
          enabled: true,
          scope: 'admin_open',
          ...(severity ? { severity } : {}),
        }),
      { initialProps: { severity: undefined as 'critical' | undefined } }
    );
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));

    rerender({ severity: 'critical' });
    await waitFor(() => {
      expect(result.current.list.items[0]?.issueId).toBe('admin_issue_ui_new');
    });

    await act(async () => {
      resolveFirst({
        scope: 'admin_open',
        items: [item('obsolete')],
        hasMore: false,
      });
      await Promise.resolve();
    });
    expect(result.current.list.items.map((entry) => entry.issueId)).toEqual(['admin_issue_ui_new']);
  });
});
