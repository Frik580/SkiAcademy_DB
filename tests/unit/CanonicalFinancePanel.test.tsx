import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
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

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: () => () => {},
  registerAdminFinanceRevisionFromCommand: vi.fn(),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
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
    expect(submission).not.toHaveProperty('requestedTestSessionId');
    expect(submission.intent).not.toHaveProperty('requestedTestSessionId');
    expect(mockQueryFinance.mock.calls[0]?.[0]).not.toHaveProperty('requestedTestSessionId');
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
    fireEvent.change(screen.getByLabelText('adminFinanceAmountKzt'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('adminFinanceReason'), {
      target: { value: 'Approved write-off' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'adminFinanceApplyCorrection' }));
    expect(confirmedAction).toBeTypeOf('function');

    const paymentInput = screen.getByLabelText('adminFinancePaymentId');
    fireEvent.change(paymentInput, {
      target: { value: paymentB },
    });
    const paymentForm = paymentInput.closest('form');
    expect(paymentForm).not.toBeNull();
    fireEvent.submit(paymentForm!);
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

const sessionA = 'test_finance_ctx_a';
const sessionB = 'test_finance_ctx_b';

function namedWallet(displayName: string, balance: number) {
  const result = walletResult();
  return {
    ...result,
    item: {
      ...result.item,
      balance,
      accountIdentity: { ...result.item.accountIdentity, displayName },
    },
  };
}

function unavailableWallet() {
  const result = walletResult();
  return {
    ...result,
    item: {
      ...result.item,
      accountStatus: 'unavailable' as const,
      exists: false,
      balance: 0,
      allowedActions: [],
    },
  };
}

function FinanceUrlControls() {
  const [params, setParams] = useSearchParams();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.delete('testSession');
          setParams(next);
        }}
      >
        drop-test-context
      </button>
      <button
        type="button"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set('testSession', sessionB);
          setParams(next);
        }}
      >
        switch-session-b
      </button>
    </>
  );
}

describe('CanonicalFinancePanel admin test context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a LIVE admin read free of requestedTestSessionId and hides funding', async () => {
    mockQueryFinance.mockResolvedValue(unavailableWallet());
    render(
      <MemoryRouter initialEntries={[`/admin?tab=finance&account=${accountId}`]}>
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('adminFinanceAccountUnavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'adminFinanceFundWallet' })).not.toBeInTheDocument();
    expect(mockQueryFinance.mock.calls[0]?.[0]).toMatchObject({
      scope: 'admin_wallet',
      accountId,
    });
    expect(mockQueryFinance.mock.calls[0]?.[0]).not.toHaveProperty('requestedTestSessionId');
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('sends the explicit test session on read, funding, and the success refresh', async () => {
    mockQueryFinance.mockResolvedValue(namedWallet('Ksuscha', 70_000));
    mockExecuteCommand.mockResolvedValue({ status: 'success' });
    const onRequestConfirm = vi.fn((_message: string, action: () => Promise<void>) => action());
    render(
      <MemoryRouter
        initialEntries={[`/admin?tab=finance&account=${accountId}&testSession=${sessionA}`]}
      >
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={onRequestConfirm}
        />
      </MemoryRouter>
    );

    await screen.findByText('Ksuscha');
    expect(mockQueryFinance.mock.calls[0]?.[0]).toMatchObject({
      scope: 'admin_wallet',
      accountId,
      requestedTestSessionId: sessionA,
    });
    await userEvent.type(screen.getByLabelText('adminFinanceAmountKzt'), '180000');
    await userEvent.type(screen.getByLabelText('adminFinanceReason'), 'Course smoke top-up');
    await userEvent.click(screen.getByRole('button', { name: 'adminFinanceFundWallet' }));

    await waitFor(() => expect(mockExecuteCommand).toHaveBeenCalledTimes(1));
    const submission = mockExecuteCommand.mock.calls[0]?.[1];
    expect(submission).toMatchObject({
      kind: 'record_manual_wallet_funding',
      requestedTestSessionId: sessionA,
      intent: { accountId, amount: 180_000, reasonExplanation: 'Course smoke top-up' },
    });
    expect(submission.intent).not.toHaveProperty('requestedTestSessionId');
    await waitFor(() => expect(mockQueryFinance.mock.calls.length).toBeGreaterThanOrEqual(2));
    for (const call of mockQueryFinance.mock.calls) {
      if (call[0]?.scope === 'admin_wallet') {
        expect(call[0]).toMatchObject({ requestedTestSessionId: sessionA });
      }
    }
  });

  it('clears the TEST wallet when Admin returns to LIVE', async () => {
    let releaseLive: (value: ReturnType<typeof unavailableWallet>) => void = () => {};
    mockQueryFinance.mockImplementation(async (input: { requestedTestSessionId?: string }) => {
      if (input.requestedTestSessionId === sessionA) return namedWallet('Ksuscha', 70_000);
      return new Promise((resolve) => {
        releaseLive = resolve;
      });
    });
    render(
      <MemoryRouter
        initialEntries={[`/admin?tab=finance&account=${accountId}&testSession=${sessionA}`]}
      >
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={vi.fn()}
        />
        <FinanceUrlControls />
      </MemoryRouter>
    );

    await screen.findByText('Ksuscha');
    await userEvent.click(screen.getByRole('button', { name: 'drop-test-context' }));
    await waitFor(() => expect(screen.queryByText('Ksuscha')).not.toBeInTheDocument());
    const liveCall = mockQueryFinance.mock.calls.find(
      (call) => call[0]?.scope === 'admin_wallet' && !('requestedTestSessionId' in call[0])
    );
    expect(liveCall).toBeDefined();
    await act(async () => {
      releaseLive(unavailableWallet());
    });
    expect(await screen.findByText('adminFinanceAccountUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('Ksuscha')).not.toBeInTheDocument();
  });

  it('drops session A wallet before session B resolves', async () => {
    let releaseB: (value: ReturnType<typeof namedWallet>) => void = () => {};
    mockQueryFinance.mockImplementation(async (input: { requestedTestSessionId?: string }) => {
      if (input.requestedTestSessionId === sessionB) {
        return new Promise((resolve) => {
          releaseB = resolve;
        });
      }
      return namedWallet('Session A', 70_000);
    });
    render(
      <MemoryRouter
        initialEntries={[`/admin?tab=finance&account=${accountId}&testSession=${sessionA}`]}
      >
        <CanonicalFinancePanel
          adminAccountId="account_admin_actor_01"
          accounts={[]}
          onRequestConfirm={vi.fn()}
        />
        <FinanceUrlControls />
      </MemoryRouter>
    );

    await screen.findByText('Session A');
    await userEvent.click(screen.getByRole('button', { name: 'switch-session-b' }));
    await waitFor(() => expect(screen.queryByText('Session A')).not.toBeInTheDocument());
    expect(
      mockQueryFinance.mock.calls.some(
        (call) => call[0]?.requestedTestSessionId === sessionB && call[0]?.scope === 'admin_wallet'
      )
    ).toBe(true);
    await act(async () => {
      releaseB(namedWallet('Session B', 10));
    });
    expect(await screen.findByText('Session B')).toBeInTheDocument();
    expect(screen.queryByText('Session A')).not.toBeInTheDocument();
  });

  it('clears TEST finance state when the admin actor changes', async () => {
    let releaseNext: (value: ReturnType<typeof namedWallet>) => void = () => {};
    mockQueryFinance.mockImplementation(async () => namedWallet('Ksuscha', 70_000));
    function Host() {
      const [adminAccountId, setAdminAccountId] = useState('account_admin_actor_01');
      return (
        <MemoryRouter
          initialEntries={[`/admin?tab=finance&account=${accountId}&testSession=${sessionA}`]}
        >
          <button type="button" onClick={() => setAdminAccountId('account_admin_actor_02')}>
            switch-admin
          </button>
          <CanonicalFinancePanel
            adminAccountId={adminAccountId}
            accounts={[]}
            onRequestConfirm={vi.fn()}
          />
        </MemoryRouter>
      );
    }
    render(<Host />);
    await screen.findByText('Ksuscha');
    mockQueryFinance.mockImplementation(
      async () =>
        new Promise((resolve) => {
          releaseNext = resolve;
        })
    );
    await userEvent.click(screen.getByRole('button', { name: 'switch-admin' }));
    await waitFor(() => expect(screen.queryByText('Ksuscha')).not.toBeInTheDocument());
    await act(async () => {
      releaseNext(namedWallet('Next admin view', 70_000));
    });
    expect(await screen.findByText('Next admin view')).toBeInTheDocument();
  });
});
