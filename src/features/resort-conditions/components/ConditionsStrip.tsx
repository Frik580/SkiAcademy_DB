import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useResortConditionsTranslations } from '../hooks/useResortConditionsTranslations';
import { updatedTime, type ResortConditionsPresentation } from '../model/presentation';
import './conditionsStrip.css';

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontal scroll region needs keyboard focus. */

interface ConditionsStripInput {
  presentation: ResortConditionsPresentation;
  onToggleUnit: () => void;
}

export function ConditionsStrip({ presentation, onToggleUnit }: ConditionsStripInput) {
  const unitDescriptionId = useId();
  const metricsRef = useRef<HTMLDivElement>(null);
  const [hasMoreMetrics, setHasMoreMetrics] = useState(false);
  const { t, language } = useResortConditionsTranslations();
  const { unit, temperature, conditionKey, visibility, wind, gusts, snow, resortStatusKey } =
    presentation;
  const time = updatedTime(presentation.updatedAt, language);
  const resortName = language === 'ru' ? presentation.nameRu : presentation.nameEn;
  const shortName = /^Shymbulak(?: Mountain Resort)?$/i.test(presentation.nameEn.trim())
    ? language === 'ru'
      ? 'Шымбулак'
      : 'Shymbulak'
    : resortName;
  useEffect(() => {
    const metrics = metricsRef.current;
    if (!metrics) return;
    const updateOverflow = () =>
      setHasMoreMetrics(metrics.scrollWidth - metrics.clientWidth - metrics.scrollLeft > 1);
    updateOverflow();
    metrics.addEventListener('scroll', updateOverflow, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow);
    observer?.observe(metrics);
    for (const child of metrics.children) observer?.observe(child);
    window.addEventListener('resize', updateOverflow);
    return () => {
      metrics.removeEventListener('scroll', updateOverflow);
      observer?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [presentation, language]);
  const apparentLabel =
    presentation.apparentTemperature != null
      ? `${t('conditionsFeelsLike')} ${presentation.apparentTemperature}°`
      : undefined;
  const gustsLabel =
    gusts != null ? `${t('conditionsGusts')} ${gusts} ${t('kilometersPerHourShort')}` : undefined;
  const ConditionIcon =
    conditionKey === 'conditionsClear' || conditionKey === 'weatherSunny'
      ? Sun
      : conditionKey === 'weatherFog'
        ? CloudFog
        : conditionKey === 'weatherRain'
          ? CloudRain
          : conditionKey === 'weatherSnow'
            ? CloudSnow
            : conditionKey === 'weatherThunderstorm'
              ? CloudLightning
              : Cloud;

  return (
    <section className="conditions-strip" aria-label={t('conditionsResortWeather')}>
      <div
        className="conditions-strip-scroll max-w-7xl mx-auto px-4 sm:px-8"
        tabIndex={0}
        role="region"
        aria-label={t('conditionsScroll')}
      >
        <div
          className="conditions-strip-row"
          aria-live="polite"
          aria-busy={presentation.status === 'loading'}
        >
          <ul className="conditions-strip-items conditions-strip__main">
            <li className="conditions-resort">
              <span className="conditions-resort-full">{resortName}</span>
              {shortName !== resortName && (
                <span className="conditions-resort-short" aria-hidden="true">
                  {shortName}
                </span>
              )}
            </li>
            {(temperature != null || conditionKey) && (
              <li className="conditions-weather" title={apparentLabel}>
                {temperature != null && (
                  <strong className="conditions-temperature">{temperature}°</strong>
                )}
                {conditionKey && (
                  <span className="conditions-condition">
                    <ConditionIcon className="conditions-icon" size={17} aria-hidden="true" />
                    <span>{t(conditionKey)}</span>
                  </span>
                )}
              </li>
            )}
          </ul>
          <ul className="conditions-strip-items conditions-strip__unit">
            <li>
              <button
                type="button"
                onClick={onToggleUnit}
                aria-describedby={unitDescriptionId}
                aria-label={t(
                  unit === 'celsius' ? 'conditionsSwitchFahrenheit' : 'conditionsSwitchCelsius'
                )}
                className="conditions-unit"
              >
                <span aria-hidden="true" data-active={unit === 'celsius'}>
                  °C
                </span>
                <span aria-hidden="true" data-active={unit === 'fahrenheit'}>
                  °F
                </span>
                <span id={unitDescriptionId} className="sr-only">
                  {unit === 'celsius' ? '°C' : '°F'}
                </span>
              </button>
            </li>
          </ul>
          <div className="conditions-metrics-frame" data-more={hasMoreMetrics}>
            <div
              className="conditions-metrics-scroll"
              ref={metricsRef}
              tabIndex={0}
              role="group"
              aria-label={t('conditionsScroll')}
            >
              <ul className="conditions-strip-items conditions-strip__secondary">
                {presentation.status !== 'ready' && (
                  <li className="conditions-state">
                    {t(
                      presentation.status === 'loading'
                        ? 'conditionsLoading'
                        : 'conditionsUnavailable'
                    )}
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
                {resortStatusKey && <li>{t(resortStatusKey)}</li>}
                {presentation.liftsOpen != null && presentation.liftsTotal != null && (
                  <li>
                    <span className="conditions-label">{t('operatingLifts')}</span>
                    <span>
                      {presentation.liftsOpen}/{presentation.liftsTotal}
                    </span>
                  </li>
                )}
                {presentation.trailsOpen != null && (
                  <li>
                    <span className="conditions-label">{t('conditionsTrails')}</span>
                    <span>{presentation.trailsOpen}</span>
                  </li>
                )}
              </ul>
              <div className="conditions-strip__meta conditions-label">
                {time && (
                  <span className="conditions-updated">
                    {t('lastUpdated')}{' '}
                    <time dateTime={presentation.updatedAt ?? undefined}>{time}</time>
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
        </div>
      </div>
    </section>
  );
}
