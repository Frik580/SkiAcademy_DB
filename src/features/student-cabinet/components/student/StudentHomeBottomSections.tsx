import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import React, { useEffect, useState } from 'react';
import type { ResortConditionsPresentation } from '../../../resort-conditions';
import { useResortConditionsTranslations } from '../../../resort-conditions/hooks/useResortConditionsTranslations';
import {
  formatLessonFeedbackDateLabel,
  type LessonFeedbackContext,
} from '../../studentLessonFeedbackPresentation';
import { ScTextButton } from './StudentCabinetUI';
import { AnimatedNumber } from '../../../../ui/AnimatedNumber';
import { queryManagedRecommendationsPage } from '../../../participant-lesson-feedback/participantLessonFeedbackService';
import { useParticipantLessonFeedbackStore } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
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

interface StudentCoachRecommendationsSectionProps {
  participantId?: string;
  scopeParticipant?: SessionParticipantInput;
  instructorNames: ReadonlyMap<string, string>;
  lessonContext: ReadonlyMap<string, LessonFeedbackContext>;
  onOpenLesson: (lessonBookingId: string) => void;
}

type RecommendationPage = Awaited<ReturnType<typeof queryManagedRecommendationsPage>>;

export const StudentCoachRecommendationsSection: React.FC<
  StudentCoachRecommendationsSectionProps
> = ({ participantId, scopeParticipant, instructorNames, lessonContext, onOpenLesson }) => {
  const { lang, t } = useStudentCabinetTranslations();
  const feedbackItems = useParticipantLessonFeedbackStore((state) =>
    participantId ? state.byParticipantId[participantId]?.items : undefined
  );
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors.at(-1);
  const [response, setResponse] = useState<{
    cursor: typeof cursor;
    attempt: number;
    feedbackItems: typeof feedbackItems;
    page: RecommendationPage | null;
  }>();

  useEffect(() => {
    if (!participantId) return;
    const controller = new AbortController();
    void queryManagedRecommendationsPage(participantId, cursor, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setResponse({ cursor, attempt, feedbackItems, page });
      },
      () => {
        if (!controller.signal.aborted) setResponse({ cursor, attempt, feedbackItems, page: null });
      }
    );
    return () => {
      controller.abort();
    };
  }, [participantId, cursor, attempt, feedbackItems]);

  const page = !participantId
    ? { items: [], nextCursor: null }
    : response &&
        response.cursor === cursor &&
        response.attempt === attempt &&
        response.feedbackItems === feedbackItems
      ? response.page
      : undefined;
  const loading = page === undefined;
  const nextCursor = page?.nextCursor;
  return (
    <section className="sc-latest-recommendation" aria-label={t('scCoachRecommendations')}>
      <StudentDashboardTileHeader
        title={t('scCoachRecommendations')}
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
        ) : page === null ? (
          <div>
            <p className="sc-latest-recommendation-state" role="alert">
              {t('scCoachRecommendationsError')}
            </p>
            <ScTextButton
              className="sc-latest-recommendation-action"
              onClick={() => setAttempt(attempt + 1)}
            >
              {t('retry')}
            </ScTextButton>
          </div>
        ) : page.items.length === 0 ? (
          <p className="sc-latest-recommendation-state">{t('scNoCoachRecommendations')}</p>
        ) : (
          <ul className="sc-latest-recommendation-list">
            {page.items.map((item) => {
              const context = lessonContext.get(item.lessonBookingId);
              const instructorName = item.instructorId
                ? (instructorNames.get(item.instructorId) ??
                  (context?.instructorId === item.instructorId
                    ? context?.instructorName
                    : undefined))
                : undefined;
              const date = formatLessonFeedbackDateLabel(
                item.lessonDate ?? context?.date,
                lang,
                true
              );
              return (
                <li
                  key={JSON.stringify([item.lessonBookingId, item.itemId])}
                  className="sc-latest-recommendation-content"
                >
                  <div className="sc-latest-recommendation-meta">
                    {date && <p className="sc-latest-recommendation-date">{date}</p>}
                    <p className="sc-latest-recommendation-state">
                      {t(
                        item.completed ? 'scRecommendationCompleted' : 'scRecommendationIncomplete'
                      )}
                    </p>
                  </div>
                  <blockquote className="sc-latest-recommendation-quote">{item.text}</blockquote>
                  {(instructorName || item.lessonAvailable) && (
                    <div className="sc-latest-recommendation-footer">
                      {instructorName && (
                        <div className="sc-latest-recommendation-coach">
                          <span className="sc-latest-recommendation-avatar" aria-hidden="true">
                            <ParticipantAvatarFace name={instructorName} />
                          </span>
                          <p className="sc-latest-recommendation-name">{instructorName}</p>
                        </div>
                      )}
                      {item.lessonAvailable && (
                        <ScTextButton
                          className="sc-latest-recommendation-action"
                          onClick={() => onOpenLesson(item.lessonBookingId)}
                        >
                          {t('scMoreDetails')}
                        </ScTextButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(cursors.length > 1 || Boolean(nextCursor)) && (
          <div className="sc-latest-recommendation-pagination">
            {cursors.length > 1 && (
              <ScTextButton
                className="sc-latest-recommendation-action"
                aria-disabled={loading}
                onClick={() => {
                  if (!loading) setCursors(cursors.slice(0, -1));
                }}
              >
                {t('scRecommendationPrevious')}
              </ScTextButton>
            )}
            {nextCursor && (
              <ScTextButton
                className="sc-latest-recommendation-action sc-latest-recommendation-next"
                onClick={() => setCursors([...cursors, nextCursor])}
              >
                {t('scRecommendationNext')}
              </ScTextButton>
            )}
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
