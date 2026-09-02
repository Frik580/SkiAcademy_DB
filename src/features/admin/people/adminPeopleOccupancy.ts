import type { Booking } from '../../../types';

const ACTIVE_OCCUPANCY_STATUSES = new Set(['pending', 'confirmed', 'pending_cancellation']);

export function bookingsBlockingInstructorDeactivation(
  bookings: readonly Booking[],
  instructorId: string
): Booking[] {
  return bookings.filter((booking) => {
    if (booking.instructorId !== instructorId) return false;
    if (booking.userId?.startsWith('system_block_')) return false;
    return ACTIVE_OCCUPANCY_STATUSES.has(booking.status);
  });
}

export function mergeInstructorOccupancyBookings(
  monitorBookings: readonly Booking[],
  plannerOccupancyBookings: readonly Booking[]
): Booking[] {
  const byId = new Map<string, Booking>();
  for (const booking of [...monitorBookings, ...plannerOccupancyBookings]) {
    byId.set(booking.id, booking);
  }
  return [...byId.values()];
}
