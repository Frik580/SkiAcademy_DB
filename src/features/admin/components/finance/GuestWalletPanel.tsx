import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { MAX_WALLET_CREDIT_USD } from '../../../../domain/wallet';
import {
  adjustGuestWalletBalance,
  subscribeGuestWalletBalance,
} from '../../../../features/admin/adminService';
import { useNotifications } from '../../../../features/notifications';
import { logger } from '../../../../shared';
import { ActionButton } from '../../../../ui/ActionButton';
import { useAdminFinanceTranslations } from './useAdminFinanceTranslations';

export const GuestWalletPanel: React.FC = () => {
  const { t } = useAdminFinanceTranslations();
  const { formatPrice } = useCurrency();
  const { addNotification } = useNotifications();

  const [balanceUsd, setBalanceUsd] = useState(0);
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState<'top_up' | 'withdraw' | null>(null);

  useEffect(() => {
    return subscribeGuestWalletBalance(setBalanceUsd, (error) =>
      logger.error('Failed to load guest wallet balance:', error)
    );
  }, []);

  const parseAmount = (): number | null => {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount;
  };

  const runAdjust = async (direction: 'top_up' | 'withdraw') => {
    const amount = parseAmount();
    if (amount == null) {
      addNotification('warning', t('guestWalletInvalidAmount'), t('guestWalletInvalidAmountDesc'));
      return;
    }
    if (amount > MAX_WALLET_CREDIT_USD) {
      addNotification('warning', t('guestWalletInvalidAmount'), t('guestWalletInvalidAmountDesc'));
      return;
    }
    if (direction === 'withdraw' && amount > balanceUsd) {
      addNotification('warning', t('guestWalletInsufficient'), t('guestWalletInsufficientDesc'));
      return;
    }

    setSubmitting(direction);
    try {
      await adjustGuestWalletBalance(amount, direction, note);
      setAmountInput('');
      setNote('');
      addNotification(
        'success',
        direction === 'top_up' ? t('guestWalletTopUpSuccess') : t('guestWalletWithdrawSuccess'),
        formatPrice(amount)
      );
    } catch (error) {
      logger.error('Failed to adjust guest wallet:', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Insufficient guest wallet balance')) {
        addNotification('error', t('guestWalletInsufficient'), t('guestWalletInsufficientDesc'));
      } else {
        addNotification('error', t('guestWalletAdjustFailed'), t('guestWalletAdjustFailedDesc'));
      }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="border border-[var(--border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
            {t('guestWalletBalance')}
          </span>
          <p className="text-2xl font-serif font-light text-[var(--ink)]">
            {formatPrice(balanceUsd)}
          </p>
          <p className="text-[11px] font-mono text-[var(--ink-dim)] leading-relaxed max-w-md">
            {t('guestWalletPanelHint')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1.5 block">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest">
            {t('guestWalletAmountLabel')}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder="0"
            disabled={submitting != null}
            className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-sm font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] disabled:opacity-50"
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest">
            {t('guestWalletNoteLabel')}
          </span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('guestWalletNotePlaceholder')}
            maxLength={120}
            disabled={submitting != null}
            className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] font-mono disabled:opacity-50"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton
          variant="primary"
          size="sm"
          disabled={submitting != null}
          onClick={() => void runAdjust('top_up')}
        >
          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
          {submitting === 'top_up' ? '…' : t('guestWalletTopUp')}
        </ActionButton>
        <ActionButton
          variant="danger"
          size="sm"
          disabled={submitting != null || balanceUsd <= 0}
          onClick={() => void runAdjust('withdraw')}
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          {submitting === 'withdraw' ? '…' : t('guestWalletWithdraw')}
        </ActionButton>
      </div>
    </div>
  );
};
