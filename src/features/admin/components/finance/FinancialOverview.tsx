import React from 'react';
import { DollarSign } from 'lucide-react';
import type { AdminFinancialOverviewPeriod } from '@ski-academy/shared-domain';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import {
  formatCanonicalKztForDisplay,
  isUsdToKztDisplayRateAvailable,
} from '../../operations/adminFinancialOverview';
import type { AdminFinanceReadErrorCode } from './useAdminFinanceReadModels';

interface FinancialOverviewProps {
  netSettledKzt?: number;
  settledRevenueKzt?: number;
  refundedKzt?: number;
  period: AdminFinancialOverviewPeriod;
  onPeriodChange: (period: AdminFinancialOverviewPeriod) => void;
  revenueLoading?: boolean;
  revenueError?: AdminFinanceReadErrorCode;
  revenueTruncated?: boolean;
  onOpenPeriodMovement?: () => void;
}

/**
 * Finance-tab revenue overview. Owns period selector + monetary_events-backed totals.
 * Booking counters live on Operations; FX/currency chrome is global AdminDisplayChrome.
 */
export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  netSettledKzt,
  settledRevenueKzt,
  refundedKzt,
  period,
  onPeriodChange,
  revenueLoading = false,
  revenueError,
  revenueTruncated = false,
  onOpenPeriodMovement,
}) => {
  const { t } = useLanguage();
  const { currency, usdToKztRate } = useCurrency();
  const fxRateAvailable = isUsdToKztDisplayRateAvailable(usdToKztRate);

  const revenueReady = !revenueLoading && !revenueError && netSettledKzt !== undefined;
  const revenueLabel = revenueLoading
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
        <div className="flex flex-wrap items-center gap-1">
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
      </div>

      <div className="grid grid-cols-1 gap-4">
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
      </div>
    </div>
  );
};
