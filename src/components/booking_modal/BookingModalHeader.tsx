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
  <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10 shrink-0">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 border border-[var(--border)] rounded-none overflow-hidden bg-black/15 shrink-0 filter grayscale">
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
      className="p-1.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);
