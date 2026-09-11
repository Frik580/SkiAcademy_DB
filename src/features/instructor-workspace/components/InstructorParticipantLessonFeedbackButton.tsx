import React from 'react';
import { ClipboardList } from 'lucide-react';
import { type TranslationKey } from '../../../app/providers/LanguageContext';

interface InstructorParticipantLessonFeedbackButtonProps {
  t: (key: TranslationKey) => string;
  studentName: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

export const InstructorParticipantLessonFeedbackButton: React.FC<
  InstructorParticipantLessonFeedbackButtonProps
> = ({ t, studentName, disabled = false, title, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`${studentName}: ${t('instructorRecommendations')}`}
    className="px-2.5 py-1 badge-accent-outline text-[9px] font-mono uppercase tracking-wider transition flex items-center gap-1 rounded-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
    title={title}
  >
    <ClipboardList className="w-3 h-3 text-accent" />
    {t('instructorRecommendations')}
  </button>
);
