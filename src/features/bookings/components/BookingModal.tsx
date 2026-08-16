import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Instructor, UserProfile, Booking, Course } from '../../../types';
import { useBookingModal } from '../../../features/bookings/components/booking_modal/useBookingModal';
import { BookingAuthShell } from '../../../features/bookings/components/booking_modal/BookingAuthShell';
import { AuthBookingForm } from '../../../features/bookings/components/booking_modal/AuthBookingForm';
import { BookingModalHeader } from '../../../features/bookings/components/booking_modal/BookingModalHeader';
import { BodyScrollLock } from '../../../components/ui/BodyScrollLock';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess: (booking: Booking) => Promise<number>;
  courses?: Course[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const BookingModal: React.FC<BookingModalProps> = (props) => {
  const workspace = useBookingModal(props);
  const { isOpen, targetInstructor, userProfile } = workspace;

  if (!targetInstructor) return null;

  return (
    <AnimatePresence>
      {isOpen && targetInstructor && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={workspace.onClose}
        >
          <BodyScrollLock />
          {!userProfile ? (
            <BookingAuthShell workspace={workspace} />
          ) : (
            <motion.div
              key="booking-form-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="ui-modal shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 flex flex-col max-h-[80vh] rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] m-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <BookingModalHeader
                targetInstructor={targetInstructor}
                t={workspace.t}
                onClose={workspace.onClose}
              />

              <AuthBookingForm workspace={workspace} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
