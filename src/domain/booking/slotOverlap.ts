import { doc, type Firestore, type WriteBatch } from 'firebase/firestore';
import type { Booking } from '../../types';
import {
  AVAILABILITY_HOUR_LOCKS_COLLECTION,
  buildHourLockId,
  buildHourLockIds,
  hasOverlappingAvailabilitySlot,
  slotsOverlap,
} from '@ski-academy/shared-domain';

export {
  AVAILABILITY_HOUR_LOCKS_COLLECTION,
  buildHourLockId,
  buildHourLockIds,
  hasOverlappingAvailabilitySlot,
  slotsOverlap,
};

export interface SlotInterval {
  time: string;
  durationHours: number;
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
