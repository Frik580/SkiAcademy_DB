import React, { useEffect, useState } from 'react';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { subscribeGuestWalletBalance } from '../../../../features/admin/adminService';
import { logger } from '../../../../shared';
import { useAdminFinanceTranslations } from './useAdminFinanceTranslations';

/**
 * Legacy school guest cash till (`settings/guest_wallet.balanceUSD`).
 * Unmounted from Admin Finance tab after T32.9A.4.2 Guest Funds parity.
 * Component retained as reference until T32.9B cleanup — do not remount as
 * a canonical Wallet surface.
 */
export const GuestWalletPanel: React.FC = () => {
  const { t } = useAdminFinanceTranslations();
  const { formatPrice } = useCurrency();

  const [balanceUsd, setBalanceUsd] = useState(0);

  useEffect(() => {
    return subscribeGuestWalletBalance(setBalanceUsd, (error) =>
      logger.error('Failed to load guest wallet balance:', error)
    );
  }, []);

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

      <div className="border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-[11px] font-mono text-[var(--ink)] leading-relaxed">
          {t('guestWalletMutationDisabled')}
        </p>
      </div>
    </div>
  );
};
