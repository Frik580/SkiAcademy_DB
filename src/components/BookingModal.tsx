import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Instructor, UserProfile, Booking, Course } from '../types';
import { useBookingModal } from './booking_modal/useBookingModal';
import { BookingAuthShell } from './booking_modal/BookingAuthShell';
import { AuthBookingForm } from './booking_modal/AuthBookingForm';
import { BookingModalHeader } from './booking_modal/BookingModalHeader';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess: (booking: Booking, totalCost: number) => Promise<void>;
  onOpenTopUp: () => void;
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
          className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {!userProfile ? (
            <BookingAuthShell workspace={workspace} />
          ) : (
            <motion.div
              key="booking-form-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="ui-modal shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]"
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
