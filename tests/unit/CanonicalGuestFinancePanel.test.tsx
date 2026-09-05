import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGuestFundsDiscoveryRow } from '@ski-academy/shared-domain';

const { mockRead, mockSetSearchParams } = vi.hoisted(() => ({
  mockRead: {
    item: undefined as
      | {
          filter: string;
          items: AdminGuestFundsDiscoveryRow[];
          hasMore: boolean;
          nextCursor?: string;
        }
      | undefined,
    loading: false,
    loadingMore: false,
    error: undefined as 'permission-denied' | 'read-failed' | undefined,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  },
  mockSetSearchParams: vi.fn(),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
  };
});

vi.mock('../../src/features/admin/finance/useAdminGuestFundsReadModel', () => ({
  useAdminGuestFundsReadModel: () => mockRead,
}));

import { CanonicalGuestFinancePanel } from '../../src/features/admin/finance/CanonicalGuestFinancePanel';

function row(
  overrides: Partial<AdminGuestFundsDiscoveryRow> &
    Pick<AdminGuestFundsDiscoveryRow, 'rowId' | 'linkState' | 'service'>
): AdminGuestFundsDiscoveryRow {
  return {
    origin: 'guest',
    updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    guestDisplayName: 'Ivan Guest',
    paymentId: 'payment_guest_funds_ui_01',
    paymentStatus: 'partially_paid',
    currency: 'KZT',
    price: 60_000,
    paidAmount: 20_000,
    outstandingAmount: 40_000,
    ...overrides,
  };
}

describe('CanonicalGuestFinancePanel discovery UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.loading = false;
    mockRead.loadingMore = false;
    mockRead.error = undefined;
    mockRead.item = {
      filter: 'all',
      hasMore: true,
      nextCursor: 'cursor_1',
      items: [
        row({
          rowId: 'booking:booking_guest_funds_ui_01',
          linkState: 'unlinked',
          service: {
            subjectKind: 'booking',
            bookingId: 'booking_guest_funds_ui_01',
            startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
            timeZone: 'Asia/Almaty',
          },
        }),
        row({
          rowId: 'booking:booking_guest_funds_ui_02',
          linkState: 'linked',
          guestDisplayName: 'Linked Guest',
          paymentId: 'payment_guest_funds_ui_02',
          payer: { accountId: 'account_linked_ui_01', displayName: 'Payer One' },
          paymentStatus: 'paid',
          price: 50_000,
          paidAmount: 50_000,
          outstandingAmount: 0,
          service: {
            subjectKind: 'booking',
            bookingId: 'booking_guest_funds_ui_02',
            startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
            timeZone: 'Asia/Almaty',
          },
        }),
        row({
          rowId: 'course_enrollment:enrollment_guest_funds_ui_01',
          linkState: 'unlinked',
          guestDisplayName: 'Course Guest',
          paymentStatus: 'unpaid',
          price: 90_000,
          paidAmount: 0,
          outstandingAmount: 90_000,
          service: {
            subjectKind: 'course_enrollment',
            enrollmentId: 'enrollment_guest_funds_ui_01',
            courseId: 'course_1',
            courseTitle: 'Kids Camp',
          },
        }),
      ],
    };
  });

  it('renders KZT price/paid/outstanding separately and never USD till', () => {
    const { container } = render(<CanonicalGuestFinancePanel />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/canonicalGuestFundsPrice:\s*60[,.\u00a0\s]?000\s*₸/);
    expect(text).toMatch(/canonicalGuestFundsPaid:\s*20[,.\u00a0\s]?000\s*₸/);
    expect(text).toMatch(/canonicalGuestFundsOutstanding:\s*40[,.\u00a0\s]?000\s*₸/);
    expect(text).not.toMatch(/\$\d|balanceUSD|GuestWalletPanel/);
    expect(screen.getAllByText('canonicalGuestFinanceUnlinked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('canonicalGuestFinanceLinked').length).toBeGreaterThan(0);
  });

  it('opens Payment without inventing Wallet for unlinked rows', async () => {
    render(<CanonicalGuestFinancePanel />);
    const openButtons = screen.getAllByRole('button', {
      name: 'canonicalGuestFundsOpenPayment',
    });
    await userEvent.click(openButtons[0]!);
    expect(mockSetSearchParams).toHaveBeenCalled();
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const next = updater(new URLSearchParams());
    expect(next.get('tab')).toBe('finance');
    expect(next.get('payment')).toBe('payment_guest_funds_ui_01');
    expect(next.get('account')).toBeNull();
  });

  it('opens Payment with Account context for linked payer rows', async () => {
    render(<CanonicalGuestFinancePanel />);
    const openButtons = screen.getAllByRole('button', {
      name: 'canonicalGuestFundsOpenPayment',
    });
    await userEvent.click(openButtons[1]!);
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const next = updater(new URLSearchParams());
    expect(next.get('payment')).toBe('payment_guest_funds_ui_02');
    expect(next.get('account')).toBe('account_linked_ui_01');
  });

  it('does not invent Wallet context for unlinked rows even if payer exists', async () => {
    mockRead.item = {
      filter: 'all',
      hasMore: false,
      items: [
        row({
          rowId: 'booking:booking_guest_funds_ui_payer_only',
          linkState: 'unlinked',
          payer: { accountId: 'account_should_not_open', displayName: 'Stray Payer' },
          service: {
            subjectKind: 'booking',
            bookingId: 'booking_guest_funds_ui_payer_only',
            startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
            timeZone: 'Asia/Almaty',
          },
        }),
      ],
    };
    render(<CanonicalGuestFinancePanel />);
    await userEvent.click(screen.getByRole('button', { name: 'canonicalGuestFundsOpenPayment' }));
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const next = updater(new URLSearchParams('account=account_old'));
    expect(next.get('payment')).toBe('payment_guest_funds_ui_01');
    expect(next.get('account')).toBeNull();
  });

  it('opens Lesson Admin and Enrollment without mutation controls', async () => {
    render(<CanonicalGuestFinancePanel />);
    expect(screen.queryByText(/record_financial_correction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fund wallet/i)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'canonicalGuestFundsOpenLesson' })[0]!
    );
    let updater = mockSetSearchParams.mock.calls.at(-1)?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    let next = updater(new URLSearchParams());
    expect(next.get('tab')).toBe('operations');
    expect(next.get('booking')).toBe('booking_guest_funds_ui_01');

    await userEvent.click(
      screen.getByRole('button', { name: 'canonicalGuestFundsOpenEnrollment' })
    );
    updater = mockSetSearchParams.mock.calls.at(-1)?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    next = updater(new URLSearchParams());
    expect(next.get('enrollment')).toBe('enrollment_guest_funds_ui_01');
  });

  it('supports load more, empty state, and retry', async () => {
    const { rerender } = render(<CanonicalGuestFinancePanel />);
    await userEvent.click(screen.getByRole('button', { name: 'canonicalGuestFundsLoadMore' }));
    expect(mockRead.loadMore).toHaveBeenCalled();

    mockRead.item = { filter: 'all', items: [], hasMore: false };
    rerender(<CanonicalGuestFinancePanel />);
    expect(screen.getByText('canonicalGuestFundsEmpty')).toBeInTheDocument();

    mockRead.error = 'read-failed';
    mockRead.item = undefined;
    rerender(<CanonicalGuestFinancePanel />);
    await userEvent.click(screen.getByRole('button', { name: 'canonicalGuestFundsRetry' }));
    expect(mockRead.refetch).toHaveBeenCalled();
  });

  it('does not embed a second CanonicalFinancePanel', () => {
    const { container } = render(<CanonicalGuestFinancePanel />);
    expect(container.innerHTML).not.toContain('adminFinanceCanonicalTitle');
    expect(container.innerHTML).not.toContain('adminFinanceFundWallet');
  });
});
