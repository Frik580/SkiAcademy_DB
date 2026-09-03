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

vi.mock('../../src/features/admin/identity', () => ({
  AdminManagedParticipantPicker: ({
    selected,
    onChange,
  }: {
    selected?: {
      accountId: string;
      participantId: string;
      displayName: string;
      accountDisplayName?: string;
    };
    onChange: (
      selection:
        | {
            accountId: string;
            participantId: string;
            displayName: string;
            accountDisplayName?: string;
          }
        | undefined
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          accountId: 'account_link_target_01',
          participantId: 'participant_link_target_01',
          displayName: 'Managed Target',
          accountDisplayName: 'Target Account',
        })
      }
    >
      {selected ? `selected:${selected.displayName}` : 'pick managed'}
    </button>
  ),
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
    difficulty: 'freeride',
    notes: 'Bring a helmet',
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
      guestIdentityLinkUnavailableReason: 'expired_reservation',
    },
  } as LessonBookingReadModel;
}

function pendingUnpaidAdminDetail(): LessonBookingReadModel {
  const item = detail();
  return {
    ...item,
    lifecycle: { status: 'pending', reservationExpiresAt: { seconds: 1_788_250_000, nanoseconds: 0 } },
    difficulty: 'freestyle',
    notes: undefined,
    admin: {
      ...item.admin!,
      payer: undefined,
      payment: {
        paymentId: 'payment_admin_panel_01',
        status: 'unpaid',
        revision: 1,
        currency: 'KZT',
        originalPrice: 60_000,
        price: 60_000,
        paid: 0,
        refunded: 0,
        retained: 0,
        settled: 0,
        writtenOff: 0,
        outstanding: 60_000,
      },
      cancellationFinancial: {
        timing: 'direct_cancel',
        maximumRefund: 0,
        suggestedRefund: 0,
      },
      relatedIssues: [],
      attendance: [
        {
          participantId: 'participant_admin_panel_01',
          authorizedActions: {
            canRecordPresent: false,
            canRecordAbsent: false,
            reasonRequired: true,
          },
        },
      ],
      authorizedActions: {
        canConfirmGuest: false,
        canDirectCancel: false,
        canReschedule: false,
        canChangeInstructor: false,
        canChangeDuration: false,
        canRecordAttendance: false,
        canResolveCancellation: false,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
      guestIdentityLinkUnavailableReason: 'expired_reservation',
    },
  } as LessonBookingReadModel;
}

function renderPanel(item?: LessonBookingReadModel, path = '/admin?tab=operations&booking=booking_admin_panel_01') {
  readMock.mockReturnValue({
    list: {
      items: item ? [item] : [],
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
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminLessonBookingPanel
        adminAccountId="admin_account_01"
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
}

describe('AdminLessonBookingPanel', () => {
  beforeEach(() => {
    readMock.mockReset();
    runAttemptMock.mockReset();
  });

  it('renders canonical accounting links, issue links, and unavailable guest linking', () => {
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

    expect(screen.getByText('adminLessonPaymentTitle')).toBeVisible();
    expect(screen.getByText('adminLessonLinkUnavailable')).toBeVisible();
    expect(screen.getByText('adminLessonLinkReasonExpired')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonLinkGuest' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonLinkDeferred' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('complete_booking')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonOpenPayment' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=finance');
    expect(screen.getByLabelText('location')).toHaveTextContent('payment=payment_admin_panel_01');

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonOpenIssue' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=operations');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      'issue=admin_issue_booking_panel_01'
    );
  });

  it('shows payment-driven confirmation status without a manual approval action', () => {
    renderPanel(pendingUnpaidAdminDetail());

    expect(
      screen.queryByRole('button', { name: 'adminLessonConfirmGuest' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('adminLessonStatusAwaitingPayment').length).toBeGreaterThan(0);
    expect(screen.getByText('adminLessonGuestApprovalUnavailable')).toBeVisible();
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

  it('locks Admin guest identity linking to the captured booking revision and selected Participant', async () => {
    const item = detail();
    const linkable = {
      ...item,
      admin: {
        ...item.admin!,
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canLinkGuestToAccount: true,
          canResolveCancellation: false,
        },
      },
    };
    runAttemptMock.mockResolvedValue({ status: 'success' });
    readMock.mockReturnValue({
      list: { items: [linkable], loading: false, loadingMore: false, hasMore: false },
      detail: { item: linkable, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" instructors={[]} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick managed' }));
    fireEvent.change(screen.getByLabelText('Link reason'), {
      target: { value: 'Existing managed identity' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonLinkGuest' }));
    expect(
      screen.getByText(
        /booking_admin_panel_01 @ rev 5 → account_link_target_01\/participant_link_target_01/
      )
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Link reason'), {
      target: { value: 'Existing managed identity changed' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonLinkGuest' }));
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmSubmit' }));
    await waitFor(() => expect(runAttemptMock).toHaveBeenCalledTimes(1));
    expect(runAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'link_guest_booking_to_account_as_administrator',
      target: { bookingId: 'booking_admin_panel_01', revision: 5 },
      targetAccountId: 'account_link_target_01',
      targetParticipantId: 'participant_link_target_01',
      reasonExplanation: 'Existing managed identity changed',
    });
  });

  it('keeps lifecycle actions and hides duplicate scheduling controls', () => {
    const item = detail();
    const schedulingAuthorized = {
      ...item,
      admin: {
        ...item.admin!,
        attendance: [
          {
            participantId: 'participant_admin_panel_01',
            attendanceStatus: 'unknown' as const,
            revision: 1,
            authorizedActions: { canRecordPresent: true, canRecordAbsent: true },
          },
        ],
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canReschedule: true,
          canChangeInstructor: true,
          canChangeDuration: true,
          canRecordAttendance: true,
          canResolveAttendanceOutcome: true,
          canDirectCancel: true,
        },
      },
    };
    readMock.mockReturnValue({
      list: { items: [schedulingAuthorized], loading: false, loadingMore: false, hasMore: false },
      detail: { item: schedulingAuthorized, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel
          adminAccountId="admin_account_01"
          instructors={[
            { instructorId: 'instructor_admin_panel_01', displayName: 'Canonical Coach' },
          ]}
        />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.queryByText('adminLessonCreateTitle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Create instructor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reschedule date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target instructor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target duration')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonReschedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonReassign' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonChangeDuration' })
    ).not.toBeInTheDocument();

    expect(screen.getByText('adminLessonPaymentTitle')).toBeVisible();
    expect(screen.getByText('adminLessonAttendanceTitle')).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonRecordPresent' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonRecordAbsent' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonResolveOutcome' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonApproveCancellation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonDirectCancel' })).toBeVisible();
    expect(screen.getByText(/Canonical Payer/)).toBeVisible();
    expect(screen.getByText(/adminIssueKindMissingAttendance/)).toBeVisible();
    expect(screen.getByText('booking 5 · schedule 2')).not.toBeVisible();
    expect(screen.getByText('adminLessonScheduleInPlanner')).toBeVisible();
    expect(screen.getByText('adminLessonDifficulty')).toBeVisible();
    expect(screen.getByText('Freeride')).toBeVisible();
    expect(screen.getByText('Bring a helmet')).toBeVisible();
  });

  it('opens the planner on the booking date from lesson detail', () => {
    const item = detail();
    readMock.mockReturnValue({
      list: { items: [item], loading: false, loadingMore: false, hasMore: false },
      detail: { item, loading: false },
      retryList: vi.fn(),
      retryDetail: vi.fn(),
      loadMore: vi.fn(),
      refreshBooking: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_admin_panel_01']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" instructors={[]} />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'openInPlanner' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=operations');
    expect(screen.getByLabelText('location')).toHaveTextContent('plannerDate=');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      'plannerBooking=booking_admin_panel_01'
    );
  });

  it('presents a realistic pending unpaid admin_detail without developer mutations', () => {
    const item = pendingUnpaidAdminDetail();
    renderPanel(item);

    expect(screen.getAllByText('adminLessonStatusAwaitingPayment').length).toBeGreaterThan(0);
    expect(screen.getByText('adminLessonPaymentRemaining')).toBeVisible();
    expect(screen.getAllByText(/60,000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'adminLessonOpenPayment' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonDirectCancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonRecordPresent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonRecordAbsent' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonResolveOutcome' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonApproveCancellation' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonLinkGuest' })).not.toBeInTheDocument();
    expect(screen.queryByText(/server currently authorizes no booking mutations/i)).not.toBeInTheDocument();
    expect(screen.queryByText('adminLessonNoActions')).not.toBeInTheDocument();
    expect(screen.getByText('adminLessonNoActionsAwaitingConfirmation')).toBeVisible();
    expect(screen.getByText('adminLessonAttendanceMissing')).toBeVisible();
    expect(screen.getByText('adminLessonLinkReasonExpired')).toBeVisible();
    expect(screen.getByText('adminLessonNoRelatedIssues')).toBeVisible();
    expect(screen.queryByText('adminLessonNotes')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceRefunded')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceRetained')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceWrittenOff')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonReschedule' })).not.toBeInTheDocument();
    expect(screen.getByText('Freestyle')).toBeVisible();
    expect(screen.getByText('adminLessonTechnicalDetails')).toBeVisible();
    expect(screen.getByText('booking_admin_panel_01')).not.toBeVisible();

    fireEvent.click(screen.getByText('adminLessonTechnicalDetails'));
    expect(screen.getByText('booking_admin_panel_01')).toBeVisible();
    expect(screen.getByText('booking 5 · schedule 2')).toBeVisible();
  });

  it('hides unauthorized lifecycle buttons instead of disabling them', () => {
    const item = detail();
    const confirmedUnauthorized = {
      ...item,
      lifecycle: { status: 'confirmed' as const },
      admin: {
        ...item.admin!,
        relatedIssues: [],
        attendance: [
          {
            participantId: 'participant_admin_panel_01',
            attendanceStatus: 'present' as const,
            revision: 1,
            authorizedActions: { canRecordPresent: false, canRecordAbsent: true, reasonRequired: true as const },
          },
        ],
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canDirectCancel: false,
          canResolveCancellation: false,
          canRecordAttendance: true,
          canResolveAttendanceOutcome: false,
          canLinkGuestToAccount: false,
        },
      },
    };
    renderPanel(confirmedUnauthorized);

    expect(screen.getAllByText('adminLessonStatusConfirmed').length).toBeGreaterThan(0);
    expect(screen.getByText('adminLessonAttendancePresent')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonRecordPresent' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'adminLessonRecordAbsent' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonDirectCancel' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonApproveCancellation' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonResolveOutcome' })
    ).not.toBeInTheDocument();
  });

  it('shows recorded absent attendance and omits empty notes', () => {
    const item = detail();
    const absentRecorded = {
      ...item,
      notes: undefined,
      difficulty: undefined,
      lifecycle: { status: 'confirmed' as const },
      admin: {
        ...item.admin!,
        relatedIssues: [],
        attendance: [
          {
            participantId: 'participant_admin_panel_01',
            attendanceStatus: 'absent' as const,
            revision: 1,
            authorizedActions: { canRecordPresent: false, canRecordAbsent: false, reasonRequired: true as const },
          },
        ],
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canResolveCancellation: false,
          canDirectCancel: false,
        },
      },
    };
    renderPanel(absentRecorded);

    expect(screen.getByText('adminLessonAttendanceAbsent')).toBeVisible();
    expect(screen.queryByText('adminLessonNotes')).not.toBeInTheDocument();
    expect(screen.getByText('difficultyUnspecified')).toBeVisible();
    expect(screen.queryByText('Beginner')).not.toBeInTheDocument();
  });

  it('shows the pending cancellation request and only server-authorized cancel controls', () => {
    renderPanel(detail());

    expect(screen.getAllByText('adminLessonStatusPendingCancellation').length).toBeGreaterThan(0);
    expect(screen.getByText('adminLessonCancellationRequested')).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonApproveCancellation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonRejectCancellation' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonDirectCancel' })).not.toBeInTheDocument();
  });

  it('exposes the Account + Participant guest-link workflow when the server allows it', () => {
    const item = detail();
    const linkable = {
      ...item,
      admin: {
        ...item.admin!,
        authorizedActions: {
          ...item.admin!.authorizedActions,
          canLinkGuestToAccount: true,
          canResolveCancellation: false,
        },
      },
    };
    renderPanel(linkable);

    expect(screen.getByRole('button', { name: 'pick managed' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonLinkGuest' })).toBeVisible();
    expect(screen.queryByText('adminLessonLinkUnavailable')).not.toBeInTheDocument();
  });

  it('shows meaningful non-zero ancillary payment rows', () => {
    renderPanel(detail());
    expect(screen.getByText('adminFinanceRetained')).toBeVisible();
    expect(screen.getByText('adminFinanceSettled')).toBeVisible();
    expect(screen.queryByText('adminFinanceRefunded')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceWrittenOff')).not.toBeInTheDocument();
  });
});
