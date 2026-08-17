import { beforeEach, describe, expect, it } from 'vitest';
import { useBookingsStore } from '../../src/features/bookings/bookingsStore';

describe('booking history pagination requests', () => {
  beforeEach(() => {
    useBookingsStore.getState().resetBookingsPagination();
  });

  it('requests the next on-demand history page without expanding the realtime window', () => {
    const initialRequest = useBookingsStore.getState().bookingHistoryRequest;
    useBookingsStore.getState().setBookingsHasMore(true);
    useBookingsStore.getState().loadMoreBookings();

    expect(useBookingsStore.getState().bookingHistoryRequest).toBe(initialRequest + 1);
  });

  it('does not issue concurrent or exhausted page requests', () => {
    useBookingsStore.getState().loadMoreBookings();
    expect(useBookingsStore.getState().bookingHistoryRequest).toBe(0);

    useBookingsStore.getState().setBookingsHasMore(true);
    useBookingsStore.getState().setBookingHistoryLoading(true);
    useBookingsStore.getState().loadMoreBookings();
    expect(useBookingsStore.getState().bookingHistoryRequest).toBe(0);
  });

  it('resets pagination state when the sync identity changes', () => {
    useBookingsStore.getState().loadMoreBookings();
    useBookingsStore.getState().setBookingsHasMore(true);
    useBookingsStore.getState().resetBookingsPagination();

    expect(useBookingsStore.getState().bookingHistoryRequest).toBe(0);
    expect(useBookingsStore.getState().bookingsHasMore).toBe(false);
  });
});
