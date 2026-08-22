import React from 'react';
import { motion } from 'motion/react';
import { Auth } from '../../../../features/auth';
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
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="ui-modal pointer-events-auto relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-[var(--border)] bg-[var(--card-bg)] text-[var(--ink)] shadow-2xl transition-colors duration-300 rounded-t-[var(--radius)] rounded-b-none sm:rounded-2xl sm:rounded-[var(--radius)]"
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

      <div className="p-5 md:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
        {unauthTab === 'auth' ? (
          <div className="space-y-4">
            <p className="text-xs text-[var(--ink-dim)] text-center leading-relaxed">
              {t('bookingSignInPrompt')}
            </p>
            <div className="border border-[var(--border)] p-4 bg-transparent rounded-none rounded-[var(--radius-md)]">
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
