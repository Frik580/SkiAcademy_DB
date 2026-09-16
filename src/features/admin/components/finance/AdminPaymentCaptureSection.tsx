import { ActionButton } from '../../../../ui/ActionButton';

export type AdminPaymentCapturePendingAction = 'cash' | 'wallet';

export function AdminPaymentCaptureSection({
  canRecordPayment,
  canPayFromWallet = false,
  amount,
  outstanding,
  walletBalance,
  onAmountChange,
  onRecord,
  onPayFromWallet,
  amountLabel,
  recordLabel,
  payFromWalletLabel,
  clientBalanceLabel,
  insufficientFundsLabel,
  submittingLabel,
  formatAmount,
  inputId,
  pendingAction,
}: {
  readonly canRecordPayment: boolean;
  readonly canPayFromWallet?: boolean;
  readonly amount: string;
  readonly outstanding: number;
  readonly walletBalance?: number;
  readonly onAmountChange: (value: string) => void;
  readonly onRecord: () => void;
  readonly onPayFromWallet?: () => void;
  readonly amountLabel: string;
  readonly recordLabel: string;
  readonly payFromWalletLabel?: string;
  readonly clientBalanceLabel?: string;
  readonly insufficientFundsLabel?: string;
  readonly submittingLabel?: string;
  readonly formatAmount: (value: number) => string;
  readonly inputId: string;
  readonly pendingAction?: AdminPaymentCapturePendingAction;
}) {
  if (!canRecordPayment && !canPayFromWallet) return null;
  const parsed = Number(amount);
  const validCash = Number.isInteger(parsed) && parsed >= 1 && parsed <= outstanding;
  const paymentBusy = pendingAction !== undefined;
  const insufficientFunds =
    canPayFromWallet && (walletBalance === undefined || walletBalance < outstanding);
  const walletEnabled = canPayFromWallet && !insufficientFunds && !paymentBusy;

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-3">
      {canPayFromWallet && clientBalanceLabel !== undefined && walletBalance !== undefined ? (
        <p className="text-xs">
          <span className="text-[var(--ink-dim)]">{clientBalanceLabel}: </span>
          <span className="tabular-nums">{formatAmount(walletBalance)}</span>
        </p>
      ) : null}
      {canPayFromWallet && insufficientFunds && insufficientFundsLabel ? (
        <p role="status" className="text-xs text-amber-700">
          {insufficientFundsLabel}
        </p>
      ) : null}
      {canRecordPayment ? (
        <label htmlFor={inputId} className="block text-xs">
          {amountLabel}
          <input
            id={inputId}
            aria-label={amountLabel}
            type="number"
            inputMode="numeric"
            min="1"
            max={outstanding}
            step="1"
            value={amount}
            disabled={paymentBusy}
            onChange={(event) => onAmountChange(event.target.value)}
            className="mt-1 w-full border border-[var(--border)] bg-transparent p-2 tabular-nums"
          />
        </label>
      ) : null}
      <div className="space-y-2">
        {canRecordPayment ? (
          <ActionButton
            type="button"
            unstyled
            disabled={!validCash || paymentBusy}
            pending={pendingAction === 'cash'}
            pendingLabel={submittingLabel ?? recordLabel}
            onClick={onRecord}
            className="w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] disabled:opacity-50"
          >
            {recordLabel}
          </ActionButton>
        ) : null}
        {canPayFromWallet && payFromWalletLabel && onPayFromWallet ? (
          <ActionButton
            type="button"
            unstyled
            disabled={!walletEnabled}
            pending={pendingAction === 'wallet'}
            pendingLabel={submittingLabel ?? payFromWalletLabel}
            onClick={onPayFromWallet}
            className="w-full border border-[var(--ink)] px-3 py-2 text-xs disabled:opacity-50"
          >
            {payFromWalletLabel}
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
