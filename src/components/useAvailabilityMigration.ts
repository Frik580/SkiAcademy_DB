import { useEffect, useRef } from 'react';
import { Booking } from '../types';
import { migrateAvailabilitySlots } from '../lib/availabilityMigration';

export const useAvailabilityMigration = (
  role: 'user' | 'admin' | undefined,
  bookingsLoaded: boolean,
  bookings: Booking[]
): void => {
  const migrationRunningRef = useRef(false);

  useEffect(() => {
    if (role !== 'admin' || !bookingsLoaded || migrationRunningRef.current) {
      return;
    }

    migrationRunningRef.current = true;

    const runMigration = async () => {
      try {
        await migrateAvailabilitySlots(bookings);
      } catch (error) {
        console.error('Availability slot migration failed:', error);
      } finally {
        migrationRunningRef.current = false;
      }
    };

    runMigration();
  }, [role, bookingsLoaded, bookings]);
};
