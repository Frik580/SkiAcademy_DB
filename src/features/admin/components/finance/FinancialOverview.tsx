import React, { useState, useEffect } from 'react';
import { BookOpen, BookOpenCheck, DollarSign, Users } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { logger } from '../../../../lib/logger';
import { saveUsdToKztRate } from '../../../../features/admin/adminService';

interface FinancialOverviewProps {
  totalRevenue: number;
  activeBookings: number;
  completedBookings: number;
  instructorsCount: number;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  totalRevenue,
  activeBookings,
  completedBookings,
  instructorsCount,
}) => {
  const { t } = useLanguage();
  const { currency, setCurrency, usdToKztRate, setUsdToKztRate, formatPrice } = useCurrency();
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink-dim)] font-bold">
          {t('financialOverview') || 'Финансовый обзор'}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {/* Exchange Rate Setting */}
          <div
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-[var(--border)] px-2.5 py-1"
            title={t('exchangeRateDesc') || 'Курс конвертации USD → KZT'}
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

          {/* Currency Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider">
              {t('currencyLabel') || 'Валюта'}:
            </span>
            <button
              onClick={() => setCurrency(currency === 'USD' ? 'KZT' : 'USD')}
              className="px-3 py-1 border border-[var(--border)] hover:border-[var(--ink)] bg-[var(--bg)] text-xs font-mono font-bold tracking-wider text-[var(--ink)] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title={currency === 'USD' ? 'Переключить на ₸ KZT' : 'Переключить на $ USD'}
            >
              <span>{currency === 'USD' ? '$ USD' : '₸ KZT'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
              {t('totalRevenue')}
            </span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">
              {formatPrice(totalRevenue)}
            </span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
              {t('activeLessons')}
            </span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">
              {activeBookings}
            </span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <BookOpen className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
              {t('completedLessons')}
            </span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">
              {completedBookings}
            </span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <BookOpenCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">
              {t('allGuidesCount')}
            </span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">
              {instructorsCount}
            </span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <Users className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
};
