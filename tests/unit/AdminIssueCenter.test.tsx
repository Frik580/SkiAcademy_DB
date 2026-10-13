import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useReadModelsMock = vi.fn();
const useAttentionMock = vi.fn();
const retryListMock = vi.fn();
const attendanceMock = vi.fn();

vi.mock('../../src/features/admin/issues/useAdminIssueAttendance', () => ({
  useAdminIssueAttendance: (...args: unknown[]) => attendanceMock(...args),
}));

vi.mock('../../src/features/admin/issues/useAdminIssueReadModels', () => ({
  useAdminIssueReadModels: (...args: unknown[]) => useReadModelsMock(...args),
}));

vi.mock('../../src/features/admin/issues/useAdminAttentionChangeRequests', () => ({
  useAdminAttentionChangeRequests: (...args: unknown[]) => useAttentionMock(...args),
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
  subjectDisplayName: 'Safe Participant',
  lessonStartsAt: { seconds: 1_788_250_000, nanoseconds: 0 },
  lessonEndsAt: { seconds: 1_788_253_600, nanoseconds: 0 },
  lessonTimeZone: 'Asia/Almaty',
  courseTitle: 'Alpine Foundations',
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
    useAttentionMock.mockReset();
    attendanceMock.mockReset().mockReturnValue({ loading: false, pending: false, submit: vi.fn() });
    useAttentionMock.mockReturnValue({
      list: { items: [], loading: false },
      detail: { loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
    });
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
        <AdminIssueCenter adminAccountId="admin_account_01" />
      </MemoryRouter>
    );
    expect(screen.getByText('adminAttentionEmptyOpen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'adminIssueActionable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'adminIssueResolved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Все' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByText('adminIssueViewAll')).not.toBeInTheDocument();
    expect(screen.queryByText('adminIssueCategoryGuest')).not.toBeInTheDocument();
  });

  it.each([
    ['open', 'open', 'booking', 'booking_component_bulk_01'],
    ['history', 'resolved', 'booking', undefined],
    ['open', 'resolved', 'booking', undefined],
    ['open', 'open', 'course_enrollment', undefined],
  ])(
    'enables inline attendance only for an open booking issue: %s %s %s',
    (view, status, subjectKind, expectedBookingId) => {
      const item = {
        ...commonItem,
        kind: 'missing_attendance',
        blockingCondition: 'outcome',
        lifecycle: { ...commonItem.lifecycle, status },
        subjectRef:
          subjectKind === 'booking'
            ? { subjectKind, bookingId: 'booking_component_bulk_01' }
            : commonItem.subjectRef,
        attendance: [],
        references: {},
        resolutionGuidance: 'record_attendance',
        authorizedActions: { canResolveDirectly: false, actions: [] },
      };
      useReadModelsMock.mockReturnValue({
        list: { items: [item], loading: false, loadingMore: false, hasMore: false },
        detail: { item, loading: false },
        retryList: retryListMock,
        retryDetail: vi.fn(),
        loadMore: vi.fn(),
      });
      const submit = vi.fn();
      attendanceMock.mockReturnValue({
        panel: {
          lessonTime: '14 October, 10:00',
          participants: [{ id: 'participant_bulk_01', displayName: 'Alex', status: undefined }],
          missingCount: 1,
        },
        pending: false,
        loading: false,
        submit,
      });
      render(
        <MemoryRouter initialEntries={[`/?issue=${issueId}&issueView=${view}`]}>
          <AdminIssueCenter adminAccountId="admin_account_01" />
        </MemoryRouter>
      );
      expect(attendanceMock.mock.lastCall?.[0].bookingId).toBe(expectedBookingId);
      if (expectedBookingId) {
        fireEvent.click(screen.getByRole('button', { name: 'adminIssueAttendanceAllPresent' }));
        expect(submit).toHaveBeenCalledTimes(1);
      } else {
        expect(
          screen.queryByRole('button', { name: 'adminIssueAttendanceAllPresent' })
        ).not.toBeInTheDocument();
      }
    }
  );

  it('keeps the accessible success notice after confirmed resolution removes the detail', () => {
    useReadModelsMock.mockReturnValue({
      list: { items: [], loading: false, loadingMore: false, hasMore: false },
      detail: { loading: false },
      retryList: retryListMock,
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
    });
    attendanceMock.mockReturnValue({
      loading: false,
      pending: false,
      notice: { issueId, key: 'adminIssueAttendanceSaved', refreshFailed: true },
    });
    render(
      <MemoryRouter initialEntries={[`/?issue=${issueId}`]}>
        <AdminIssueCenter adminAccountId="admin_account_01" />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toHaveTextContent('adminIssueAttendanceSaved');
    expect(screen.getByRole('status')).toHaveTextContent('adminIssueAttendanceRefreshPending');
    expect(
      screen.queryByRole('button', { name: 'adminIssueAttendanceAllPresent' })
    ).not.toBeInTheDocument();
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
        <AdminIssueCenter adminAccountId="admin_account_01" />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getAllByText('adminIssueKindAttendancePaymentConflict').length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('Safe Participant').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alpine Foundations').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Almaty',
        }).format(new Date(1_788_250_000 * 1_000))
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('course_enrollment_component_01')).not.toBeInTheDocument();
    expect(screen.queryByText('attendance_payment_conflict')).not.toBeInTheDocument();
    expect(screen.getByText(/partially_paid/)).toBeInTheDocument();
    expect(screen.queryByText(/attendance_component_01/)).not.toBeInTheDocument();
    expect(screen.getByText('adminIssueActionsDeferred')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^resolve$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'adminIssueCheckPayment' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=finance');
    expect(screen.getByLabelText('location')).toHaveTextContent('payment=payment_component_01');
  });

  it('deep-links a booking issue to canonical booking detail', () => {
    const bookingIssue = {
      ...commonItem,
      subjectRef: {
        subjectKind: 'booking' as const,
        bookingId: 'booking_issue_component_01',
      },
      courseTitle: undefined,
    };
    useReadModelsMock.mockReturnValue({
      list: {
        items: [bookingIssue],
        loading: false,
        loadingMore: false,
        hasMore: false,
      },
      detail: {
        loading: false,
        item: {
          ...bookingIssue,
          subject: {
            availability: 'available',
            revision: 4,
            lifecycleStatus: 'confirmed',
          },
          attendance: [],
          references: {
            participantId: 'participant_component_01',
            attendanceIds: [],
          },
          resolutionGuidance: 'record_attendance',
          authorizedActions: {
            canResolveDirectly: false,
            actions: [],
          },
        },
      },
      retryList: retryListMock,
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/admin?tab=operations&issue=${issueId}`]}>
        <AdminIssueCenter adminAccountId="admin_account_01" />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'adminIssueOpenLesson' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=operations');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      'booking=booking_issue_component_01'
    );
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
        <AdminIssueCenter adminAccountId="admin_account_01" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retryListMock).toHaveBeenCalledTimes(1);
  });

  it('renders an open BookingChangeRequest as an attention item and opens booking detail', () => {
    const requestId = 'booking_change_request_component_01';
    const changeRequest = {
      sourceRef: {
        sourceKind: 'booking_change_request' as const,
        bookingChangeRequestId: requestId,
      },
      requestId,
      revision: 1,
      bookingId: 'booking_component_change_01',
      bookingRevision: 4,
      requestType: 'instructor_unavailable' as const,
      reason: 'Instructor is unavailable that morning',
      lifecycle: { status: 'open' as const },
      instructor: {
        instructorId: 'instructor_component_01',
        displayName: 'Coach Anna',
      },
      participants: [
        { participantId: 'participant_component_01', displayName: 'Safe Participant' },
      ],
      occurrence: {
        startsAt: { seconds: 1_788_250_000, nanoseconds: 0 },
        endsAt: { seconds: 1_788_253_600, nanoseconds: 0 },
        timeZone: 'Asia/Almaty',
      },
      authorizedActions: {
        canResolveRescheduled: true,
        canResolveBookingCancelled: true,
        canResolveNoChange: true,
      },
      createdAt: { seconds: 3, nanoseconds: 0 },
      updatedAt: { seconds: 3, nanoseconds: 0 },
    };
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
    useAttentionMock.mockReturnValue({
      list: { items: [changeRequest], loading: false },
      detail: { loading: false, item: { ...changeRequest, actionRequirement: 'action_required' } },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={[`/admin?tab=operations&changeRequest=${requestId}`]}>
        <AdminIssueCenter adminAccountId="admin_account_01" />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getAllByText('adminAttentionChangeRequestKind').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Coach Anna').length).toBeGreaterThan(0);
    expect(screen.getByText('Instructor is unavailable that morning')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^resolve$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'adminIssueReviewRequest' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=operations');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      'booking=booking_component_change_01'
    );
    expect(screen.getByLabelText('location')).toHaveTextContent(`changeRequest=${requestId}`);
  });

  it('falls back when inbox enrichment is absent and does not render raw ids', () => {
    const fallbackItem = {
      ...commonItem,
      subjectDisplayName: undefined,
      lessonStartsAt: undefined,
      lessonEndsAt: undefined,
      lessonTimeZone: undefined,
      courseTitle: undefined,
    };
    useReadModelsMock.mockReturnValue({
      list: {
        items: [fallbackItem],
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
        <AdminIssueCenter adminAccountId="admin_account_01" />
      </MemoryRouter>
    );
    expect(screen.getByText('adminIssueUnknownSubject')).toBeInTheDocument();
    expect(screen.getByText('adminIssueCourseContext')).toBeInTheDocument();
    expect(screen.queryByText(fallbackItem.subjectRef.enrollmentId)).not.toBeInTheDocument();
    expect(screen.queryByText(fallbackItem.issueId)).not.toBeInTheDocument();
  });

  it('shows guest category only when presentation origin exists in source data', () => {
    useReadModelsMock.mockReturnValue({
      list: {
        items: [{ ...commonItem, presentationOrigin: 'guest' as const }],
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
        <AdminIssueCenter adminAccountId="admin_account_01" />
      </MemoryRouter>
    );
    expect(screen.getByRole('option', { name: 'adminIssueCategoryGuest' })).toBeInTheDocument();
    expect(screen.getByText('adminIssueGuestOrigin')).toBeInTheDocument();
  });
});
