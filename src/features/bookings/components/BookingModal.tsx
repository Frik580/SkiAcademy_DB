import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Instructor, UserProfile, Booking, Course } from '../../../types';
import { useBookingModal } from './booking_modal/useBookingModal';
import { BookingAuthShell } from './booking_modal/BookingAuthShell';
import { AuthBookingForm } from './booking_modal/AuthBookingForm';
import { BookingModalHeader } from './booking_modal/BookingModalHeader';
import { BOOKING_MODAL_SHELL_CLASS } from './booking_modal/bookingModalLayout';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  userProfile: UserProfile | null;
  onBookingSuccess?: (booking: Booking) => Promise<number>;
  courses?: Course[];
  onAuthSuccess?: (profile: UserProfile) => void;
}

export const BookingModal: React.FC<BookingModalProps> = (props) => {
  const workspace = useBookingModal(props);
  const { isOpen, targetInstructor, userProfile } = workspace;

  if (!targetInstructor || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && targetInstructor && (
        <motion.div
          key="booking-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] overflow-hidden"
          role="presentation"
        >
          <BodyScrollLock />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={workspace.onClose}
            className="ui-modal-overlay fixed inset-0 h-[100dvh] w-screen max-w-none !rounded-none border-0"
            aria-hidden="true"
          />

          <div className="pointer-events-none fixed inset-0 z-10 flex items-end justify-center p-0 sm:items-center sm:p-6">
            {!userProfile ? (
              <BookingAuthShell workspace={workspace} />
            ) : (
              <motion.div
                key="booking-form-modal"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={BOOKING_MODAL_SHELL_CLASS}
                role="dialog"
                aria-modal="true"
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
