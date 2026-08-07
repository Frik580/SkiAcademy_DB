import React from 'react';
import { motion } from 'motion/react';
import { Auth } from '../Auth';
import { BookingModalHeader } from './BookingModalHeader';
import { GuestBookingForm } from './GuestBookingForm';
import { useBookingModal } from './useBookingModal';
import { AuthModeSliderSwitch } from './AuthModeSliderSwitch';

interface BookingAuthShellProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const BookingAuthShell: React.FC<BookingAuthShellProps> = ({ workspace }) => {
  const { targetInstructor, t, onClose, unauthTab, setUnauthTab, onAuthSuccess } = workspace;

  if (!targetInstructor) return null;

  return (
    <motion.div
      key="signin-modal"
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 12 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="ui-modal shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 flex flex-col max-h-[80vh] rounded-none theme-air:rounded-[var(--radius)] bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)] m-auto"
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

      <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
        {unauthTab === 'auth' ? (
          <div className="space-y-4">
            <p className="text-xs text-[var(--ink-dim)] text-center leading-relaxed">
              {t('bookingSignInPrompt')}
            </p>
            <div className="border border-[var(--border)] p-4 bg-transparent rounded-none theme-air:rounded-[var(--radius-md)]">
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
