import React, { useState, useEffect } from 'react';
import { BookOpen, BookOpenCheck, DollarSign, Users } from 'lucide-react';
import type { AdminFinancialOverviewPeriod } from '@ski-academy/shared-domain';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { logger } from '../../../../shared';
import { saveUsdToKztRate } from '../../../../features/admin/adminService';
import {
  formatCanonicalKztForDisplay,
  isUsdToKztDisplayRateAvailable,
} from '../../operations/adminFinancialOverview';
import type { AdminFinanceReadErrorCode } from './useAdminFinanceReadModels';

interface FinancialOverviewProps {
  netSettledKzt?: number;
  settledRevenueKzt?: number;
  refundedKzt?: number;
  activeBookings: number;
  completedBookings: number;
  instructorsCount: number;
  period: AdminFinancialOverviewPeriod;
  onPeriodChange: (period: AdminFinancialOverviewPeriod) => void;
  revenueLoading?: boolean;
  revenueError?: AdminFinanceReadErrorCode;
  revenueTruncated?: boolean;
  onOpenPeriodMovement?: () => void;
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  netSettledKzt,
  settledRevenueKzt,
  refundedKzt,
  activeBookings,
  completedBookings,
  instructorsCount,
  period,
  onPeriodChange,
  revenueLoading = false,
  revenueError,
  revenueTruncated = false,
  onOpenPeriodMovement,
}) => {
  const { t } = useLanguage();
  const { currency, setCurrency, usdToKztRate, setUsdToKztRate } = useCurrency();
  const [rateInput, setRateInput] = useState<number | string>(usdToKztRate);
  const fxRateAvailable = isUsdToKztDisplayRateAvailable(usdToKztRate);

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

  const revenueReady = !revenueLoading && !revenueError && netSettledKzt !== undefined;
  const revenueLabel =
    revenueLoading
      ? '…'
      : revenueError
        ? t('adminFinanceOverviewLoadFailed')
        : formatCanonicalKztForDisplay(netSettledKzt ?? 0, currency, usdToKztRate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink-dim)] font-bold">
          {t('financialOverview') || 'Финансовый обзор'}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {/* Exchange Rate Setting — display/FX presentation only; canonical money remains KZT */}
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

          <div className="flex items-center gap-1">
            {(['day', 'week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPeriodChange(value)}
                className={`px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  period === value
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]'
                    : 'border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)]'
                }`}
              >
                {value === 'day'
                  ? t('adminFinancePeriodDay')
                  : value === 'week'
                    ? t('adminFinancePeriodWeek')
                    : t('adminFinancePeriodMonth')}
              </button>
            ))}
          </div>

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
            <span
              className={`text-2xl font-serif font-light ${
                revenueError ? 'text-[var(--ink-dim)]' : 'text-[var(--ink)]'
              }`}
            >
              {revenueLabel}
            </span>
            {revenueReady ? (
              <span className="text-[9px] font-mono text-[var(--ink-dim)] block">
                {t('adminFinanceOverviewSettled')}:{' '}
                {formatCanonicalKztForDisplay(settledRevenueKzt ?? 0, 'KZT', usdToKztRate)}
                {' · '}
                {t('adminFinanceOverviewRefunded')}:{' '}
                {formatCanonicalKztForDisplay(refundedKzt ?? 0, 'KZT', usdToKztRate)}
              </span>
            ) : null}
            {currency === 'USD' && !fxRateAvailable ? (
              <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 block">
                {t('adminFinanceOverviewFxUnavailable')}
              </span>
            ) : null}
            {revenueTruncated ? (
              <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 block">
                {t('adminFinanceOverviewTruncated')}
              </span>
            ) : null}
            {onOpenPeriodMovement ? (
              <button
                type="button"
                onClick={onOpenPeriodMovement}
                className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink)] underline underline-offset-2"
              >
                {t('adminFinanceOverviewOpenMovement')}
              </button>
            ) : null}
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
