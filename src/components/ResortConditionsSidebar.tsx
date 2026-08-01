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
    <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--layout-divider)] px-6 pt-8 pb-10 lg:px-8 lg:pt-10 lg:pb-14 flex flex-col justify-start shrink-0 bg-transparent">
      <div className="space-y-6 max-w-[180px]">
        <p className="text-sm text-[var(--ink)] leading-snug">
          {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onToggleTemperatureUnit}
            className="font-serif text-5xl font-light text-[var(--ink)] leading-none tracking-tight theme-air:text-6xl bg-transparent border-0 p-0 cursor-pointer text-left"
            aria-label={t('mountainTemp')}
          >
            <AnimatedNumber value={isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC} />°
          </button>
          <p className="text-base text-[var(--ink)]">{t(getWeatherConditionKey(weatherCode))}</p>
        </div>

        <div className="space-y-1.5 text-sm text-[var(--ink-dim)] leading-relaxed">
          <p>
            {t('snowCover')} <AnimatedNumber value={snowDepthCm} /> {t('centimetersShort')}
          </p>
          <p>
            {t('windSpeed')} <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </p>
        </div>

        {resortConfig.showLifts !== false && (
          <p className={`text-sm ${isClosed ? 'text-rose-500' : 'text-[var(--ink)]'}`}>
            {isClosed ? t('closedToday') : t('openToday')}
          </p>
        )}
      </div>
    </aside>
  );
};
