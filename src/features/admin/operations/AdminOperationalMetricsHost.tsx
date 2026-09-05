import { useMemo } from 'react';
import { computeAdminOperationalOverview } from './adminFinancialOverview';
import { useSharedAdminMonitorReadModels } from './AdminMonitorReadModelsContext';
import { AdminOperationalMetrics } from './AdminOperationalMetrics';

interface AdminOperationalMetricsHostProps {
  readonly instructorsCount: number;
}

/**
 * Operations surface owner for active/completed booking counters.
 * Requires AdminMonitorReadModelsProvider (monitor scopes only).
 */
export function AdminOperationalMetricsHost({
  instructorsCount,
}: AdminOperationalMetricsHostProps) {
  const { bookings } = useSharedAdminMonitorReadModels();
  const metrics = useMemo(
    () => computeAdminOperationalOverview({ bookings, instructorsCount }),
    [bookings, instructorsCount]
  );

  return (
    <AdminOperationalMetrics
      activeBookings={metrics.activeBookings}
      completedBookings={metrics.completedBookings}
      instructorsCount={metrics.instructorsCount}
    />
  );
}
