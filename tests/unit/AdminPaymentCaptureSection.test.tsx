import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPaymentCaptureSection } from '../../src/features/admin/components/finance/AdminPaymentCaptureSection';

function renderSection(overrides: Partial<Parameters<typeof AdminPaymentCaptureSection>[0]> = {}) {
  const onRecord = vi.fn();
  const onPayFromWallet = vi.fn();
  const onAmountChange = vi.fn();
  render(
    <AdminPaymentCaptureSection
      canRecordPayment
      canPayFromWallet
      amount="60000"
      outstanding={60_000}
      walletBalance={80_000}
      onAmountChange={onAmountChange}
      onRecord={onRecord}
      onPayFromWallet={onPayFromWallet}
      amountLabel="Amount, KZT"
      recordLabel="Зафиксировать оплату"
      payFromWalletLabel="Списать с баланса"
      clientBalanceLabel="Баланс клиента"
      insufficientFundsLabel="Недостаточно средств на балансе клиента."
      submittingLabel="Submitting…"
      formatAmount={(value) => String(value)}
      inputId="admin-payment-capture-test"
      {...overrides}
    />
  );
  return { onRecord, onPayFromWallet, onAmountChange };
}

describe('AdminPaymentCaptureSection', () => {
  it('shows required amount, client balance, and both payment methods for a linked resource', () => {
    renderSection();
    expect(screen.getByLabelText('Amount, KZT')).toHaveValue(60_000);
    expect(screen.getByText(/Баланс клиента/)).toBeVisible();
    expect(screen.getByText('80000')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Зафиксировать оплату' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Списать с баланса' })).toBeEnabled();
  });

  it('hides wallet payment when no registered account is linked', () => {
    renderSection({
      canPayFromWallet: false,
      walletBalance: undefined,
      onPayFromWallet: undefined,
    });
    expect(screen.getByRole('button', { name: 'Зафиксировать оплату' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Списать с баланса' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Баланс клиента/)).not.toBeInTheDocument();
  });

  it('disables wallet payment for insufficient funds and keeps cash capture available', () => {
    renderSection({ walletBalance: 10_000 });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Недостаточно средств на балансе клиента.'
    );
    expect(screen.getByRole('button', { name: 'Списать с баланса' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Зафиксировать оплату' })).toBeEnabled();
  });

  it('disables both actions while wallet payment is pending', () => {
    renderSection({ pendingAction: 'wallet' });
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Зафиксировать оплату' })).toBeDisabled();
  });

  it('invokes only the selected payment action', () => {
    const { onRecord, onPayFromWallet } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Списать с баланса' }));
    expect(onPayFromWallet).toHaveBeenCalledTimes(1);
    expect(onRecord).not.toHaveBeenCalled();
  });
});
