import { useResortConditionsTranslations } from '../hooks/useResortConditionsTranslations';
import {
  measurementValue,
  temperatureValue,
  updatedTime,
  visibilityKey,
  weatherConditionKey,
} from '../model/presentation';
import type { ResortConditionsState, TemperatureUnit } from '../model/conditions';
import './conditionsStrip.css';

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontal scroll region needs keyboard focus. */

interface ConditionsStripInput {
  conditions: ResortConditionsState;
  unit: TemperatureUnit;
  onToggleUnit: () => void;
}

export function ConditionsStrip({ conditions, unit, onToggleUnit }: ConditionsStripInput) {
  const { t, language } = useResortConditionsTranslations();
  const data = conditions.data;
  const conditionKey = weatherConditionKey(data?.weatherCode ?? null);
  const visibility = visibilityKey(data?.visibilityM ?? null);
  const time = updatedTime(data?.updatedAt ?? null, language);
  const temperature = data?.temperatureC;
  const feelsLike = data?.apparentTemperatureC;
  const displayedTemperature = temperature != null ? temperatureValue(temperature, unit) : null;
  const apparentLabel =
    feelsLike != null
      ? `${t('conditionsFeelsLike')} ${temperatureValue(feelsLike, unit)}°`
      : undefined;
  const wind = measurementValue(data?.windKmh);
  const gusts = measurementValue(data?.windGustKmh);
  const snow = measurementValue(data?.snowDepthCm);
  const gustsLabel =
    gusts != null ? `${t('conditionsGusts')} ${gusts} ${t('kilometersPerHourShort')}` : undefined;

  return (
    <section className="conditions-strip" aria-label={t('conditionsResortWeather')}>
      <div
        className="conditions-strip-scroll max-w-7xl mx-auto px-4 sm:px-8"
        tabIndex={0}
        role="region"
        aria-label={t('conditionsScroll')}
      >
        <div className="conditions-strip-row">
          <ul
            className="conditions-strip-items conditions-strip__main"
            aria-live="polite"
            aria-busy={conditions.status === 'loading'}
          >
            <li className="font-medium tracking-wide">{t('conditionsResortName')}</li>
            {conditions.status !== 'ready' && (
              <li>
                {t(conditions.status === 'loading' ? 'conditionsLoading' : 'conditionsUnavailable')}
              </li>
            )}
            {(temperature != null || conditionKey) && (
              <li title={apparentLabel}>
                {temperature != null && (
                  <strong className="font-medium tabular-nums">{displayedTemperature}°</strong>
                )}
                {conditionKey && <span>{t(conditionKey)}</span>}
              </li>
            )}
            {wind != null && (
              <li title={gustsLabel}>
                <span className="conditions-label">{t('conditionsWind')}</span>
                <span>
                  {wind} {t('kilometersPerHourShort')}
                </span>
              </li>
            )}
            {snow != null && (
              <li>
                <span className="conditions-label">{t('snowCover')}</span>
                <span>
                  {snow} {t('centimetersShort')}
                </span>
              </li>
            )}
            {visibility && (
              <li>
                <span className="conditions-label">{t('conditionsVisibility')}</span>
                <span>{t(visibility)}</span>
              </li>
            )}
            {data?.liftsOpen != null && data.liftsTotal != null && (
              <li>
                <span className="conditions-label">{t('operatingLifts')}</span>
                <span>
                  {data.liftsOpen}/{data.liftsTotal}
                </span>
              </li>
            )}
            {data?.trailsOpen != null && (
              <li>
                <span className="conditions-label">{t('conditionsTrails')}</span>
                <span>{data.trailsOpen}</span>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={onToggleUnit}
                aria-label={t(
                  unit === 'celsius' ? 'conditionsSwitchFahrenheit' : 'conditionsSwitchCelsius'
                )}
                className="conditions-unit"
              >
                <span className={unit === 'celsius' ? 'font-semibold' : 'conditions-label'}>
                  °C
                </span>
                <span aria-hidden="true" className="conditions-label">
                  {' '}
                  /{' '}
                </span>
                <span className={unit === 'fahrenheit' ? 'font-semibold' : 'conditions-label'}>
                  °F
                </span>
              </button>
            </li>
          </ul>
          <div className="conditions-strip__meta conditions-label">
            {time && (
              <span className="conditions-updated">
                {t('lastUpdated')} <time dateTime={data?.updatedAt ?? undefined}>{time}</time>
                <span aria-hidden="true">·</span>
              </span>
            )}
            <span className="conditions-source">
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
