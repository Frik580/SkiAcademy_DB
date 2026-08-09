import type { AvailabilitySlot } from '../types';
import { timeStrToMinutes } from './availabilitySlots';

export const AVAILABILITY_HOUR_LOCKS_COLLECTION = 'availability_hour_locks';

export interface SlotInterval {
  time: string;
  durationHours: number;
}

export function slotsOverlap(a: SlotInterval, b: SlotInterval): boolean {
  const aStart = timeStrToMinutes(a.time);
  const aEnd = aStart + a.durationHours * 60;
  const bStart = timeStrToMinutes(b.time);
  const bEnd = bStart + b.durationHours * 60;
  return aStart < bEnd && aEnd > bStart;
}

export function buildHourLockIds(
  booking: Pick<SlotInterval, 'time' | 'durationHours'> & {
    instructorId: string;
    date: string;
  }
): string[] {
  const startMinutes = timeStrToMinutes(booking.time);
  const lockIds: string[] = [];

  for (let hour = 0; hour < booking.durationHours; hour++) {
    const minutes = startMinutes + hour * 60;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    lockIds.push(`${booking.instructorId}__${booking.date}__${hh}:${mm}`);
  }

  return lockIds;
}

export function hasOverlappingAvailabilitySlot(
  candidate: SlotInterval,
  existingSlots: AvailabilitySlot[],
  excludeBookingId?: string
): boolean {
  return existingSlots.some((slot) => {
    if (excludeBookingId && slot.bookingId === excludeBookingId) return false;
    return slotsOverlap(candidate, slot);
  });
}
