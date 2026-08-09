import { doc, type Firestore, type WriteBatch } from 'firebase/firestore';
import type { Booking } from '../types';
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

export function buildHourLockId(instructorId: string, date: string, time: string): string {
  return `${instructorId}__${date}__${time}`;
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
    lockIds.push(buildHourLockId(booking.instructorId, booking.date, `${hh}:${mm}`));
  }

  return lockIds;
}

export function addHourLocksToBatch(
  batch: WriteBatch,
  firestore: Firestore,
  booking: Pick<Booking, 'id' | 'instructorId' | 'date' | 'time' | 'durationHours'>
) {
  for (const lockId of buildHourLockIds(booking)) {
    batch.set(doc(firestore, AVAILABILITY_HOUR_LOCKS_COLLECTION, lockId), {
      instructorId: booking.instructorId,
      date: booking.date,
      time: booking.time,
      bookingId: booking.id,
    });
  }
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
