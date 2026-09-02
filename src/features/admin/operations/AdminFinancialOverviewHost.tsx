import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminFinancialOverviewPeriod } from '@ski-academy/shared-domain';
import { FinancialOverview } from '../components/finance/FinancialOverview';
import { computeAdminOperationalOverview } from './adminFinancialOverview';
import { useAdminMonitorReadModels } from './useAdminMonitorReadModels';
import { useAdminFinancialOverviewReadModel } from '../components/finance/useAdminFinanceReadModels';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import { resolveAdminTimeZone } from './adminTimeZone';
import {
  ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY,
  ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
} from '../adminNavigation';

interface AdminFinancialOverviewHostProps {
  readonly instructorsCount: number;
}

export function AdminFinancialOverviewHost({ instructorsCount }: AdminFinancialOverviewHostProps) {
  const { bookings } = useAdminMonitorReadModels();
  const [period, setPeriod] = useState<AdminFinancialOverviewPeriod>('month');
  const [, setSearchParams] = useSearchParams();
  const localDate = formatDateLocalYMD(new Date());
  const timeZone = resolveAdminTimeZone();
  const finance = useAdminFinancialOverviewReadModel({ period, localDate, timeZone });
  const metrics = useMemo(
    () => computeAdminOperationalOverview({ bookings, instructorsCount }),
    [bookings, instructorsCount]
  );

  const openPeriodMovement = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ADMIN_TAB_QUERY_KEY, 'finance');
        next.set(ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY, '1');
        next.set(ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY, period);
        return next;
      },
      { replace: true }
    );
  };

  return (
    <FinancialOverview
      netSettledKzt={finance.error ? undefined : finance.item?.netSettledKzt}
      settledRevenueKzt={finance.error ? undefined : finance.item?.settledRevenueKzt}
      refundedKzt={finance.error ? undefined : finance.item?.refundedKzt}
      activeBookings={metrics.activeBookings}
      completedBookings={metrics.completedBookings}
      instructorsCount={metrics.instructorsCount}
      period={period}
      onPeriodChange={setPeriod}
      revenueLoading={finance.loading}
      revenueError={finance.error}
      revenueTruncated={finance.item?.truncated === true}
      onOpenPeriodMovement={openPeriodMovement}
    />
  );
}
