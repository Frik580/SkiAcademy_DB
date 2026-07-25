import React from 'react';
import { motion } from 'motion/react';
import { Auth } from '../Auth';
import { BookingModalHeader } from './BookingModalHeader';
import { GuestBookingForm } from './GuestBookingForm';
import { useBookingModal } from './useBookingModal';

interface BookingAuthShellProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const BookingAuthShell: React.FC<BookingAuthShellProps> = ({ workspace }) => {
  const { targetInstructor, t, onClose, unauthTab, setUnauthTab, onAuthSuccess } = workspace;

  if (!targetInstructor) return null;

  return (
    <motion.div
      key="signin-modal"
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 15 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-none flex flex-col max-h-[90vh]"
    >
      <BookingModalHeader targetInstructor={targetInstructor} t={t} onClose={onClose} />

      <div className="grid grid-cols-2 border-b border-[var(--border)] bg-black/5 font-mono text-xs shrink-0">
        <button
          type="button"
          onClick={() => setUnauthTab('guest')}
          className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
            unauthTab === 'guest'
              ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          📝 {t('guestBookingTab')}
        </button>
        <button
          type="button"
          onClick={() => setUnauthTab('auth')}
          className={`py-2.5 px-3 text-center font-bold uppercase tracking-wider transition cursor-pointer ${
            unauthTab === 'auth'
              ? 'bg-[var(--bg)] text-[var(--ink)] border-b-2 border-sky-600 dark:border-sky-400'
              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          🔐 {t('authTab')}
        </button>
      </div>

      <div className="p-6 overflow-y-auto space-y-4">
        {unauthTab === 'auth' ? (
          <div className="space-y-4">
            <p className="text-[11px] font-mono text-[var(--ink-dim)] uppercase tracking-wider text-center leading-relaxed">
              {t('bookingSignInPrompt')}
            </p>
            <div className="border border-[var(--border)] p-4 bg-black/10">
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
