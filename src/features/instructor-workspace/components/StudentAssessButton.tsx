import React from 'react';
import { Award } from 'lucide-react';
import { type TranslationKey } from '../../../app/providers/LanguageContext';

interface StudentAssessButtonProps {
  t: (key: TranslationKey) => string;
  onClick: () => void;
}

export const StudentAssessButton: React.FC<StudentAssessButtonProps> = ({ t, onClick }) => (
  <button
    onClick={onClick}
    className="px-2.5 py-1 badge-accent-outline text-[9px] font-mono uppercase tracking-wider transition cursor-pointer flex items-center gap-1 rounded-xs font-bold"
    title="Оценить навыки ученика"
  >
    <Award className="w-3 h-3 text-accent" />
    {t('instructorAssess')}
  </button>
);
