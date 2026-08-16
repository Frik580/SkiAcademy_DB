import { beforeEach, describe, expect, it } from 'vitest';
import { QUERY_LIMITS } from '../../src/lib/queryLimits';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';

describe('bookings sync pagination', () => {
  beforeEach(() => {
    useBookingsStore.getState().resetBookingsPagination();
  });

  it('expands the realtime window by a bounded page increment', () => {
    useBookingsStore.getState().loadMoreBookings();

    expect(useBookingsStore.getState().bookingsPageSize).toBe(
      QUERY_LIMITS.bookings + QUERY_LIMITS.bookingsPageIncrement
    );
    expect(useBookingsStore.getState().bookingsHasMore).toBe(false);
  });

  it('invalidates the expanded window when the sync identity changes', () => {
    useBookingsStore.getState().loadMoreBookings();
    useBookingsStore.getState().setBookingsHasMore(true);
    useBookingsStore.getState().resetBookingsPagination();

    expect(useBookingsStore.getState().bookingsPageSize).toBe(QUERY_LIMITS.bookings);
    expect(useBookingsStore.getState().bookingsHasMore).toBe(false);
  });
});
