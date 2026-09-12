import { describe, expect, it } from 'vitest';
import { computeAdminOperationalOverview } from '../../src/features/admin/operations/adminOperationalOverview';
import type { Booking } from '../../src/types';
import { readRepoFile } from '../helpers/readRepoFile';

function hotRow(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking_hot_1',
    userId: 'account_client_1',
    instructorId: 'ins_1',
    instructorName: 'Anna',
    instructorAvatar: '',
    date: '2026-09-01',
    time: '10:00',
    durationHours: 2,
    totalPrice: 25000,
    status: 'confirmed',
    ...overrides,
  };
}

describe('admin operational lesson metrics — canonical lifecycle', () => {
  it('13. completed booking not in hot still contributes to completed KPI', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [hotRow()],
      lessonReadModels: [
        { bookingId: 'booking_hot_1', revision: 1, lifecycle: { status: 'confirmed' } },
        { bookingId: 'booking_history_completed', revision: 1, lifecycle: { status: 'completed' } },
      ],
      instructorsCount: 1,
    });
    expect(metrics.activeBookings).toBe(1);
    expect(metrics.completedBookings).toBe(1);
  });

  it('14. no_show contributes to no_show KPI', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [],
      lessonReadModels: [
        { bookingId: 'booking_no_show', revision: 1, lifecycle: { status: 'no_show' } },
      ],
      instructorsCount: 0,
    });
    expect(metrics.noShowBookings).toBe(1);
  });

  it('15. no_show is not counted as completed', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [],
      lessonReadModels: [
        { bookingId: 'booking_no_show', revision: 1, lifecycle: { status: 'no_show' } },
        { bookingId: 'booking_completed', revision: 1, lifecycle: { status: 'completed' } },
      ],
      instructorsCount: 0,
    });
    expect(metrics.completedBookings).toBe(1);
    expect(metrics.noShowBookings).toBe(1);
    expect(metrics.occupiedBookings).toBe(2);
  });

  it('16. group booking counts once', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [],
      lessonReadModels: [
        { bookingId: 'booking_group', revision: 1, lifecycle: { status: 'completed' } },
      ],
      instructorsCount: 0,
    });
    expect(metrics.completedBookings).toBe(1);
    expect(metrics.occupiedBookings).toBe(1);
  });

  it('17. partial first history page cannot stand in for the drained KPI', () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      bookingId: `booking_history_${String(index + 1).padStart(2, '0')}`,
      revision: 1,
      lifecycle: { status: 'completed' as const },
    }));
    const rest = Array.from({ length: 5 }, (_, index) => ({
      bookingId: `booking_history_${String(index + 26).padStart(2, '0')}`,
      revision: 1,
      lifecycle: { status: 'completed' as const },
    }));
    const partial = computeAdminOperationalOverview({
      hotMonitorRows: [],
      lessonReadModels: firstPage,
      instructorsCount: 0,
    });
    const full = computeAdminOperationalOverview({
      hotMonitorRows: [],
      lessonReadModels: [...firstPage, ...rest],
      instructorsCount: 0,
    });
    expect(partial.completedBookings).toBe(25);
    expect(full.completedBookings).toBe(30);
    expect(full.completedBookings).toBeGreaterThan(partial.completedBookings);
  });

  it('18. duplicate hot/history is not double counted', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [hotRow({ id: 'booking_moved', status: 'confirmed' })],
      lessonReadModels: [
        { bookingId: 'booking_moved', revision: 1, lifecycle: { status: 'confirmed' } },
        { bookingId: 'booking_moved', revision: 2, lifecycle: { status: 'completed' } },
      ],
      instructorsCount: 1,
    });
    expect(metrics.completedBookings).toBe(1);
    expect(metrics.noShowBookings).toBe(0);
  });

  it('19–20. revenue authority stays on canonical finance, not booking lifecycle', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [hotRow({ totalPrice: 999_999, status: 'completed' })],
      lessonReadModels: [
        { bookingId: 'booking_hot_1', revision: 1, lifecycle: { status: 'completed' } },
      ],
      instructorsCount: 1,
    });
    expect(metrics).not.toHaveProperty('settledPaymentTotalKzt');
    expect(metrics).not.toHaveProperty('settledRevenueKzt');
    expect(JSON.stringify(metrics)).not.toContain('999999');
    expect(
      readRepoFile('src/features/admin/components/finance/useAdminFinanceReadModels.ts')
    ).toContain("scope: 'admin_financial_overview'");
    expect(
      readRepoFile('src/features/admin/operations/adminOperationalOverview.ts')
    ).not.toContain('monetary_events');
    expect(
      readRepoFile('src/features/admin/operations/adminOperationalOverview.ts')
    ).not.toContain('totalPrice');
    expect(
      readRepoFile('src/features/admin/operations/AdminOperationalMetricsHost.tsx')
    ).not.toContain('deletedCompletedStats');
    expect(
      readRepoFile('src/features/admin/operations/AdminOperationalMetricsHost.tsx')
    ).not.toContain('school_global_stats');
    expect(readRepoFile('src/features/bookings/sync/useBookingsSync.ts')).not.toContain(
      'school_global_stats'
    );
    expect(readRepoFile('src/features/bookings/bookingsStore.ts')).not.toContain(
      'deletedCompletedStats'
    );
    expect(readRepoFile('src/features/admin/adminSelectors.ts')).not.toContain(
      'deletedCompletedStats'
    );
  });

  it('does not count course enrollments as lesson completed', () => {
    const metrics = computeAdminOperationalOverview({
      hotMonitorRows: [
        hotRow({ id: 'enrollment_1', instructorId: 'course_alpine', status: 'completed' }),
      ],
      lessonReadModels: [],
      instructorsCount: 0,
    });
    expect(metrics.courseEnrollmentCount).toBe(1);
    expect(metrics.completedBookings).toBe(0);
    expect(metrics.activeBookings).toBe(0);
  });
});
