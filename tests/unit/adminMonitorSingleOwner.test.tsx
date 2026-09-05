import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryLessonBookingReadModelsMock = vi.fn();
const queryAdminCourseEnrollmentReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModelsMock(...args),
}));

vi.mock('../../src/features/admin/components/finance/useAdminFinanceReadModels', () => ({
  useAdminFinancialOverviewReadModel: () => ({
    item: undefined,
    loading: false,
    error: undefined,
  }),
}));

vi.mock('../../src/features/admin/components/finance/FinancialOverview', () => ({
  FinancialOverview: () => <div data-testid="financial-overview" />,
}));

vi.mock('../../src/features/admin/operations/AdminOperationalMetrics', () => ({
  AdminOperationalMetrics: () => <div data-testid="operational-metrics" />,
}));

vi.mock('../../src/features/admin/components/bookings/BookingsLog', () => ({
  BookingsLog: () => <div data-testid="bookings-log" />,
}));

import {
  AdminMonitorReadModelsProvider,
  useSharedAdminMonitorReadModels,
} from '../../src/features/admin/operations/AdminMonitorReadModelsContext';
import { AdminOperationalMetricsHost } from '../../src/features/admin/operations/AdminOperationalMetricsHost';
import { AdminActiveBookingMonitor } from '../../src/features/admin/operations/AdminActiveBookingMonitor';

function emptyLessonResult(scope: 'admin_hot' | 'admin_history') {
  return { scope, items: [], hasMore: false };
}

function emptyEnrollmentResult(
  scope: 'admin_course_roster' | 'admin_pending_guest' | 'admin_history'
) {
  return { scope, items: [], hasMore: false };
}

function RefreshProbe({ onReady }: { onReady: (refreshAll: () => Promise<void>) => void }) {
  const { refreshAll } = useSharedAdminMonitorReadModels();
  React.useEffect(() => {
    onReady(refreshAll);
  }, [onReady, refreshAll]);
  return null;
}

describe('Admin monitor single owner', () => {
  beforeEach(() => {
    queryLessonBookingReadModelsMock.mockReset();
    queryAdminCourseEnrollmentReadModelsMock.mockReset();
    queryLessonBookingReadModelsMock.mockImplementation(async (input: { scope: string }) =>
      emptyLessonResult(input.scope as 'admin_hot' | 'admin_history')
    );
    queryAdminCourseEnrollmentReadModelsMock.mockImplementation(async (input: { scope: string }) =>
      emptyEnrollmentResult(
        input.scope as 'admin_course_roster' | 'admin_pending_guest' | 'admin_history'
      )
    );
  });

  it('invokes each monitor scope once when Operations metrics and monitor both mount', async () => {
    render(
      <MemoryRouter>
        <AdminMonitorReadModelsProvider>
          <AdminOperationalMetricsHost instructorsCount={3} />
          <AdminActiveBookingMonitor usersList={[]} instructors={[]} />
        </AdminMonitorReadModelsProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalled();
      expect(queryAdminCourseEnrollmentReadModelsMock).toHaveBeenCalled();
    });

    const lessonScopes = queryLessonBookingReadModelsMock.mock.calls.map(
      (call) => (call[0] as { scope: string }).scope
    );
    const enrollmentScopes = queryAdminCourseEnrollmentReadModelsMock.mock.calls.map(
      (call) => (call[0] as { scope: string }).scope
    );

    expect(lessonScopes.sort()).toEqual(['admin_history', 'admin_hot']);
    expect(enrollmentScopes.sort()).toEqual([
      'admin_course_roster',
      'admin_history',
      'admin_pending_guest',
    ]);
    expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
    expect(queryAdminCourseEnrollmentReadModelsMock).toHaveBeenCalledTimes(3);
    expect(
      queryLessonBookingReadModelsMock.mock.calls.length +
        queryAdminCourseEnrollmentReadModelsMock.mock.calls.length
    ).toBe(5);
  });

  it('shared refresh issues one new monitor set, not two', async () => {
    let refreshAll: (() => Promise<void>) | undefined;
    render(
      <MemoryRouter>
        <AdminMonitorReadModelsProvider>
          <AdminOperationalMetricsHost instructorsCount={1} />
          <AdminActiveBookingMonitor usersList={[]} instructors={[]} />
          <RefreshProbe
            onReady={(fn) => {
              refreshAll = fn;
            }}
          />
        </AdminMonitorReadModelsProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        queryLessonBookingReadModelsMock.mock.calls.length +
          queryAdminCourseEnrollmentReadModelsMock.mock.calls.length
      ).toBe(5);
      expect(refreshAll).toBeTypeOf('function');
    });

    queryLessonBookingReadModelsMock.mockClear();
    queryAdminCourseEnrollmentReadModelsMock.mockClear();

    await act(async () => {
      await refreshAll?.();
    });

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledTimes(2);
      expect(queryAdminCourseEnrollmentReadModelsMock).toHaveBeenCalledTimes(3);
    });
  });
});
