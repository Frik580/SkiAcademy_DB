import React from 'react';
import { X } from 'lucide-react';
import { Instructor } from '../../types';
import { type TranslationKey } from '../../lib/LanguageContext';

interface BookingModalHeaderProps {
  targetInstructor: Instructor;
  t: (key: TranslationKey) => string;
  onClose: () => void;
}

export const BookingModalHeader: React.FC<BookingModalHeaderProps> = ({
  targetInstructor,
  t,
  onClose,
}) => (
  <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 shrink-0">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 border border-[var(--border)] rounded-full overflow-hidden bg-black/5 dark:bg-white/5 shrink-0 filter grayscale">
        <img
          src={targetInstructor.avatarUrl}
          alt={targetInstructor.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div>
        <h3 className="font-serif text-lg font-light text-[var(--ink)]">
          {t('bookLessonWith')} {targetInstructor.name}
        </h3>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
          ${targetInstructor.pricePerHour}/{t('hr')} • {t('privateInstruction')}
        </p>
      </div>
    </div>
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
