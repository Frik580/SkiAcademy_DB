import React from 'react';
import type { ResortConditionsPresentation } from '../../../resort-conditions';
import { useResortConditionsTranslations } from '../../../resort-conditions/hooks/useResortConditionsTranslations';
import {
  formatLessonFeedbackDateLabel,
  type LessonFeedbackView,
} from '../../studentLessonFeedbackPresentation';
import { ScSectionTitle, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { AnimatedNumber } from '../../../../ui/AnimatedNumber';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export type StudentCabinetResortSnapshot = ResortConditionsPresentation;

interface StudentLatestRecommendationSectionProps {
  scopeParticipant?: SessionParticipantInput;
  latest: LessonFeedbackView | null;
  highlightPending: boolean;
  highlightText: string | null;
  loading?: boolean;
  onOpenLesson: (lessonBookingId: string) => void;
}

export const StudentLatestRecommendationSection: React.FC<
  StudentLatestRecommendationSectionProps
> = ({
  latest,
  highlightPending,
  highlightText,
  loading = false,
  onOpenLesson,
  scopeParticipant,
}) => {
  const { lang, t } = useStudentCabinetTranslations();
  const dateLabel = latest
    ? formatLessonFeedbackDateLabel(latest.lessonDate, lang) || latest.lessonDate
    : '';
  const instructorLabel = latest?.instructorName;

  return (
    <section className="py-6 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <ScSectionTitle>{t('scLatestCoachRecommendation')}</ScSectionTitle>
        <ParticipantScopeIndicator
          participant={scopeParticipant}
          visible={Boolean(scopeParticipant)}
        />
      </div>
      {loading ? (
        <p className="text-sm text-[var(--ink-dim)]">{t('loading')}</p>
      ) : !latest || !highlightText ? (
        <p className="text-sm text-[var(--ink-dim)]">{t('scNoLatestRecommendation')}</p>
      ) : (
        <ScTintCard tint="amber" className="px-4 py-3.5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-[var(--ink-dim)]">
                {[dateLabel, instructorLabel].filter(Boolean).join(' · ')}
              </p>
              <p className="text-sm text-[var(--ink)] leading-relaxed">{highlightText}</p>
            </div>
            {highlightPending && <RecommendationIndicator pending className="shrink-0 mt-0.5" />}
          </div>
          <ScTextButton onClick={() => onOpenLesson(latest.lessonBookingId)}>
            {t('scMoreDetails')}
          </ScTextButton>
        </ScTintCard>
      )}
    </section>
  );
};

interface StudentCabinetWeatherSectionProps {
  resort: StudentCabinetResortSnapshot;
  onToggleTemperatureUnit?: () => void;
}

export const StudentCabinetWeatherSection: React.FC<StudentCabinetWeatherSectionProps> = ({
  resort,
  onToggleTemperatureUnit,
}) => {
  const { language, t } = useResortConditionsTranslations();
  const {
    temperature: displayTemp,
    conditionKey,
    snow: snowDepthCm,
    wind: windKmh,
    resortStatusKey,
  } = resort;

  return (
    <section className="py-6 space-y-3">
      <ScSectionTitle tint="sky">{t('scWeatherOnSlope')}</ScSectionTitle>
      <ScTintCard tint="sky" className="px-4 py-3.5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-[var(--ink)]">
              {language === 'ru' ? resort.nameRu : resort.nameEn}
            </p>
            <p className="text-xs text-[var(--ink-dim)]">
              {t(
                conditionKey ??
                  (resort.status === 'loading' ? 'conditionsLoading' : 'conditionsUnavailable')
              )}
            </p>
          </div>
          {displayTemp !== null && (
            <button
              type="button"
              onClick={onToggleTemperatureUnit}
              className="font-serif text-3xl font-light text-[var(--ink)] leading-none shrink-0 bg-transparent border-0 p-0 cursor-pointer"
              aria-label={t('mountainTemp')}
            >
              <AnimatedNumber value={displayTemp} />°
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-[var(--ink-dim)]">
          {snowDepthCm !== null && (
            <span>
              {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
            </span>
          )}
          {windKmh !== null && (
            <span>
              {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
            </span>
          )}
        </div>
        {resortStatusKey && (
          <p
            className={`text-xs sm:text-sm font-medium ${resortStatusKey === 'closedToday' ? 'text-rose-500' : 'text-[var(--ink)]'}`}
          >
            {t(resortStatusKey)}
          </p>
        )}
      </ScTintCard>
    </section>
  );
};
