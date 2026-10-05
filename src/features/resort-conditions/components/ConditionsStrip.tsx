import { useResortConditionsTranslations } from '../hooks/useResortConditionsTranslations';
import { updatedTime, type ResortConditionsPresentation } from '../model/presentation';
import './conditionsStrip.css';

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontal scroll region needs keyboard focus. */

interface ConditionsStripInput {
  presentation: ResortConditionsPresentation;
  onToggleUnit: () => void;
}

export function ConditionsStrip({ presentation, onToggleUnit }: ConditionsStripInput) {
  const { t, language } = useResortConditionsTranslations();
  const { unit, temperature, conditionKey, visibility, wind, gusts, snow, resortStatusKey } =
    presentation;
  const time = updatedTime(presentation.updatedAt, language);
  const apparentLabel =
    presentation.apparentTemperature != null
      ? `${t('conditionsFeelsLike')} ${presentation.apparentTemperature}°`
      : undefined;
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
            aria-busy={presentation.status === 'loading'}
          >
            <li className="font-medium tracking-wide">
              {language === 'ru' ? presentation.nameRu : presentation.nameEn}
            </li>
            {presentation.status !== 'ready' && (
              <li>
                {t(
                  presentation.status === 'loading' ? 'conditionsLoading' : 'conditionsUnavailable'
                )}
              </li>
            )}
            {(temperature != null || conditionKey) && (
              <li title={apparentLabel}>
                {temperature != null && (
                  <strong className="font-medium tabular-nums">{temperature}°</strong>
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
    </section>
  );
}
