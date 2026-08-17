import React from 'react';
import { Booking, Course, ResortConfig } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { getLatestCoachRecommendation } from '../../../../features/student-cabinet/lessonRecommendations';
import { getWeatherConditionKey } from '../../../../shared';
import { formatBookingDayMonth } from './studentCabinetUtils';
import { ScSectionTitle, ScTextButton, ScTintCard } from './StudentCabinetUI';
import { AnimatedNumber } from '../../../../ui/AnimatedNumber';
import { RecommendationIndicator } from '../RecommendationIndicator';

export interface StudentCabinetResortSnapshot {
  resortConfig: ResortConfig;
  tempC: number;
  snowDepthCm: number;
  windKmh: number;
  weatherCode: number;
  isFahrenheit: boolean;
}

interface StudentLatestRecommendationSectionProps {
  bookings: Booking[];
  courses: Course[];
  userId: string;
  onOpenLesson: (booking: Booking) => void;
}

export const StudentLatestRecommendationSection: React.FC<
  StudentLatestRecommendationSectionProps
> = ({ bookings, courses, userId, onOpenLesson }) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const latest = getLatestCoachRecommendation(bookings, userId);

  return (
    <section className="py-6 space-y-3">
      <ScSectionTitle>{t('scLatestCoachRecommendation')}</ScSectionTitle>
      {!latest ? (
        <p className="text-sm text-[var(--ink-dim)]">{t('scNoLatestRecommendation')}</p>
      ) : (
        <ScTintCard tint="amber" className="px-4 py-3.5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-[var(--ink-dim)]">
                {formatBookingDayMonth(latest.booking, courses, lang)} ·{' '}
                {latest.booking.instructorName}
              </p>
              <p className="text-sm text-[var(--ink)] leading-relaxed">
                {latest.recommendation.text}
              </p>
            </div>
            {latest.isPending && <RecommendationIndicator pending className="shrink-0 mt-0.5" />}
          </div>
          <ScTextButton onClick={() => onOpenLesson(latest.booking)}>
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
  const { language, t } = useLanguage();
  const { resortConfig, tempC, snowDepthCm, windKmh, weatherCode, isFahrenheit } = resort;

  const statusText =
    language === 'ru'
      ? resortConfig.liftsStatusRu || 'ОТКРЫТО'
      : resortConfig.liftsStatusEn || 'OPEN';
  const isClosed =
    statusText.toUpperCase().includes('CLOSE') ||
    statusText.toUpperCase().includes('ЗАКР') ||
    statusText.toUpperCase().includes('OFF');

  const displayTemp = isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC;

  return (
    <section className="py-6 space-y-3">
      <ScSectionTitle tint="sky">{t('scWeatherOnSlope')}</ScSectionTitle>
      <ScTintCard tint="sky" className="px-4 py-3.5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-[var(--ink)]">
              {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
            </p>
            <p className="text-xs text-[var(--ink-dim)]">
              {t(getWeatherConditionKey(weatherCode))}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleTemperatureUnit}
            className="font-serif text-3xl font-light text-[var(--ink)] leading-none shrink-0 bg-transparent border-0 p-0 cursor-pointer"
            aria-label={t('mountainTemp')}
          >
            <AnimatedNumber value={displayTemp} />°
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-[var(--ink-dim)]">
          <span>
            {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
          </span>
          <span>
            {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </span>
        </div>
        {resortConfig.showLifts !== false && (
          <p
            className={`text-xs sm:text-sm font-medium ${isClosed ? 'text-rose-500' : 'text-[var(--ink)]'}`}
          >
            {isClosed ? t('closedToday') : t('openToday')}
          </p>
        )}
      </ScTintCard>
    </section>
  );
};
