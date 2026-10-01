import React from 'react';
import { X } from 'lucide-react';
import { Instructor } from '../../../../types';
import { type TranslationKey } from '../../../../app/providers/LanguageContext';

interface BookingModalHeaderProps {
  targetInstructor: Instructor;
  t: (key: TranslationKey) => string;
  onClose: () => void;
}

export const BookingModalHeader: React.FC<BookingModalHeaderProps> = ({
  t,
  onClose,
}) => (
  <div className="flex shrink-0 items-center justify-end border-b border-[var(--border)] bg-black/5 p-2 dark:bg-white/5">
    <button
      type="button"
      onClick={onClose}
      className="p-2 rounded-full hover:bg-[var(--profile-bg)] transition-colors text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer z-10"
      aria-label={t('cancel')}
    >
      <X className="w-5 h-5" />
    </button>
  </div>
);
