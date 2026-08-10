import { useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';
import { useAuthStore } from '../store/authStore';
import { useBookingStore } from '../store/bookingStore';

/** @deprecated Use useBookingStore directly. Kept for unit test compatibility. */
export const useBookings = (firebaseUser: User | null, userProfile: UserProfile | null) => {
  useEffect(() => {
    useAuthStore.getState().setFirebaseUser(firebaseUser);
    useAuthStore.getState().setUserProfile(userProfile);
  }, [firebaseUser, userProfile]);

  const bookings = useBookingStore((s) => s.bookings);
  const bookingsLoaded = useBookingStore((s) => s.bookingsLoaded);
  const deletedCompletedStats = useBookingStore((s) => s.deletedCompletedStats);
  const handleBookingSuccess = useBookingStore((s) => s.handleBookingSuccess);
  const handleReschedule = useBookingStore((s) => s.handleReschedule);
  const handleReassignInstructor = useBookingStore((s) => s.handleReassignInstructor);
  const handleCancel = useBookingStore((s) => s.handleCancel);
  const handleRequestCancel = useBookingStore((s) => s.handleRequestCancel);
  const handleAddBooking = useBookingStore((s) => s.handleAddBooking);
  const handleDeleteBooking = useBookingStore((s) => s.handleDeleteBooking);
  const handleClearStudentBookings = useBookingStore((s) => s.handleClearStudentBookings);
  const handleClearCancelledBookings = useBookingStore((s) => s.handleClearCancelledBookings);
  const handleConfirmBooking = useBookingStore((s) => s.handleConfirmBooking);
  const handleCompleteBooking = useBookingStore((s) => s.handleCompleteBooking);
  const handleLinkGuestBooking = useBookingStore((s) => s.handleLinkGuestBooking);
  const handleToggleRecommendation = useBookingStore((s) => s.handleToggleRecommendation);

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
