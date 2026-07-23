import { Booking } from '../types';
import { db, doc, getDoc, setDoc, writeBatch } from './firebase';
import {
  AVAILABILITY_MIGRATION_SETTING,
  AVAILABILITY_SLOTS_COLLECTION,
  blocksInstructorAvailability,
  toAvailabilitySlot,
} from './availabilitySlots';

export const migrateAvailabilitySlots = async (bookings: Booking[]): Promise<void> => {
  const migrationRef = doc(db, 'settings', AVAILABILITY_MIGRATION_SETTING);
  const migrationSnapshot = await getDoc(migrationRef);
  if (migrationSnapshot.data()?.complete === true) return;

  const activeBookings = bookings.filter(blocksInstructorAvailability);
  const chunkSize = 400;

  for (let index = 0; index < activeBookings.length; index += chunkSize) {
    const batch = writeBatch(db);
    for (const booking of activeBookings.slice(index, index + chunkSize)) {
      batch.set(
        doc(db, AVAILABILITY_SLOTS_COLLECTION, booking.id),
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
  console.info(`[Availability Migration] Migrated ${activeBookings.length} active slots.`);
};
