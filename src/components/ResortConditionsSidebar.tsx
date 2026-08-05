import React from 'react';
import { useLanguage, type Language } from '../lib/LanguageContext';
import { getWeatherConditionKey } from '../lib/weatherCondition';
import { ResortConfig } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

interface ResortConditionsSidebarProps {
  data: {
    language: Language;
    resortConfig: ResortConfig;
    tempC: number;
    snowDepthCm: number;
    windKmh: number;
    weatherCode: number;
    isFahrenheit: boolean;
  };
  actions: {
    onToggleTemperatureUnit: () => void;
  };
}

export const ResortConditionsSidebar: React.FC<ResortConditionsSidebarProps> = ({
  data: { language, resortConfig, tempC, snowDepthCm, windKmh, weatherCode, isFahrenheit },
  actions: { onToggleTemperatureUnit },
}) => {
  const { t } = useLanguage();

  const resortName = language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn;
  const statusText =
    language === 'ru'
      ? resortConfig.liftsStatusRu || 'ОТКРЫТО'
      : resortConfig.liftsStatusEn || 'OPEN';
  const isClosed =
    statusText.toUpperCase().includes('CLOSE') ||
    statusText.toUpperCase().includes('ЗАКР') ||
    statusText.toUpperCase().includes('OFF');
  const showLifts = resortConfig.showLifts !== false;
  const weatherLabel = t(getWeatherConditionKey(weatherCode));
  const tempDisplay = (
    <>
      <AnimatedNumber value={isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC} />°
    </>
  );

  return (
    <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--layout-divider)] px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8 lg:pt-10 lg:pb-14 flex flex-col justify-start shrink-0 bg-transparent">
      {/* Mobile & tablet */}
      <div className="flex flex-col gap-3 w-full lg:hidden">
        <div className="flex items-center justify-between gap-4 w-full min-w-0">
          <p className="text-xs sm:text-sm text-[var(--ink)] leading-snug font-medium truncate min-w-0">
            {resortName}
          </p>
          {showLifts && (
            <p
              className={`shrink-0 text-xs sm:text-sm font-medium whitespace-nowrap ${
                isClosed ? 'text-rose-500' : 'text-[var(--ink)]'
              }`}
            >
              {isClosed ? t('closedToday') : t('openToday')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 w-full min-w-0 text-xs sm:text-sm text-[var(--ink-dim)]">
          <button
            type="button"
            onClick={onToggleTemperatureUnit}
            className="shrink-0 font-serif text-xl sm:text-2xl font-light text-[var(--ink)] leading-none tracking-tight bg-transparent border-0 p-0 cursor-pointer"
            aria-label={t('mountainTemp')}
          >
            {tempDisplay}
          </button>
          <span className="shrink-0 text-[var(--ink)] whitespace-nowrap">{weatherLabel}</span>
          <span className="shrink-0 whitespace-nowrap">
            {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex lg:flex-col lg:items-start lg:space-y-6 w-full lg:max-w-[180px]">
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-[var(--ink)] leading-snug font-medium">{resortName}</p>

          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={onToggleTemperatureUnit}
              className="font-serif text-5xl font-light text-[var(--ink)] leading-none tracking-tight theme-air:lg:text-6xl bg-transparent border-0 p-0 cursor-pointer text-left"
              aria-label={t('mountainTemp')}
            >
              {tempDisplay}
            </button>
            <p className="text-sm text-[var(--ink)] whitespace-nowrap">{weatherLabel}</p>
          </div>
        </div>

        <div className="flex flex-col items-start space-y-1.5 text-sm text-[var(--ink-dim)] leading-relaxed">
          <span className="whitespace-nowrap">
            {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
          </span>
          <span className="whitespace-nowrap">
            {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </span>
        </div>

        {showLifts && (
          <p
            className={`text-sm font-medium whitespace-nowrap ${
              isClosed ? 'text-rose-500' : 'text-[var(--ink)]'
            }`}
          >
            {isClosed ? t('closedToday') : t('openToday')}
          </p>
        )}
      </div>
    </aside>
  );
};
