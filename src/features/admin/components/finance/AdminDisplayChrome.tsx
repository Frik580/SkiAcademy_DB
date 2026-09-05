import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { logger } from '../../../../shared';
import { saveUsdToKztRate } from '../../../../features/admin/adminService';

/**
 * Lightweight Admin chrome: FX display rate + currency toggle.
 * No canonical finance/monitor reads.
 */
export const AdminDisplayChrome: React.FC = () => {
  const { t } = useLanguage();
  const { currency, setCurrency, usdToKztRate, setUsdToKztRate } = useCurrency();
  const [rateInput, setRateInput] = useState<number | string>(usdToKztRate);

  useEffect(() => {
    setRateInput(usdToKztRate);
  }, [usdToKztRate]);

  const handleRateChange = (val: string) => {
    setRateInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setUsdToKztRate(num);
      saveUsdToKztRate(num).catch((err) => {
        logger.error('Failed to update exchange rate in Firestore:', err);
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div
        className="flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-[var(--border)] px-2.5 py-1"
        title={t('exchangeRateDisplayOnly')}
      >
        <span className="text-xs font-mono text-[var(--ink-dim)] whitespace-nowrap">1 $ =</span>
        <input
          type="number"
          min="1"
          step="1"
          value={rateInput}
          onChange={(e) => handleRateChange(e.target.value)}
          className="w-16 bg-transparent border-b border-[var(--border)] px-1 text-xs font-mono font-bold text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center"
          placeholder="500"
        />
        <span className="text-xs font-mono text-[var(--ink-dim)]">₸</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
          {t('currencyLabel') || 'Валюта'}:
        </span>
        <button
          type="button"
          onClick={() => setCurrency(currency === 'USD' ? 'KZT' : 'USD')}
          className="px-3 py-1 border border-[var(--border)] hover:border-[var(--ink)] bg-[var(--bg)] text-xs font-mono font-bold tracking-wider text-[var(--ink)] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          title={currency === 'USD' ? 'Переключить на ₸ KZT' : 'Переключить на $ USD'}
        >
          <span>{currency === 'USD' ? '$ USD' : '₸ KZT'}</span>
        </button>
      </div>
    </div>
  );
};
