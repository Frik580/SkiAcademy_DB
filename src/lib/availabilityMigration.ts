import {
  AVAILABILITY_MIGRATION_SETTING,
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  toAvailabilitySlot,
} from './availabilitySlots';
import { addHourLocksToBatch } from '../domain/booking/slotOverlap';
import { doc, getDoc, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { Booking } from '../types';
import { db } from '../infrastructure/firebase/firebase';
import { logger } from './logger';

export const migrateAvailabilitySlots = async (
  bookings: Booking[],
  firestore: Firestore = db
): Promise<void> => {
  const migrationRef = doc(firestore, 'settings', AVAILABILITY_MIGRATION_SETTING);
  const migrationSnapshot = await getDoc(migrationRef);
  if (migrationSnapshot.data()?.complete === true) return;

  const activeBookings = bookings.filter(blocksInstructorAvailability);
  const chunkSize = 400;

  for (let index = 0; index < activeBookings.length; index += chunkSize) {
    const batch = writeBatch(firestore);
    for (const booking of activeBookings.slice(index, index + chunkSize)) {
      addHourLocksToBatch(batch, firestore, booking);
      batch.set(
        doc(firestore, AVAILABILITY_SLOTS_COLLECTION, booking.id),
        toAvailabilitySlot(booking)
      );
    }
    await batch.commit();
  }

  await setDoc(migrationRef, {
    complete: true,
    migratedCount: activeBookings.length,
    completedAt: new Date().toISOString(),
  });
  logger.info(`[Availability Migration] Migrated ${activeBookings.length} active slots.`);
};
