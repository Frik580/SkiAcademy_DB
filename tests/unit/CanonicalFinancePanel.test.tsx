import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  PaymentIdSchema,
} from '@ski-academy/shared-domain';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const { mockQueryFinance, mockExecuteCommand } = vi.hoisted(() => ({
  mockQueryFinance: vi.fn(),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminFinanceReadModels: mockQueryFinance,
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: mockExecuteCommand,
}));

import { CanonicalFinancePanel } from '../../src/features/admin/components/finance/CanonicalFinancePanel';

const accountId = AccountIdSchema.parse('account_admin_finance_component_01');
const paymentA = PaymentIdSchema.parse('payment_admin_finance_component_a');
const paymentB = PaymentIdSchema.parse('payment_admin_finance_component_b');
const timestamp = CanonicalTimestampSchema.parse({ seconds: 1_767_225_600, nanoseconds: 0 });

function walletResult(revision = 2) {
  return {
    scope: 'admin_wallet' as const,
    item: {
      accountId,
      accountIdentity: { accountId, displayName: 'Ada', email: 'ada@example.com' },
      accountStatus: 'active' as const,
      exists: true,
      balance: 10_000,
      currency: 'KZT' as const,
      revision: AggregateRevisionSchema.parse(revision),
      eventRevision: AggregateRevisionSchema.parse(revision),
      updatedAt: timestamp,
      allowedActions: [
        {
          kind: 'record_manual_wallet_funding' as const,
          expectedWalletRevision: AggregateRevisionSchema.parse(revision),
        },
      ],
      events: [],
      hasMore: false,
    },
  };
}

function paymentResult(paymentId: typeof paymentA, subjectId: string, revision: number) {
  const aggregateRevision = AggregateRevisionSchema.parse(revision);
  return {
    scope: 'admin_payment_detail' as const,
    item: {
      paymentId,
      subjectType: 'booking' as const,
      subjectId,
      currency: 'KZT' as const,
      originalPrice: 25_000,
      price: 25_000,
      paidAmount: 10_000,
      refundedAmount: 0,
      retainedAmount: 10_000,
      settledAmount: 10_000,
      writtenOffAmount: 0,
      outstandingAmount: 15_000,
      paymentStatus: 'partially_paid' as const,
      revision: aggregateRevision,
      eventRevision: aggregateRevision,
      relatedIssues: [
        {
          issueId: 'admin_issue_finance_component_01',
          kind: 'financial_reconciliation_mismatch' as const,
          lifecycleStatus: 'open' as const,
          revision: aggregateRevision,
          financeActionAvailable: true,
        },
      ],
      allowedActions: [
        {
          kind: 'write_off' as const,
          adminIssueId: 'admin_issue_finance_component_01',
          expectedAdminIssueRevision: aggregateRevision,
          expectedPaymentRevision: aggregateRevision,
          maximumAmount: 15_000,
          requiresReason: true as const,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
      hasMore: false,
    },
  };
}

describe('CanonicalFinancePanel manual funding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryFinance.mockImplementation(async (input: { scope: string }) =>
      input.scope === 'admin_wallet'
        ? walletResult(mockQueryFinance.mock.calls.length > 1 ? 3 : 2)
        : { scope: 'admin_payment_detail' }
    );
  });

  it('submits exact whole-KZT canonical units and refetches server state', async () => {
    mockExecuteCommand.mockResolvedValue({ status: 'success' });
    const onRequestConfirm = vi.fn((_message: string, action: () => Promise<void>) => action());
    render(
      <MemoryRouter initialEntries={[`/admin?account=${accountId}`]}>
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[{ uid: accountId, displayName: 'Ada', email: 'ada@example.com' }]}
          onRequestConfirm={onRequestConfirm}
        />
      </MemoryRouter>
    );

    await screen.findByText('Ada');
    await userEvent.type(screen.getByLabelText('adminFinanceAmountKzt'), '12550');
    await userEvent.type(screen.getByLabelText('adminFinanceReason'), 'Cash desk receipt 42');
    await userEvent.click(screen.getByRole('button', { name: 'adminFinanceFundWallet' }));

    await waitFor(() => expect(mockExecuteCommand).toHaveBeenCalledTimes(1));
    const submission = mockExecuteCommand.mock.calls[0]?.[1];
    expect(submission).toMatchObject({
      kind: 'record_manual_wallet_funding',
      expectedRevision: 2,
      intent: {
        accountId,
        amount: 12_550,
        reasonExplanation: 'Cash desk receipt 42',
      },
    });
    expect(submission.idempotencyKey).toMatch(/^admin_finance:manual_wallet_funding:/);
    await waitFor(() => expect(mockQueryFinance.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText('adminFinanceFundingSuccess')).toBeInTheDocument();
  });

  it('reuses the same attempt identity for an explicitly retryable retry', async () => {
    mockExecuteCommand
      .mockRejectedValueOnce(
        new CanonicalCommandClientError('internal', {
          correlationId: 'correlation_retryable_admin_finance',
          retryable: true,
        })
      )
      .mockResolvedValueOnce({ status: 'success' });
    const onRequestConfirm = vi.fn((_message: string, action: () => Promise<void>) => action());
    render(
      <MemoryRouter initialEntries={[`/admin?account=${accountId}`]}>
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={onRequestConfirm}
        />
      </MemoryRouter>
    );

    await screen.findByText('Ada');
    await userEvent.type(screen.getByLabelText('adminFinanceAmountKzt'), '10');
    await userEvent.type(screen.getByLabelText('adminFinanceReason'), 'Receipt retry');
    await userEvent.click(screen.getByRole('button', { name: 'adminFinanceFundWallet' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'adminFinanceRetrySameAction' })
    );

    await waitFor(() => expect(mockExecuteCommand).toHaveBeenCalledTimes(2));
    expect(mockExecuteCommand.mock.calls[1]?.[1].idempotencyKey).toBe(
      mockExecuteCommand.mock.calls[0]?.[1].idempotencyKey
    );
  });

  it('keeps a confirmed correction bound to its original Payment target', async () => {
    mockQueryFinance.mockImplementation(async (input: { scope: string; paymentId?: string }) =>
      input.scope === 'admin_wallet'
        ? walletResult()
        : input.paymentId === paymentA
          ? paymentResult(paymentA, 'booking_subject_a', 4)
          : paymentResult(paymentB, 'booking_subject_b', 9)
    );
    mockExecuteCommand.mockResolvedValue({ status: 'success' });
    let confirmedAction: (() => Promise<void>) | undefined;
    const onRequestConfirm = vi.fn((_message: string, action: () => Promise<void>) => {
      confirmedAction = action;
    });
    render(
      <MemoryRouter initialEntries={[`/admin?payment=${paymentA}`]}>
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={onRequestConfirm}
        />
      </MemoryRouter>
    );

    await screen.findByText(/booking_subject_a/);
    await userEvent.type(screen.getByLabelText('adminFinanceAmountKzt'), '1000');
    await userEvent.type(screen.getByLabelText('adminFinanceReason'), 'Approved write-off');
    await userEvent.click(screen.getByRole('button', { name: 'adminFinanceApplyCorrection' }));
    expect(confirmedAction).toBeTypeOf('function');

    const paymentInput = screen.getByLabelText('adminFinancePaymentId');
    await userEvent.clear(paymentInput);
    await userEvent.type(paymentInput, `${paymentB}{enter}`);
    await screen.findByText(/booking_subject_b/);
    await act(async () => confirmedAction!());

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'account_admin_actor_01',
      expect.objectContaining({
        kind: 'record_financial_correction',
        expectedRevision: 4,
        intent: expect.objectContaining({ paymentId: paymentA, expectedPaymentRevision: 4 }),
      })
    );
  });
});
