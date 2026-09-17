import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCourseEnrollmentPanel } from '../../src/features/admin/course-enrollments';
import { useAdminCourseEnrollmentReadModels } from '../../src/features/admin/course-enrollments/useAdminCourseEnrollmentReadModels';

const queryAdminCourseEnrollmentReadModels = vi.fn();
const queryAdminCourseReadModels = vi.fn();
const queryAdminFinanceReadModels = vi.fn();
const executeAuthenticatedCanonicalCommand = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModels(...args),
  queryAdminCourseReadModels: (...args: unknown[]) => queryAdminCourseReadModels(...args),
  queryAdminFinanceReadModels: (...args: unknown[]) => queryAdminFinanceReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

vi.mock('../../src/features/admin/courses/adminCoursesRevisionCoordinator', () => ({
  registerAdminCoursesRevisionListener: () => () => {},
  registerAdminCoursesRevisionFromCommand: vi.fn(),
  resetAdminCoursesRevisionCoordinatorForTests: vi.fn(),
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

const timestamp = { seconds: 1_788_000_000, nanoseconds: 0 };
const rosterItem = {
  enrollmentId: 'course_enrollment_admin_component_01',
  revision: 4,
  course: {
    courseId: 'course_admin_component_01',
    title: 'Canonical Avalanche Course',
    lifecycle: 'active',
    revision: 7,
  },
  participant: {
    participantId: 'participant_admin_component_01',
    displayName: 'Canonical Participant',
  },
  payer: {
    accountId: 'account_admin_component_payer_01',
    displayName: 'Canonical Payer',
  },
  lifecycleStatus: 'pending_cancellation',
  guestState: 'not_guest',
  payment: {
    paymentId: 'payment_admin_component_01',
    status: 'partially_paid',
    revision: 3,
    price: 25_000,
    paid: 10_000,
    refunded: 0,
    retained: 10_000,
    settled: 10_000,
    writtenOff: 0,
    outstanding: 15_000,
  },
  relatedIssues: [],
  authorizedActions: {
    canResolveCancellation: true,
    canTransfer: false,
    canReconcile: false,
    canResolveAttendanceOutcome: false,
    canCancelUnpaidGuest: false,
    canApproveGuest: false,
    canLinkGuest: false,
    canWithdraw: false,
    canRecordPayment: false,
  },
  updatedAt: timestamp,
};

const detail = {
  ...rosterItem,
  originalCourseId: rosterItem.course.courseId,
  paymentId: rosterItem.payment.paymentId,
  payerAccountId: rosterItem.payer.accountId,
  capacity: { totalSeats: 8, availableSeats: 3, seatHeldByEnrollment: true },
  cancellation: {
    requestedAt: timestamp,
    maximumRefund: 10_000,
    refundDestination: 'wallet',
  },
  transfer: { eligible: false, blockedReason: 'lifecycle', targetOptions: [] },
  reconciliation: { eligible: false, evidenceIssueIds: [] },
  attendanceDays: [
    {
      courseDayId: 'course_day_admin_component_01',
      startsAt: timestamp,
      endsAt: { seconds: timestamp.seconds + 3600, nanoseconds: 0 },
      instructorIds: ['instructor_admin_component_01'],
      attendanceId: 'attendance_admin_component_01',
      attendanceStatus: 'present',
      attendanceRevision: 2,
      recordedBy: { kind: 'instructor', instructorId: 'instructor_admin_component_01' },
      recordedAt: timestamp,
      lastChangedBy: { kind: 'instructor', instructorId: 'instructor_admin_component_01' },
      updatedAt: timestamp,
      authorizedActions: {
        canRecordPresent: false,
        canRecordAbsent: true,
        reasonRequired: true,
      },
    },
  ],
  auditContext: {
    bookingOrigin: 'admin',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
};

const course = {
  courseId: rosterItem.course.courseId,
  title: rosterItem.course.title,
  lifecycle: 'active',
  price: 25_000,
  capacity: { totalSeats: 8, availableSeats: 3, occupiedConfirmedSeats: 5 },
  revision: 7,
  scheduleRevision: 2,
  instructorRosterIds: ['instructor_admin_component_01'],
  instructors: [{ instructorId: 'instructor_admin_component_01', name: 'Canonical Instructor' }],
  courseDays: [],
  activeEnrollmentCount: 5,
  totalEnrollmentCount: 6,
  provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
  catalogContent: { status: 'missing' },
  authorizedActions: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('AdminCourseEnrollmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) =>
      input.scope === 'admin_enrollment_detail'
        ? { scope: 'admin_enrollment_detail', item: detail }
        : { scope: input.scope, items: [rosterItem], hasMore: false }
    );
    queryAdminCourseReadModels.mockImplementation(async (input) =>
      input.scope === 'admin_course_detail'
        ? { scope: 'admin_course_detail', item: course }
        : { scope: 'admin_course_list', items: [course] }
    );
    queryAdminFinanceReadModels.mockResolvedValue({
      scope: 'admin_payment_detail',
      item: {},
    });
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'resolve_course_enrollment_cancellation',
      correlationId: 'correlation_admin_component_01',
    });
  });

  it('renders only the canonical enrollment projection, not legacy booking rows', async () => {
    render(
      <MemoryRouter>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect((await screen.findAllByText('Canonical Participant')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Canonical Avalanche Course/).length).toBeGreaterThan(0);
    expect(screen.queryByText('course_legacy_booking_row')).not.toBeInTheDocument();
    expect(queryAdminCourseEnrollmentReadModels).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'admin_course_roster' })
    );
  });

  it('captures exact revisions and whole-KZT refund before confirmation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('heading', { name: 'Canonical Participant' })
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Canonical Instructor')).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Action reason'), 'Approve canonical cancellation');
    const refund = screen.getByRole('spinbutton', { name: /Refund/ });
    await user.clear(refund);
    await user.type(refund, '5000');
    await user.click(screen.getByRole('button', { name: 'Approve cancellation' }));
    expect(screen.getByText(/course_enrollment_admin_component_01 @ rev 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'resolve_course_enrollment_cancellation',
      expectedRevision: 4,
      intent: {
        courseEnrollmentId: 'course_enrollment_admin_component_01',
        decision: 'approve',
        refundAmount: 5000,
        reasonExplanation: 'Approve canonical cancellation',
      },
    });
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].idempotencyKey).toMatch(
      /^admin_course_enrollment:resolve_course_enrollment_cancellation:/
    );
    await waitFor(() =>
      expect(
        queryAdminCourseReadModels.mock.calls.filter(
          ([input]) => input.scope === 'admin_course_list'
        )
      ).toHaveLength(2)
    );
  });

  it('keeps pending guest approval fail-closed and shows why linking is unavailable', async () => {
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const guest = {
        ...rosterItem,
        lifecycleStatus: 'pending',
        guestState: 'pending_unlinked',
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...guest,
              cancellation: undefined,
              authorizedActions: guest.authorizedActions,
              guestIdentityLinkUnavailableReason: 'ineligible_lifecycle',
            },
          }
        : { scope: input.scope, items: [guest], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Guest identity linking is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve guest/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link guest identity' })).not.toBeInTheDocument();
  });

  it('offers zero-refund cancellation only for a server-authorized unpaid pending guest', async () => {
    const user = userEvent.setup();
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const guest = {
        ...rosterItem,
        lifecycleStatus: 'pending',
        guestState: 'pending_unlinked',
        payment: {
          ...rosterItem.payment,
          status: 'unpaid',
          paid: 0,
          retained: 0,
          settled: 0,
          outstanding: rosterItem.payment.price,
        },
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canCancelUnpaidGuest: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...guest,
              cancellation: undefined,
              authorizedActions: guest.authorizedActions,
            },
          }
        : { scope: input.scope, items: [guest], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );

    const cancel = await screen.findByRole('button', { name: 'Cancel unpaid guest enrollment' });
    expect(cancel).toBeDisabled();
    await user.type(screen.getByLabelText('Action reason'), 'Reservation remains unpaid');
    await user.click(cancel);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'resolve_course_enrollment_cancellation',
      expectedRevision: 4,
      intent: {
        courseEnrollmentId: 'course_enrollment_admin_component_01',
        decision: 'direct_cancel',
        refundAmount: 0,
        reasonExplanation: 'Reservation remains unpaid',
      },
    });
  });

  it('locks Admin guest identity linking to the captured enrollment revision', async () => {
    const user = userEvent.setup();
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const guest = {
        ...rosterItem,
        lifecycleStatus: 'pending',
        guestState: 'pending_unlinked',
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canLinkGuest: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...guest,
              cancellation: undefined,
              authorizedActions: guest.authorizedActions,
            },
          }
        : { scope: input.scope, items: [guest], hasMore: false };
    });
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'link_guest_course_enrollment_to_account_as_administrator',
      correlationId: 'correlation_admin_component_link_01',
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Link guest identity' })).toBeDisabled();
    await user.click(screen.getAllByRole('button', { name: 'pick managed' }).at(-1)!);
    await user.type(screen.getByLabelText('Link reason'), 'Existing managed identity');
    await user.click(screen.getByRole('button', { name: 'Link guest identity' }));
    expect(
      screen.getByText(
        /course_enrollment_admin_component_01 @ rev 4 → account_link_target_01\/participant_link_target_01/
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'link_guest_course_enrollment_to_account_as_administrator',
      expectedRevision: 4,
      intent: {
        enrollmentId: 'course_enrollment_admin_component_01',
        targetAccountId: 'account_link_target_01',
        targetParticipantId: 'participant_link_target_01',
        reasonExplanation: 'Existing managed identity',
      },
    });
  });

  it('captures CourseDay Attendance and Enrollment revisions for an Admin correction', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByText('Attendance')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Action reason'), 'Correct instructor evidence');
    await user.click(screen.getByRole('button', { name: 'Record absent' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'record_course_day_attendance',
      expectedRevision: 4,
      administratorContext: true,
      intent: {
        courseEnrollmentId: 'course_enrollment_admin_component_01',
        courseDayId: 'course_day_admin_component_01',
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 2,
        expectedEnrollmentRevision: 4,
        reasonExplanation: 'Correct instructor evidence',
      },
    });
  });

  it('does not merge a terminal detail back into a refreshed active roster', async () => {
    const selectedEnrollmentId = rosterItem.enrollmentId;
    const { result } = renderHook(() =>
      useAdminCourseEnrollmentReadModels({
        view: 'roster',
        selectedEnrollmentId,
      })
    );
    await waitFor(() => expect(result.current.list.items).toHaveLength(1));

    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) =>
      input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              revision: 5,
              lifecycleStatus: 'cancelled',
              authorizedActions: {
                ...detail.authorizedActions,
                canResolveCancellation: false,
              },
            },
          }
        : { scope: input.scope, items: [], hasMore: false }
    );
    await act(async () => {
      await result.current.refreshList();
      await result.current.refreshEnrollment(selectedEnrollmentId);
    });

    expect(result.current.list.items).toEqual([]);
    expect(result.current.detail.item?.lifecycleStatus).toBe('cancelled');
  });

  it('offers Accept payment for an unpaid enrollment and uses the Payment revision', async () => {
    const user = userEvent.setup();
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const unpaid = {
        ...rosterItem,
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canRecordPayment: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...unpaid,
              cancellation: undefined,
              authorizedActions: unpaid.authorizedActions,
            },
          }
        : { scope: input.scope, items: [unpaid], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Accept payment' })).toBeVisible();
    const amount = screen.getByLabelText('Amount, KZT');
    expect(amount).toHaveValue(15_000);
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(screen.getByRole('button', { name: 'Accept payment' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'record_provider_payment_event',
      expectedRevision: 3,
      intent: expect.objectContaining({
        paymentId: rosterItem.payment.paymentId,
        amount: 5_000,
        sourceKind: 'cash',
      }),
    });
  });

  it('shows client balance and Debit from balance for a linked unpaid enrollment', async () => {
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const unpaid = {
        ...rosterItem,
        payment: {
          ...rosterItem.payment,
          payerWalletBalance: 40_000,
        },
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canRecordPayment: true,
          canPayFromWallet: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...unpaid,
              cancellation: undefined,
              authorizedActions: unpaid.authorizedActions,
            },
          }
        : { scope: input.scope, items: [unpaid], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Accept payment' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Debit from balance' })).toBeEnabled();
    expect(screen.getByText(/Client balance/)).toBeVisible();
  });

  it('disables Debit from balance when the linked client balance is insufficient', async () => {
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const unpaid = {
        ...rosterItem,
        payment: {
          ...rosterItem.payment,
          payerWalletBalance: 1_000,
        },
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canRecordPayment: true,
          canPayFromWallet: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...unpaid,
              cancellation: undefined,
              authorizedActions: unpaid.authorizedActions,
            },
          }
        : { scope: input.scope, items: [unpaid], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Accept payment' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Debit from balance' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Insufficient client balance for this payment.'
    );
  });

  it('submits pay_service_from_wallet_as_administrator for a linked unpaid enrollment', async () => {
    const user = userEvent.setup();
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const unpaid = {
        ...rosterItem,
        payment: {
          ...rosterItem.payment,
          payerWalletBalance: 40_000,
        },
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canRecordPayment: true,
          canPayFromWallet: true,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...unpaid,
              cancellation: undefined,
              authorizedActions: unpaid.authorizedActions,
            },
          }
        : { scope: input.scope, items: [unpaid], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Debit from balance' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'pay_service_from_wallet_as_administrator',
      intent: {
        subjectKind: 'course_enrollment',
        enrollmentId: rosterItem.enrollmentId,
      },
    });
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent).not.toHaveProperty(
      'amount'
    );
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).not.toHaveProperty(
      'expectedRevision'
    );
  });

  it('hides Accept payment when the server does not authorize capture', async () => {
    queryAdminCourseEnrollmentReadModels.mockImplementation(async (input) => {
      const paid = {
        ...rosterItem,
        payment: { ...rosterItem.payment, status: 'paid', outstanding: 0, paid: 25_000 },
        authorizedActions: {
          ...rosterItem.authorizedActions,
          canResolveCancellation: false,
          canRecordPayment: false,
        },
      };
      return input.scope === 'admin_enrollment_detail'
        ? {
            scope: 'admin_enrollment_detail',
            item: {
              ...detail,
              ...paid,
              cancellation: undefined,
              authorizedActions: paid.authorizedActions,
            },
          }
        : { scope: input.scope, items: [paid], hasMore: false };
    });
    render(
      <MemoryRouter initialEntries={['/?enrollment=course_enrollment_admin_component_01']}>
        <AdminCourseEnrollmentPanel adminAccountId="account_admin_component_01" />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('heading', { name: 'Canonical Participant' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept payment' })).not.toBeInTheDocument();
  });
});
