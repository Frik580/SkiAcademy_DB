import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import React from 'react';
import type { ResortConditionsPresentation } from '../../../resort-conditions';
import { useResortConditionsTranslations } from '../../../resort-conditions/hooks/useResortConditionsTranslations';
import {
  formatLessonFeedbackDateLabel,
  type LessonFeedbackView,
} from '../../studentLessonFeedbackPresentation';
import { ScTextButton } from './StudentCabinetUI';
import { AnimatedNumber } from '../../../../ui/AnimatedNumber';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { ParticipantAvatarFace } from '../CabinetParticipantAvatarSwitcher';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import './studentLatestRecommendation.css';
import './studentCabinetWeather.css';

const WEATHER_CONDITION_ICONS: Partial<Record<string, LucideIcon>> = {
  conditionsClear: Sun,
  weatherSunny: Sun,
  weatherCloudy: Cloud,
  weatherFog: CloudFog,
  weatherRain: CloudRain,
  weatherSnow: Snowflake,
  weatherThunderstorm: CloudLightning,
};

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
    <section className="sc-latest-recommendation">
      <StudentDashboardTileHeader
        title={t('scLatestCoachRecommendation')}
        actions={
          <ParticipantScopeIndicator
            participant={scopeParticipant}
            visible={Boolean(scopeParticipant)}
          />
        }
      />
      <StudentDashboardTileBody>
        {loading ? (
          <p className="sc-latest-recommendation-state" role="status">
            {t('loading')}
          </p>
        ) : !latest || !highlightText ? (
          <p className="sc-latest-recommendation-state">{t('scNoLatestRecommendation')}</p>
        ) : (
          <div className="sc-latest-recommendation-content">
            {(dateLabel || highlightPending) && (
              <div className="sc-latest-recommendation-meta">
                {dateLabel && <p className="sc-latest-recommendation-date">{dateLabel}</p>}
                {highlightPending && <RecommendationIndicator pending />}
              </div>
            )}
            <blockquote className="sc-latest-recommendation-quote">{highlightText}</blockquote>
            <div className="sc-latest-recommendation-footer">
              {instructorLabel && (
                <div className="sc-latest-recommendation-coach">
                  <span className="sc-latest-recommendation-avatar" aria-hidden="true">
                    <ParticipantAvatarFace name={instructorLabel} />
                  </span>
                  <p className="sc-latest-recommendation-name">{instructorLabel}</p>
                </div>
              )}
              <ScTextButton
                className="sc-latest-recommendation-action"
                onClick={() => onOpenLesson(latest.lessonBookingId)}
              >
                {t('scMoreDetails')}
              </ScTextButton>
            </div>
          </div>
        )}
      </StudentDashboardTileBody>
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
    temperature,
    apparentTemperature,
    conditionKey,
    snow,
    wind,
    visibility,
    resortStatusKey,
  } = resort;
  const resortName = (language === 'ru' ? resort.nameRu : resort.nameEn).trim();
  const displayTemperature = temperature !== null && Number.isFinite(temperature);
  const displayApparentTemperature =
    apparentTemperature !== null && Number.isFinite(apparentTemperature);
  const displaySnow = snow !== null && Number.isFinite(snow);
  const displayWind = wind !== null && Number.isFinite(wind);
  const ConditionIcon = (conditionKey && WEATHER_CONDITION_ICONS[conditionKey]) || Cloud;
  const conditionFallbackKey =
    resort.status === 'loading'
      ? 'conditionsLoading'
      : resort.status === 'error'
        ? 'conditionsUnavailable'
        : 'conditionsUnknown';
  const conditionLabel = t(conditionKey ?? conditionFallbackKey);
  const temperatureLabel = t(
    resort.unit === 'celsius' ? 'conditionsSwitchFahrenheit' : 'conditionsSwitchCelsius'
  );

  return (
    <section className="sc-weather-tile" aria-busy={resort.status === 'loading'}>
      <StudentDashboardTileHeader
        title={t('scWeatherOnSlope')}
        actions={
          resortStatusKey ? (
            <span
              data-weather-status={resortStatusKey}
              className={`sc-weather-status ${resortStatusKey === 'closedToday' ? 'is-closed' : ''}`}
            >
              {t(resortStatusKey)}
            </span>
          ) : undefined
        }
      />
      <StudentDashboardTileBody>
        <div className="sc-weather-summary">
          <div className="sc-weather-copy">
            {resortName && (
              <p className="sc-weather-resort-name" data-weather-resort-name>
                {resortName}
              </p>
            )}
            <p className="sc-weather-condition" aria-live="polite">
              <ConditionIcon
                data-weather-condition-icon={conditionKey ?? 'unknown'}
                aria-hidden="true"
                focusable="false"
              />
              <span>{conditionLabel}</span>
            </p>
          </div>
          {displayTemperature && (
            <div className="sc-weather-temperature-group">
              {onToggleTemperatureUnit ? (
                <button
                  type="button"
                  onClick={onToggleTemperatureUnit}
                  className="sc-weather-temperature"
                  data-weather-temperature
                  data-testid="weather-temperature"
                  aria-label={`${temperature}°${resort.unit === 'celsius' ? 'C' : 'F'}. ${temperatureLabel}`}
                >
                  <AnimatedNumber value={temperature} />°
                  <span>{resort.unit === 'celsius' ? 'C' : 'F'}</span>
                </button>
              ) : (
                <span
                  className="sc-weather-temperature"
                  data-weather-temperature
                  data-testid="weather-temperature"
                >
                  <AnimatedNumber value={temperature} />°
                  <span>{resort.unit === 'celsius' ? 'C' : 'F'}</span>
                </span>
              )}
              {displayApparentTemperature && (
                <span className="sc-weather-apparent">
                  {t('conditionsFeelsLike')} {apparentTemperature}°
                  {resort.unit === 'celsius' ? 'C' : 'F'}
                </span>
              )}
            </div>
          )}
        </div>
        {(displaySnow || displayWind || visibility) && (
          <div className="sc-weather-metrics">
            {displaySnow && (
              <div className="sc-weather-metric">
                <span className="sc-weather-metric-label">{t('snowCover')}</span>
                <span className="sc-weather-metric-value">
                  <AnimatedNumber value={snow} /> {t('centimetersShort')}
                </span>
              </div>
            )}
            {displayWind && (
              <div className="sc-weather-metric">
                <span className="sc-weather-metric-label">{t('windSpeed')}</span>
                <span className="sc-weather-metric-value">
                  <AnimatedNumber value={wind} /> {t('kilometersPerHourShort')}
                </span>
              </div>
            )}
            {visibility && (
              <div className="sc-weather-metric">
                <span className="sc-weather-metric-label">{t('conditionsVisibility')}</span>
                <span className="sc-weather-metric-value">{t(visibility)}</span>
              </div>
            )}
          </div>
        )}
      </StudentDashboardTileBody>
    </section>
  );
};
