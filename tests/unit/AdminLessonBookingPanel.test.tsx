import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readMock = vi.fn();
const runAttemptMock = vi.fn();

/**
 * Render-boundary probes.
 *
 * `masterLists` counts how often the container re-creates the master-list element (i.e. how
 * often the page-level container renders); `rows` counts real `AdminLessonBookingListRow`
 * component invocations inside the memoized master list. DOM equality cannot prove render
 * isolation because a re-render can commit identical markup, so both are counted directly.
 */
const renderCounters = vi.hoisted(() => ({ masterLists: 0, rows: 0 }));

vi.mock(
  '../../src/features/admin/lesson-bookings/AdminLessonBookingMasterList',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../src/features/admin/lesson-bookings/AdminLessonBookingMasterList')
      >();
    return {
      ...actual,
      AdminLessonBookingMasterList: (
        props: Parameters<typeof actual.AdminLessonBookingMasterList>[0]
      ) => {
        renderCounters.masterLists += 1;
        return <actual.AdminLessonBookingMasterList {...props} />;
      },
    };
  }
);

vi.mock('../../src/features/admin/lesson-bookings/AdminLessonBookingUi', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/features/admin/lesson-bookings/AdminLessonBookingUi')
    >();
  return {
    ...actual,
    AdminLessonBookingListRow: (props: Parameters<typeof actual.AdminLessonBookingListRow>[0]) => {
      renderCounters.rows += 1;
      return <actual.AdminLessonBookingListRow {...props} />;
    },
  };
});

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

vi.mock('../../src/features/admin/operations/AdminMonitorReadModelsContext', () => ({
  useSharedAdminMonitorReadModels: () => ({
    refreshAllProjections: vi.fn().mockResolvedValue(undefined),
  }),
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
      canCreateChangeRequest: false,
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
      relatedOpenChangeRequests: [],
      scheduleRevision: 2,
      serviceParticipantIds: ['participant_admin_panel_01'],
      authorizedActions: {
        canConfirmGuest: false,
        canRecordGuestPayment: false,
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
    lifecycle: {
      status: 'pending',
      reservationExpiresAt: { seconds: 1_788_250_000, nanoseconds: 0 },
    },
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
        canRecordGuestPayment: true,
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

function isolationDetail(bookingId: string, participantName: string): LessonBookingReadModel {
  const base = detail();
  const participant = base.admin!.participants[0];
  return {
    ...base,
    bookingId,
    participants: [{ participantId: participant.participantId, displayName: participantName }],
    lifecycle: { status: 'confirmed' },
    admin: {
      ...base.admin!,
      participants: [{ ...participant, displayName: participantName }],
      relatedIssues: [],
      attendance: [
        {
          participantId: participant.participantId,
          attendanceStatus: 'unknown',
          revision: 1,
          authorizedActions: { canRecordPresent: true, canRecordAbsent: true },
        },
      ],
      authorizedActions: {
        ...base.admin!.authorizedActions,
        canDirectCancel: false,
        canRecordGuestPayment: true,
        canResolveCancellation: true,
        canRecordAttendance: true,
        canResolveAttendanceOutcome: false,
      },
    },
  } as LessonBookingReadModel;
}

function renderPanel(
  item?: LessonBookingReadModel,
  path = '/admin?tab=operations&booking=booking_admin_panel_01'
) {
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

function openDetailSection(name: string) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
}

describe('AdminLessonBookingPanel', () => {
  beforeEach(() => {
    readMock.mockReset();
    runAttemptMock.mockReset();
    renderCounters.masterLists = 0;
    renderCounters.rows = 0;
  });

  it('does not rerender the master list while the operational reason draft is typed', async () => {
    const first = isolationDetail('booking_isolation_a', 'First Student');
    const second = isolationDetail('booking_isolation_b', 'Second Student');
    const staticReads = {
      list: {
        items: [first, second],
        loading: false,
        loadingMore: false,
        hasMore: false,
      },
      retryList: () => Promise.resolve(),
      retryDetail: () => Promise.resolve(),
      loadMore: () => Promise.resolve(),
      refreshBooking: () => Promise.resolve({ status: 'success' as const }),
    };
    readMock.mockImplementation((input: { selectedBookingId?: string }) => ({
      ...staticReads,
      detail: {
        item: input?.selectedBookingId === 'booking_isolation_b' ? second : first,
        loading: false,
      },
    }));
    runAttemptMock.mockResolvedValue({ status: 'success' });

    render(
      <MemoryRouter initialEntries={['/admin?tab=operations&booking=booking_isolation_a']}>
        <AdminLessonBookingPanel adminAccountId="admin_account_01" instructors={[]} />
      </MemoryRouter>
    );

    openDetailSection('adminLessonAttendanceTitle');
    const reason = screen.getByLabelText('adminLessonReason');
    const recordPresent = screen.getByRole('button', { name: 'adminLessonRecordPresent' });
    const finalizeButton = screen.getByRole('button', { name: 'adminLessonFinalizeAttendance' });
    expect(finalizeButton).toBeDisabled();

    const rowsBefore = renderCounters.rows;
    const masterListRendersBefore = renderCounters.masterLists;
    expect(rowsBefore).toBeGreaterThan(0);

    const draft = '  Operational reason drafted  ';
    for (let length = 1; length <= draft.length; length += 1) {
      fireEvent.change(reason, { target: { value: draft.slice(0, length) } });
    }

    // Typed draft is visible and still drives the server-authorized action buttons.
    expect(reason).toHaveValue(draft);
    expect(recordPresent).toBeEnabled();
    expect(finalizeButton).toBeDisabled();
    // Neither the container nor one single master-list row was rendered by those keystrokes.
    expect(renderCounters.masterLists).toBe(masterListRendersBefore);
    expect(renderCounters.rows).toBe(rowsBefore);

    // The other detail-local drafts must be isolated the same way.
    openDetailSection('adminLessonPaymentTitle');
    const paymentAmountInput = screen.getByLabelText('adminLessonPaymentAmount');
    for (const value of ['1', '10', '100']) {
      fireEvent.change(paymentAmountInput, { target: { value } });
    }
    expect(paymentAmountInput).toHaveValue(100);
    openDetailSection('adminLessonCancellationTitle');
    const refundInput = screen.getByLabelText('adminLessonRefund');
    for (const value of ['1000', '1500', '2000']) {
      fireEvent.change(refundInput, { target: { value } });
    }
    expect(refundInput).toHaveValue(2000);
    expect(renderCounters.rows).toBe(rowsBefore);

    openDetailSection('adminLessonAttendanceTitle');
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonRecordPresent' }));
    expect(runAttemptMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'adminLessonFinalizeAttendance' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonFinalizeAttendance' }));
    expect(runAttemptMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmAttendanceSubmit' }));
    await waitFor(() => expect(runAttemptMock).toHaveBeenCalledTimes(1));
    expect(runAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'finalize_booking_attendance',
      target: { bookingId: 'booking_isolation_a', revision: 5 },
      reasonExplanation: 'Operational reason drafted',
      attendance: [
        {
          participantId: 'participant_admin_panel_01',
          attendanceStatus: 'present',
          expectedAttendanceRevision: 1,
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'adminLessonConfirmAttendanceTitle' })).not
        .toBeInTheDocument()
    );

    // Switching the selected booking remounts the detail boundary and clears the draft.
    fireEvent.click(screen.getByRole('button', { name: /Second Student/ }));
    openDetailSection('adminLessonAttendanceTitle');
    expect(screen.getByLabelText('adminLessonReason')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'adminLessonFinalizeAttendance' })).toBeDisabled();
    expect(renderCounters.rows).toBeGreaterThan(rowsBefore);
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

    expect(screen.getAllByText('paid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('adminLessonOriginGuest').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'adminLessonSendSms' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'adminLessonSendSms' })).toHaveAttribute(
      'title',
      'adminLessonSmsUnavailable'
    );
    expect(screen.getByText('adminLessonSmsUnavailable')).toBeVisible();

    openDetailSection('adminLessonGuestTitle');
    expect(screen.getByText('adminLessonLinkUnavailable')).toBeVisible();
    expect(screen.getByText('adminLessonLinkReasonExpired')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'adminLessonLinkGuest' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonLinkDeferred' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('complete_booking')).not.toBeInTheDocument();

    openDetailSection('adminLessonPaymentTitle');
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonOpenPayment' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('tab=finance');
    expect(screen.getByLabelText('location')).toHaveTextContent('payment=payment_admin_panel_01');

    openDetailSection('adminLessonRelatedIssues');
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

  it('records one partial cash Payment attempt with the captured Payment revision', async () => {
    let completeAttempt: ((value: { status: 'success' }) => void) | undefined;
    runAttemptMock.mockImplementation(
      () =>
        new Promise<{ status: 'success' }>((resolve) => {
          completeAttempt = resolve;
        })
    );
    renderPanel(pendingUnpaidAdminDetail());
    openDetailSection('adminLessonPaymentTitle');

    expect(screen.getByText('adminLessonPaymentPrice')).toBeVisible();
    expect(screen.getByText('adminFinancePaid')).toBeVisible();
    expect(screen.getByText('adminLessonPaymentRemaining')).toBeVisible();
    const amount = screen.getByLabelText('adminLessonPaymentAmount');
    expect(amount).toHaveValue(60_000);

    fireEvent.change(amount, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonRecordPayment' }));
    const submit = screen.getByRole('button', { name: 'adminLessonConfirmSubmit' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(runAttemptMock).toHaveBeenCalledTimes(1));
    expect(runAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'record_provider_payment_event',
      target: { bookingId: 'booking_admin_panel_01', revision: 5 },
      paymentId: 'payment_admin_panel_01',
      paymentRevision: 1,
      amount: 5_000,
    });

    completeAttempt?.({ status: 'success' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('defaults a new cash Payment attempt to the full canonical remainder', async () => {
    runAttemptMock.mockResolvedValue({ status: 'success' });
    renderPanel(pendingUnpaidAdminDetail());
    openDetailSection('adminLessonPaymentTitle');

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonRecordPayment' }));
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmSubmit' }));

    await waitFor(() => expect(runAttemptMock).toHaveBeenCalledTimes(1));
    expect(runAttemptMock.mock.calls[0]?.[0]).toMatchObject({
      kind: 'record_provider_payment_event',
      paymentId: 'payment_admin_panel_01',
      paymentRevision: 1,
      amount: 60_000,
    });
  });

  it('keeps committed Payment success visible when the authoritative refresh fails', async () => {
    runAttemptMock.mockResolvedValue({ status: 'success', refreshFailed: true });
    renderPanel(pendingUnpaidAdminDetail());
    openDetailSection('adminLessonPaymentTitle');

    fireEvent.click(screen.getByRole('button', { name: 'adminLessonRecordPayment' }));
    fireEvent.click(screen.getByRole('button', { name: 'adminLessonConfirmSubmit' }));

    expect(await screen.findByText('adminLessonPaymentRecordedRefreshPending')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

    openDetailSection('adminLessonGuestTitle');
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

    openDetailSection('adminLessonPaymentTitle');
    expect(screen.getByText('adminLessonPaymentPrice')).toBeVisible();
    openDetailSection('adminLessonAttendanceTitle');
    expect(screen.getByRole('button', { name: 'adminLessonRecordPresent' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonRecordAbsent' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'adminLessonFinalizeAttendance' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonResolveOutcome' })
    ).not.toBeInTheDocument();
    openDetailSection('adminLessonCancellationTitle');
    const cancellationReason = screen.getByLabelText('adminLessonReason');
    const approveCancellation = screen.getByRole('button', {
      name: 'adminLessonApproveCancellation',
    });
    const directCancel = screen.getByRole('button', { name: 'adminLessonDirectCancel' });
    expect(cancellationReason).toBeVisible();
    fireEvent.change(cancellationReason, { target: { value: 'Operational cancellation' } });
    expect(approveCancellation).toBeEnabled();
    expect(directCancel).toBeEnabled();
    openDetailSection('adminLessonOverviewTitle');
    expect(screen.getByText(/Canonical Payer/)).toBeVisible();
    openDetailSection('adminLessonRelatedIssues');
    expect(screen.getByText(/adminIssueKindMissingAttendance/)).toBeVisible();
    expect(screen.queryByText('booking 5 · schedule 2')).not.toBeInTheDocument();
    openDetailSection('adminLessonOverviewTitle');
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

  it('hands schedule changes to Planner while preserving non-scheduling request resolutions', () => {
    const item = detail();
    const changeRequested = {
      ...item,
      admin: {
        ...item.admin!,
        relatedOpenChangeRequests: [
          {
            requestId: 'booking_change_request_admin_panel_01',
            revision: 2,
            requestType: 'instructor_unavailable' as const,
            reason: 'Instructor is unavailable',
            createdAt: { seconds: 11, nanoseconds: 0 },
          },
        ],
      },
    } as LessonBookingReadModel;
    renderPanel(
      changeRequested,
      '/admin?tab=operations&booking=booking_admin_panel_01&changeRequest=booking_change_request_admin_panel_01'
    );

    expect(
      screen.queryByRole('button', { name: 'adminLessonResolveChangeReschedule' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('adminLessonNewLessonDate')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'openInPlanner' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'adminLessonResolveChangeCancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonResolveChangeReject' })).toBeVisible();
  });

  it('supports roving keyboard navigation across detail tabs', () => {
    renderPanel(detail());
    const overview = screen.getByRole('tab', { name: 'adminLessonOverviewTitle' });
    const payment = screen.getByRole('tab', { name: 'adminLessonPaymentTitle' });
    for (const tab of screen.getAllByRole('tab')) {
      const controlledPanelId = tab.getAttribute('aria-controls');
      expect(controlledPanelId).toBeTruthy();
      expect(document.getElementById(controlledPanelId!)).toBeInTheDocument();
    }

    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });

    expect(payment).toHaveFocus();
    expect(payment).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('adminLessonPaymentPrice')).toBeVisible();
  });

  it('presents a realistic pending unpaid admin_detail without developer mutations', () => {
    const item = pendingUnpaidAdminDetail();
    renderPanel(item);

    expect(screen.getAllByText('adminLessonStatusAwaitingPayment').length).toBeGreaterThan(0);
    openDetailSection('adminLessonPaymentTitle');
    expect(screen.getByText('adminLessonPaymentRemaining')).toBeVisible();
    expect(screen.getAllByText(/60,000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'adminLessonOpenPayment' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'adminLessonDirectCancel' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonRecordPresent' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonRecordAbsent' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonResolveOutcome' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'adminLessonApproveCancellation' })
    ).not.toBeInTheDocument();
    openDetailSection('adminLessonGuestTitle');
    expect(screen.queryByRole('button', { name: 'adminLessonLinkGuest' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/server currently authorizes no booking mutations/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('adminLessonNoActions')).not.toBeInTheDocument();
    expect(screen.queryByText('adminLessonNoActionsAwaitingConfirmation')).not.toBeInTheDocument();
    openDetailSection('adminLessonPaymentTitle');
    expect(screen.getByRole('button', { name: 'adminLessonRecordPayment' })).toBeVisible();
    openDetailSection('adminLessonAttendanceTitle');
    expect(screen.getByText('adminLessonAttendanceMissing')).toBeVisible();
    openDetailSection('adminLessonGuestTitle');
    expect(screen.getByText('adminLessonLinkReasonExpired')).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'adminLessonRelatedIssues' })).not.toBeInTheDocument();
    expect(screen.queryByText('adminLessonNotes')).not.toBeInTheDocument();
    openDetailSection('adminLessonPaymentTitle');
    expect(screen.queryByText('adminFinanceRefunded')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceRetained')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceWrittenOff')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminLessonReschedule' })).not.toBeInTheDocument();
    openDetailSection('adminLessonOverviewTitle');
    expect(screen.getByText('Freestyle')).toBeVisible();
    openDetailSection('adminLessonTechnicalDetails');
    expect(screen.getByText('adminLessonTechnicalDetails', { selector: 'summary' })).toBeVisible();
    expect(screen.getByText('booking_admin_panel_01')).not.toBeVisible();

    fireEvent.click(screen.getByText('adminLessonTechnicalDetails', { selector: 'summary' }));
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
            authorizedActions: {
              canRecordPresent: false,
              canRecordAbsent: true,
              reasonRequired: true as const,
            },
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
    openDetailSection('adminLessonAttendanceTitle');
    expect(screen.getByText('adminLessonAttendancePresent')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'adminLessonRecordPresent' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'adminLessonRecordAbsent' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'adminLessonDirectCancel' })
    ).not.toBeInTheDocument();
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
            authorizedActions: {
              canRecordPresent: false,
              canRecordAbsent: false,
              reasonRequired: true as const,
            },
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

    openDetailSection('adminLessonAttendanceTitle');
    expect(screen.getByText('adminLessonAttendanceAbsent')).toBeVisible();
    openDetailSection('adminLessonOverviewTitle');
    expect(screen.queryByText('adminLessonNotes')).not.toBeInTheDocument();
    expect(screen.getByText('difficultyUnspecified')).toBeVisible();
    expect(screen.queryByText('Beginner')).not.toBeInTheDocument();
  });

  it('shows the pending cancellation request and only server-authorized cancel controls', () => {
    renderPanel(detail());

    expect(screen.getAllByText('adminLessonStatusPendingCancellation').length).toBeGreaterThan(0);
    expect(screen.getByText('adminLessonCancellationRequested')).toBeVisible();
    openDetailSection('adminLessonCancellationTitle');
    expect(screen.getByRole('button', { name: 'adminLessonApproveCancellation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonRejectCancellation' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'adminLessonDirectCancel' })
    ).not.toBeInTheDocument();
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

    openDetailSection('adminLessonGuestTitle');
    expect(screen.getByRole('button', { name: 'pick managed' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'adminLessonLinkGuest' })).toBeVisible();
    expect(screen.queryByText('adminLessonLinkUnavailable')).not.toBeInTheDocument();
  });

  it('shows meaningful non-zero ancillary payment rows', () => {
    renderPanel(detail());
    openDetailSection('adminLessonPaymentTitle');
    expect(screen.getByText('adminFinanceRetained')).toBeVisible();
    expect(screen.getByText('adminFinanceSettled')).toBeVisible();
    expect(screen.queryByText('adminFinanceRefunded')).not.toBeInTheDocument();
    expect(screen.queryByText('adminFinanceWrittenOff')).not.toBeInTheDocument();
  });
});
