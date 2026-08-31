import { useCallback } from 'react';
import type { Instructor } from '../../types';
import {
  addInstructorService,
  deleteInstructorService,
  updateInstructorService,
} from '../bookings/bookingService';

/** Non-booking Admin workflows composed at the route boundary. */
export function useAdminActions() {
  const handleAddInstructor = useCallback(async (instructor: Instructor) => {
    await addInstructorService(instructor);
  }, []);

  const handleUpdateInstructor = useCallback(async (instructor: Instructor) => {
    // Canonical Booking reads resolve instructor presentation from the instructor catalog.
    // Never fan legacy instructor fields out into canonical Booking documents.
    await updateInstructorService(instructor, []);
  }, []);

  const handleDeleteInstructor = useCallback(async (id: string) => {
    await deleteInstructorService(id);
  }, []);

  return {
    handleAddInstructor,
    handleUpdateInstructor,
    handleDeleteInstructor,
  };
}
