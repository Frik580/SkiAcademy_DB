import React from 'react';
import { Award } from 'lucide-react';
import { type TranslationKey } from '../../../app/providers/LanguageContext';

interface StudentAssessButtonProps {
  t: (key: TranslationKey) => string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  labelKey?: TranslationKey;
}

export const StudentAssessButton: React.FC<StudentAssessButtonProps> = ({
  t,
  onClick,
  disabled = false,
  title,
  ariaLabel,
  labelKey = 'instructorAssess',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className="px-2.5 py-1 badge-accent-outline type-button uppercase transition flex items-center gap-1 rounded-xs disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    title={title ?? t(labelKey)}
  >
    <Award className="w-3 h-3 text-accent" />
    {t(labelKey)}
  </button>
);
