import React from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { formatPointsGain } from '../../../lib/i18n/pluralize';
import { NextStepAction } from './studentCabinetUtils';

interface StudentNextStepCardProps {
  action: NextStepAction;
  onStartExercise: (exerciseId: string) => void;
  onOpenRecommendation: (bookingId: string) => void;
  onContinueDevelopment: () => void;
  className?: string;
}

export const StudentNextStepCard: React.FC<StudentNextStepCardProps> = ({
  action,
  onStartExercise,
  onOpenRecommendation,
  onContinueDevelopment,
  className = '',
}) => {
  const { t, language } = useLanguage();

  const body =
    action.kind === 'exercise'
      ? (action.levelProgressDelta > 0
          ? t('scNextStepExerciseBody')
          : t('scNextStepExerciseBodyPointsOnly')
        )
          .replace('{title}', action.exerciseTitle)
          .replace('{pointsLabel}', formatPointsGain(action.pointsGain, language))
          .replace('{delta}', String(action.levelProgressDelta))
          .replace('{level}', String(action.targetLevel))
      : action.kind === 'recommendation'
        ? t('scNextStepRecommendationBody').replace('{title}', action.label)
        : t('scNextStepCompleteBody');

  const ctaLabel =
    action.kind === 'exercise'
      ? t('scNextStepStartTraining')
      : action.kind === 'recommendation'
        ? t('scNextStepOpenLesson')
        : t('scNextStepExploreDevelopment');

  const handleClick = () => {
    if (action.kind === 'exercise') {
      onStartExercise(action.exerciseId);
      return;
    }
    if (action.kind === 'recommendation') {
      onOpenRecommendation(action.bookingId);
      return;
    }
    onContinueDevelopment();
  };

  return (
    <div
      className={`rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-muted)]/40 px-4 py-4 sm:px-5 sm:py-5 space-y-3.5 flex flex-col ${className}`}
    >
      <p className="text-sm sm:text-[15px] text-[var(--ink)] leading-relaxed flex-1">{body}</p>
      <button
        type="button"
        onClick={handleClick}
        className="btn-primary w-full sm:w-auto px-5 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5 mt-auto"
      >
        {ctaLabel}
        <span aria-hidden>→</span>
      </button>
    </div>
  );
};
