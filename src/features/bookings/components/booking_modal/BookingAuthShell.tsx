import React from 'react';
import { motion } from 'motion/react';
import { Auth } from '../../../../features/auth';
import { BookingModalHeader } from './BookingModalHeader';
import { GuestBookingForm } from './GuestBookingForm';
import { useBookingModal } from './useBookingModal';
import { AuthModeSliderSwitch } from './AuthModeSliderSwitch';
import { BOOKING_MODAL_SHELL_CLASS } from './bookingModalLayout';

interface BookingAuthShellProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const BookingAuthShell: React.FC<BookingAuthShellProps> = ({ workspace }) => {
  const { targetInstructor, t, onClose, unauthTab, setUnauthTab, onAuthSuccess } = workspace;

  if (!targetInstructor) return null;

  return (
    <motion.div
      key="signin-modal"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={BOOKING_MODAL_SHELL_CLASS}
      role="dialog"
      aria-modal="true"
      aria-label={t('bookLessonWith')}
      onClick={(e) => e.stopPropagation()}
    >
      <BookingModalHeader targetInstructor={targetInstructor} t={t} onClose={onClose} />

      <div className="px-4 py-2 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
        <AuthModeSliderSwitch
          unauthTab={unauthTab}
          onChange={setUnauthTab}
          guestLabel={t('guestBookingTab')}
          authLabel={t('authTab')}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {unauthTab === 'auth' ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <p className="text-center text-xs leading-relaxed text-[var(--ink-dim)]">
              {t('bookingSignInPrompt')}
            </p>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent p-4">
              <Auth onSuccess={onAuthSuccess || (() => {})} />
            </div>
          </div>
        ) : (
          <GuestBookingForm workspace={workspace} />
        )}
      </div>
    </motion.div>
  );
};
