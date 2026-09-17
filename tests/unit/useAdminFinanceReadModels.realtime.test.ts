import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountIdSchema, PaymentIdSchema, type CommandResult } from '@ski-academy/shared-domain';

const queryMock = vi.fn();
const registerListenerMock = vi.fn();
const unregisterMock = vi.fn();
const registerFromCommandMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminFinanceReadModels: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../src/features/admin/finance/subscribeAdminFinanceRevision', () => ({
  subscribeAdminFinanceRevision: vi.fn(),
}));

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: (...args: unknown[]) => registerListenerMock(...args),
  registerAdminFinanceRevisionFromCommand: (...args: unknown[]) => registerFromCommandMock(...args),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
}));

import { applyAdminFinanceCommandResult } from '../../src/features/admin/finance/adminFinanceLocalSync';
import { useAdminGuestFundsReadModel } from '../../src/features/admin/finance/useAdminGuestFundsReadModel';
import {
  useAdminFinancialOverviewReadModel,
  useAdminPaymentReadModel,
  useAdminWalletReadModel,
} from '../../src/features/admin/components/finance/useAdminFinanceReadModels';

const accountId = AccountIdSchema.parse('account_admin_finance_realtime_01');
const paymentId = PaymentIdSchema.parse('payment_admin_finance_realtime_01');

describe('useAdminFinanceReadModels realtime invalidation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerListenerMock.mockReset();
    unregisterMock.mockReset();
    registerFromCommandMock.mockReset();
    registerListenerMock.mockImplementation(() => unregisterMock);
  });

  it('does not refresh on the initial revision snapshot, then refreshes the mounted wallet once', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_wallet',
      item: { accountId, events: [], hasMore: false },
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() => useAdminWalletReadModel(accountId));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));
    expect(queryMock.mock.calls[0]?.[0]).toMatchObject({
      scope: 'admin_wallet',
      accountId,
    });

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({
      scope: 'admin_wallet',
      accountId,
    });
  });

  it('does not subscribe for an empty wallet or payment target', async () => {
    renderHook(() => useAdminWalletReadModel(undefined));
    renderHook(() => useAdminPaymentReadModel(undefined));
    expect(registerListenerMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('unsubscribes wallet, payment, overview, and guest-funds consumers on unmount', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_financial_overview',
      item: { period: 'day' },
    });
    const overview = renderHook(() =>
      useAdminFinancialOverviewReadModel({
        period: 'day',
        localDate: '2026-09-17',
        timeZone: 'Asia/Almaty',
      })
    );
    queryMock.mockResolvedValue({
      scope: 'admin_guest_funds',
      item: { filter: 'all', items: [], hasMore: false },
    });
    const guestFunds = renderHook(() => useAdminGuestFundsReadModel('all'));
    queryMock.mockResolvedValue({
      scope: 'admin_wallet',
      item: { accountId, events: [], hasMore: false },
    });
    const wallet = renderHook(() => useAdminWalletReadModel(accountId));
    queryMock.mockResolvedValue({
      scope: 'admin_payment_detail',
      item: { paymentId, events: [], hasMore: false },
    });
    const payment = renderHook(() => useAdminPaymentReadModel(paymentId));

    await waitFor(() => expect(registerListenerMock).toHaveBeenCalledTimes(4));
    overview.unmount();
    guestFunds.unmount();
    wallet.unmount();
    payment.unmount();
    expect(unregisterMock).toHaveBeenCalledTimes(4);
  });

  it('refreshes only the mounted payment detail after a later invalidation', async () => {
    queryMock.mockResolvedValue({
      scope: 'admin_payment_detail',
      item: { paymentId, events: [], hasMore: false },
    });
    let emitInvalidation: (() => void) | undefined;
    registerListenerMock.mockImplementation((listener: () => void) => {
      emitInvalidation = listener;
      return unregisterMock;
    });

    renderHook(() => useAdminPaymentReadModel(paymentId));
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(1));

    act(() => {
      emitInvalidation?.();
    });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    expect(queryMock.mock.calls[1]?.[0]).toMatchObject({
      scope: 'admin_payment_detail',
      paymentId,
    });
  });

  it('registers revision from command result for same-client suppression', () => {
    applyAdminFinanceCommandResult({
      status: 'success',
      kind: 'pay_service_from_wallet_as_administrator',
      correlationId: 'correlation_admin_finance_local_01',
      payload: { adminFinanceRevision: 70 },
    } as CommandResult);
    expect(registerFromCommandMock).toHaveBeenCalledWith(70);
  });

  it('does not register a revision when the command fails', () => {
    applyAdminFinanceCommandResult({
      status: 'error',
      kind: 'pay_service_from_wallet_as_administrator',
      correlationId: 'correlation_admin_finance_local_fail_01',
      error: {
        code: 'insufficient_funds',
        message: 'The wallet has insufficient funds.',
        retryable: false,
        correlationId: 'correlation_admin_finance_local_fail_01',
      },
    });
    expect(registerFromCommandMock).not.toHaveBeenCalled();
  });
});
