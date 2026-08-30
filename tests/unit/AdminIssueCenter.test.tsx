import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useReadModelsMock = vi.fn();
const retryListMock = vi.fn();

vi.mock('../../src/features/admin/issues/useAdminIssueReadModels', () => ({
  useAdminIssueReadModels: (...args: unknown[]) => useReadModelsMock(...args),
}));

vi.mock('../../src/features/admin/issues/useAdminIssueTranslations', () => ({
  useAdminIssueTranslations: () => ({
    language: 'en',
    t: (key: string) => key,
  }),
}));

import { AdminIssueCenter } from '../../src/features/admin/issues/AdminIssueCenter';

const issueId = 'admin_issue_component_conflict_01';
const commonItem = {
  issueId,
  revision: 3,
  kind: 'attendance_payment_conflict' as const,
  severity: 'critical' as const,
  lifecycle: {
    status: 'open' as const,
    openedAt: { seconds: 1, nanoseconds: 0 },
    lastDetectedAt: { seconds: 2, nanoseconds: 0 },
  },
  subjectRef: {
    subjectKind: 'course_enrollment' as const,
    enrollmentId: 'course_enrollment_component_01',
  },
  summaryCode: 'attendance_payment_conflict' as const,
  actionRequirement: 'action_required' as const,
  blockingCondition: 'outcome_and_delivery' as const,
  participantId: 'participant_component_01',
  createdAt: { seconds: 1, nanoseconds: 0 },
  updatedAt: { seconds: 2, nanoseconds: 0 },
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

describe('AdminIssueCenter', () => {
  beforeEach(() => {
    retryListMock.mockReset();
    useReadModelsMock.mockReset();
  });

  it('renders an empty canonical inbox state', () => {
    useReadModelsMock.mockReturnValue({
      list: {
        items: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
      },
      detail: { loading: false },
      retryList: retryListMock,
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
    });
    render(
      <MemoryRouter>
        <AdminIssueCenter />
      </MemoryRouter>
    );
    expect(screen.getByText('adminIssueEmptyOpen')).toBeInTheDocument();
  });

  it('renders attendance_payment_conflict context and deferred server actions', () => {
    useReadModelsMock.mockReturnValue({
      list: {
        items: [commonItem],
        loading: false,
        loadingMore: false,
        hasMore: false,
      },
      detail: {
        loading: false,
        item: {
          ...commonItem,
          subject: {
            availability: 'available',
            revision: 4,
            lifecycleStatus: 'confirmed',
            courseId: 'course_component_01',
          },
          participant: {
            participantId: 'participant_component_01',
            displayName: 'Safe Participant',
          },
          payment: {
            paymentId: 'payment_component_01',
            paymentStatus: 'partially_paid',
            revision: 5,
            price: 100_000,
            settledAmount: 30_000,
            outstandingAmount: 70_000,
          },
          attendance: [
            {
              attendanceId: 'attendance_component_01',
              attendanceStatus: 'present',
              revision: 2,
              participantId: 'participant_component_01',
              occurrenceId: 'occurrence_component_01',
              courseDayId: 'course_day_component_01',
              updatedAt: { seconds: 2, nanoseconds: 0 },
            },
          ],
          references: {
            participantId: 'participant_component_01',
            courseId: 'course_component_01',
            paymentId: 'payment_component_01',
            attendanceIds: ['attendance_component_01'],
          },
          resolutionGuidance: 'correct_finance',
          authorizedActions: {
            canResolveDirectly: false,
            actions: [
              {
                kind: 'correct_finance',
                availability: 'deferred',
                requiredRevisions: {
                  issueRevision: 3,
                  subjectRevision: 4,
                  paymentRevision: 5,
                  attendanceRevisions: [
                    {
                      attendanceId: 'attendance_component_01',
                      revision: 2,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      retryList: retryListMock,
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/admin?tab=operations&issue=${issueId}`]}>
        <AdminIssueCenter />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getAllByText('adminIssueKindAttendancePaymentConflict').length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('Safe Participant')).toBeInTheDocument();
    expect(screen.getByText(/partially_paid/)).toBeInTheDocument();
    expect(screen.getByText(/attendance_component_01/)).toBeInTheDocument();
    expect(screen.getByText('adminIssueActionsDeferred')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'adminIssueOpenPayment' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=finance');
    expect(screen.getByLabelText('location')).toHaveTextContent('payment=payment_component_01');
  });

  it('shows read failure and invokes retry', () => {
    useReadModelsMock.mockReturnValue({
      list: {
        items: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        error: 'read-failed',
      },
      detail: { loading: false },
      retryList: retryListMock,
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
    });
    render(
      <MemoryRouter>
        <AdminIssueCenter />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retryListMock).toHaveBeenCalledTimes(1);
  });
});
