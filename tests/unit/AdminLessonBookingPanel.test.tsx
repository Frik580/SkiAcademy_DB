import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readMock = vi.fn();
const runAttemptMock = vi.fn();

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingReadModels', () => ({
  useAdminLessonBookingReadModels: (...args: unknown[]) => readMock(...args),
}));

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingCommands', () => ({
  useAdminLessonBookingCommands: () => ({
    runAttempt: (...args: unknown[]) => runAttemptMock(...args),
  }),
}));

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingTranslations', () => ({
  useAdminLessonBookingTranslations: () => ({ language: 'en', t: (key: string) => key }),
}));

import { AdminLessonBookingPanel } from '../../src/features/admin/lesson-bookings/AdminLessonBookingPanel';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

function detail(): LessonBookingReadModel {
  return {
    bookingId: 'booking_admin_panel_01',
    revision: 5,
    partyKind: 'individual',
    participantIds: ['participant_admin_panel_01'],
    participants: [
      { participantId: 'participant_admin_panel_01', displayName: 'Canonical Student' },
    ],
    instructor: {
      instructorId: 'instructor_admin_panel_01',
      displayName: 'Canonical Coach',
    },
    occurrence: {
      startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
      endsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: 'pending_cancellation' },
    bookingOrigin: 'guest',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
    },
    updatedAt: { seconds: 10, nanoseconds: 0 },
    admin: {
      participants: [
        {
          participantId: 'participant_admin_panel_01',
          displayName: 'Canonical Student',
          skillLevel: 'intermediate',
          discipline: 'ski',
          age: { kind: 'age_years', years: 18 },
        },
      ],
      attribution: {
        bookingOrigin: 'guest',
        bookedBy: { kind: 'guest', guestSubjectId: 'guest_subject_admin_panel_01' },
      },
      payer: { accountId: 'account_admin_panel_01', displayName: 'Canonical Payer' },
      payment: {
        paymentId: 'payment_admin_panel_01',
        status: 'paid',
        revision: 2,
        currency: 'KZT',
        originalPrice: 25_000,
        price: 25_000,
        paid: 25_000,
        refunded: 0,
        retained: 25_000,
        settled: 25_000,
        writtenOff: 0,
        outstanding: 0,
      },
      cancellationFinancial: {
        timing: 'pending_request',
        maximumRefund: 25_000,
        suggestedRefund: 20_000,
      },
      relatedIssues: [
        {
          issueId: 'admin_issue_booking_panel_01',
          kind: 'missing_attendance',
          severity: 'urgent',
          lifecycleStatus: 'open',
          revision: 3,
          blocksOutcome: true,
          blocksDelivery: false,
          updatedAt: { seconds: 9, nanoseconds: 0 },
        },
      ],
      scheduleRevision: 2,
      serviceParticipantIds: ['participant_admin_panel_01'],
      authorizedActions: {
        canConfirmGuest: false,
        canDirectCancel: false,
        canReschedule: false,
        canChangeInstructor: false,
        canChangeDuration: false,
        canRecordAttendance: false,
        canResolveCancellation: true,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
    },
  } as LessonBookingReadModel;
}

describe('AdminLessonBookingPanel', () => {
  beforeEach(() => {
    readMock.mockReset();
    runAttemptMock.mockReset();
  });

  it('renders canonical accounting links, issue links, and deferred guest linking', () => {
    const item = detail();
    readMock.mockReturnValue({
      list: {
        items: [item],
        loading: false,
        loadingMore: false,
        hasMore: false,
      },
      detail: { item, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel
          adminAccountId="admin_account_01"
          accounts={[
            {
              accountId: 'account_admin_panel_01',
              displayName: 'Canonical Payer',
              email: 'payer@example.test',
            },
          ]}
          instructors={[
            {
              instructorId: 'instructor_admin_panel_01',
              displayName: 'Canonical Coach',
            },
          ]}
        />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getByText(/original/)).toHaveTextContent('25,000');
    expect(screen.getByRole('button', { name: 'adminLessonLinkDeferred' })).toBeDisabled();
    expect(screen.getByText('adminLessonLinkDeferredHint')).toBeVisible();
    expect(screen.queryByText('complete_booking')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonOpenPayment' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=finance');
    expect(screen.getByLabelText('location')).toHaveTextContent('payment=payment_admin_panel_01');

    fireEvent.click(screen.getByRole('button', { name: /missing_attendance/ }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=operations');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      'issue=admin_issue_booking_panel_01'
    );
  });

  it('shows guest approval only from the server-derived Admin action', () => {
    const item = detail();
    const pendingGuest = {
      ...item,
      lifecycle: {
        status: 'pending' as const,
        reservationExpiresAt: { seconds: 1_788_250_000, nanoseconds: 0 },
      },
      admin: {
        ...item.admin!,
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canConfirmGuest: true,
          canResolveCancellation: false,
        },
      },
    };
    readMock.mockReturnValue({
      list: { items: [pendingGuest], loading: false, loadingMore: false, hasMore: false },
      detail: { item: pendingGuest, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" accounts={[]} instructors={[]} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'adminLessonConfirmGuest' })).toBeVisible();
    expect(screen.queryByText('adminLessonGuestApprovalUnavailable')).not.toBeInTheDocument();
  });

  it('keeps server pagination reachable when a filtered page is empty', () => {
    const loadMore = vi.fn();
    readMock.mockReturnValue({
      list: { items: [], loading: false, loadingMore: false, hasMore: true, cursor: 'next' },
      detail: { loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore,
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" accounts={[]} instructors={[]} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonLoadNextPage' }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps the captured mutation target when the selected booking changes', async () => {
    const first = detail();
    const second = {
      ...first,
      bookingId: 'booking_admin_panel_02',
      revision: 9,
      participants: [{ participantId: 'participant_admin_panel_02', displayName: 'Other Student' }],
      admin: {
        ...first.admin!,
        participants: [
          {
            participantId: 'participant_admin_panel_02',
            displayName: 'Other Student',
            skillLevel: 'beginner',
            discipline: 'ski' as const,
            age: { kind: 'age_years' as const, years: 16 },
          },
        ],
        authorizedActions: {
          ...first.admin!.authorizedActions,
          canConfirmGuest: true,
          canResolveCancellation: false,
        },
      },
    };
    const pendingFirst = {
      ...first,
      admin: {
        ...first.admin!,
        authorizedActions: {
          ...first.admin!.authorizedActions,
          canConfirmGuest: true,
          canResolveCancellation: false,
        },
      },
    };
    runAttemptMock.mockResolvedValue({ status: 'success' });
    readMock.mockReturnValue({
      list: { items: [pendingFirst, second], loading: false, loadingMore: false, hasMore: false },
      detail: { item: pendingFirst, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" accounts={[]} instructors={[]} />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmGuest' }));
    expect(screen.getByText(/booking_admin_panel_01 @ rev 5/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Other Student/ }));
    expect(screen.getByText(/booking_admin_panel_01 @ rev 5/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmSubmit' }));
    await waitFor(() => expect(runAttemptMock).toHaveBeenCalledTimes(1));
    expect(runAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'confirm_guest_booking',
      target: { bookingId: 'booking_admin_panel_01', revision: 5 },
    });
  });
});
