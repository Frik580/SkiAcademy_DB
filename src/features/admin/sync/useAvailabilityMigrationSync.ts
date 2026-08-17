import { useEffect, useRef } from 'react';
import { migrateAvailabilitySlots } from '../../../lib/availabilityMigration';
import { logger } from '../../../shared/logger';
import { useBookingsStore } from '../../bookings/bookingsStore';
import { useProfileStore } from '../../profile/profileStore';

/** One-time admin migration for legacy availability slots. */
export const useAvailabilityMigrationSync = () => {
  const userRole = useProfileStore((s) => s.userProfile?.role);
  const bookings = useBookingsStore((s) => s.bookings);
  const bookingsLoaded = useBookingsStore((s) => s.bookingsLoaded);
  const migrationRunningRef = useRef(false);
  const migrationCompletedRef = useRef(false);

  useEffect(() => {
    if (
      userRole !== 'admin' ||
      !bookingsLoaded ||
      migrationRunningRef.current ||
      migrationCompletedRef.current
    ) {
      return;
    }

    migrationRunningRef.current = true;
    void migrateAvailabilitySlots(bookings)
      .then(() => {
        migrationCompletedRef.current = true;
      })
      .catch((error) => logger.error('Availability slot migration failed:', error))
      .finally(() => {
        migrationRunningRef.current = false;
      });
  }, [userRole, bookingsLoaded, bookings]);
};
