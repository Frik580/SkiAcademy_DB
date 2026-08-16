import { useBookingsStore as useBookingStore } from '../features/bookings/bookingsStore';
import { useBookingActions } from '../features/bookings/useBookingActions';

/** @deprecated Use useBookingStore directly. Kept for unit test compatibility. */
export const useBookings = () => {
  const bookings = useBookingStore((s) => s.bookings);
  const bookingsLoaded = useBookingStore((s) => s.bookingsLoaded);
  const deletedCompletedStats = useBookingStore((s) => s.deletedCompletedStats);
  const {
    handleBookingSuccess,
    handleReschedule,
    handleReassignInstructor,
    handleCancel,
    handleRequestCancel,
    handleAddBooking,
    handleDeleteBooking,
    handleClearStudentBookings,
    handleClearCancelledBookings,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleToggleRecommendation,
  } = useBookingActions();

  return {
    bookings,
    bookingsLoaded,
    deletedCompletedStats,
    handleBookingSuccess,
    handleReschedule,
    handleReassignInstructor,
    handleCancel,
    handleRequestCancel,
    handleAddBooking,
    handleDeleteBooking,
    handleClearStudentBookings,
    handleClearCancelledBookings,
    handleConfirmBooking,
    handleCompleteBooking,
    handleLinkGuestBooking,
    handleToggleRecommendation,
  };
};
