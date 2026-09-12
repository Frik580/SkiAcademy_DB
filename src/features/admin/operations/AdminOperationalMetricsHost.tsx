import { useMemo } from 'react';
import { computeAdminOperationalOverview } from './adminOperationalOverview';
import { useSharedAdminMonitorReadModels } from './AdminMonitorReadModelsContext';
import { AdminOperationalMetrics } from './AdminOperationalMetrics';

interface AdminOperationalMetricsHostProps {
  readonly instructorsCount: number;
}

/**
 * Operations surface owner for active/completed/no-show booking counters.
 * Requires AdminMonitorReadModelsProvider (monitor scopes, fully drained).
 */
export function AdminOperationalMetricsHost({
  instructorsCount,
}: AdminOperationalMetricsHostProps) {
  const { bookings, lessonsHot, lessonsHistory } = useSharedAdminMonitorReadModels();
  const metrics = useMemo(
    () =>
      computeAdminOperationalOverview({
        hotMonitorRows: bookings,
        lessonReadModels: [...lessonsHot.list.items, ...lessonsHistory.list.items],
        instructorsCount,
      }),
    [bookings, instructorsCount, lessonsHistory.list.items, lessonsHot.list.items]
  );

  return (
    <AdminOperationalMetrics
      activeBookings={metrics.activeBookings}
      completedBookings={metrics.completedBookings}
      noShowBookings={metrics.noShowBookings}
      instructorsCount={metrics.instructorsCount}
    />
  );
}
