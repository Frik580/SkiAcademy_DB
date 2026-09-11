import React from 'react';
import { Award } from 'lucide-react';
import { type TranslationKey } from '../../../app/providers/LanguageContext';

interface StudentAssessButtonProps {
  t: (key: TranslationKey) => string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
}

export const StudentAssessButton: React.FC<StudentAssessButtonProps> = ({
  t,
  onClick,
  disabled = false,
  title,
  ariaLabel,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className="px-2.5 py-1 badge-accent-outline text-[9px] font-mono uppercase tracking-wider transition flex items-center gap-1 rounded-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    title={title ?? 'Оценить навыки ученика'}
  >
    <Award className="w-3 h-3 text-accent" />
    {t('instructorAssess')}
  </button>
);
