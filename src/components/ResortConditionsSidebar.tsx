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

  const statusText =
    language === 'ru'
      ? resortConfig.liftsStatusRu || 'ОТКРЫТО'
      : resortConfig.liftsStatusEn || 'OPEN';
  const isClosed =
    statusText.toUpperCase().includes('CLOSE') ||
    statusText.toUpperCase().includes('ЗАКР') ||
    statusText.toUpperCase().includes('OFF');

  return (
    <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--layout-divider)] px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8 lg:pt-10 lg:pb-14 flex flex-col justify-start shrink-0 bg-transparent">
      <div className="flex flex-wrap lg:flex-col items-center lg:items-start justify-between gap-x-6 gap-y-2.5 lg:space-y-6 lg:gap-0 w-full lg:max-w-[180px]">
        {/* Курорт и Температура */}
        <div className="flex items-center gap-10 sm:gap-[120px] lg:flex-col lg:items-start lg:gap-2">
          <p className="text-xs sm:text-sm text-[var(--ink)] leading-snug font-medium whitespace-nowrap lg:whitespace-normal">
            {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
          </p>

          <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-1">
            <button
              type="button"
              onClick={onToggleTemperatureUnit}
              className="font-serif text-2xl sm:text-3xl lg:text-5xl font-light text-[var(--ink)] leading-none tracking-tight theme-air:lg:text-6xl bg-transparent border-0 p-0 cursor-pointer text-left"
              aria-label={t('mountainTemp')}
            >
              <AnimatedNumber value={isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC} />°
            </button>
            <p className="text-xs sm:text-sm text-[var(--ink)] whitespace-nowrap">
              {t(getWeatherConditionKey(weatherCode))}
            </p>
          </div>
        </div>

        {/* Снег и Ветер */}
        <div className="flex items-center gap-2.5 sm:gap-4 lg:flex-col lg:items-start lg:space-y-1.5 lg:gap-0 text-xs sm:text-sm text-[var(--ink-dim)] leading-relaxed">
          <span className="whitespace-nowrap">
            {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
          </span>
          <span className="hidden sm:inline lg:hidden text-[var(--ink-dim)]/30">•</span>
          <span className="whitespace-nowrap">
            {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </span>
        </div>

        {/* Статус подъемников */}
        {resortConfig.showLifts !== false && (
          <p
            className={`text-xs sm:text-sm font-medium whitespace-nowrap ${isClosed ? 'text-rose-500' : 'text-[var(--ink)]'}`}
          >
            {isClosed ? t('closedToday') : t('openToday')}
          </p>
        )}
      </div>
    </aside>
  );
};
