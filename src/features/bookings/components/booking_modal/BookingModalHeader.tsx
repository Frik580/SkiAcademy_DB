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
  targetInstructor,
  t,
  onClose,
}) => (
  <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-black/5 p-4 dark:bg-white/5">
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-black/5 filter grayscale dark:bg-white/5">
        <img
          src={targetInstructor.avatarUrl}
          alt={targetInstructor.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-serif text-base font-light text-[var(--ink)]">
          {t('bookLessonWith')} {targetInstructor.name}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-[var(--ink-dim)]">
          ${targetInstructor.pricePerHour}/{t('hr')} · {t('privateInstruction')}
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
