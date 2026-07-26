import React from 'react';
import { useLanguage, type Language } from '../lib/LanguageContext';
import { ResortConfig } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

interface ResortConditionsSidebarProps {
  data: {
    language: Language;
    resortConfig: ResortConfig;
    tempC: number;
    snowDepthCm: number;
    newSnow24h: number;
    windKmh: number;
    openLifts: number;
    isFahrenheit: boolean;
    isResortLoading: boolean;
    lastUpdated: string;
  };
  actions: {
    onToggleTemperatureUnit: () => void;
    onRefresh: () => void;
  };
}

export const ResortConditionsSidebar: React.FC<ResortConditionsSidebarProps> = ({
  data: {
    language,
    resortConfig,
    tempC,
    snowDepthCm,
    newSnow24h,
    windKmh,
    openLifts,
    isFahrenheit,
    isResortLoading,
    lastUpdated,
  },
  actions: { onToggleTemperatureUnit, onRefresh },
}) => {
  const { t } = useLanguage();

  return (
    <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--layout-divider)] p-6 lg:p-8 space-y-8 flex flex-col justify-start shrink-0 lg:h-full lg:overflow-y-auto bg-transparent">
      <div className="space-y-1">
        <span className="ui-section-eyebrow font-bold text-[var(--ink)] block">
          {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
        </span>
        <span className="text-[var(--ink-dim)] text-xs block theme-air:text-sm">
          {language === 'ru' ? resortConfig.subNameRu : resortConfig.subNameEn}
        </span>
      </div>

      <div className="space-y-2">
        <span className="ui-section-eyebrow block">{t('mountainTemp')}</span>
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-4xl font-light text-[var(--ink)] leading-none theme-air:text-5xl">
            <AnimatedNumber value={isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC} />°
          </span>
          <span className="text-xs text-[var(--ink-dim)] theme-air:text-sm">
            {isFahrenheit ? 'F' : 'C'}
          </span>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
          <span className="ui-section-eyebrow text-[var(--ink-dim)]">
            {t('freshSnow')}: +<AnimatedNumber value={newSnow24h} />
            {t('centimetersShort')}
          </span>
          <span className="ui-section-eyebrow text-[var(--ink-dim)]">
            <AnimatedNumber value={windKmh} /> {t('kilometersPerHourShort')}
          </span>
          <button
            onClick={onToggleTemperatureUnit}
            className="ui-section-eyebrow text-[var(--ink)] hover:text-[var(--accent)] transition cursor-pointer bg-transparent border-0 underline-offset-2 hover:underline theme-air:text-sm"
          >
            °{isFahrenheit ? 'C' : 'F'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <span className="ui-section-eyebrow block">{t('snowCover')}</span>
        <span className="font-serif text-4xl font-light text-[var(--ink)] block theme-air:text-5xl">
          <AnimatedNumber value={snowDepthCm} />
          <small className="text-sm font-sans font-normal ml-0.5">cm</small>
        </span>
        <span className="ui-section-eyebrow text-[var(--ink-dim)] block">
          {t('safetyLevel')}: FIS-1
        </span>
      </div>

      {resortConfig.showLifts !== false && (
        <div className="space-y-2">
          <span className="ui-section-eyebrow block">{t('operatingLifts')}</span>
          <span className="font-serif text-4xl font-light text-[var(--ink)] block theme-air:text-5xl">
            <AnimatedNumber
              value={resortConfig.openLifts !== undefined ? resortConfig.openLifts : openLifts}
            />
            /{resortConfig.totalLifts !== undefined ? resortConfig.totalLifts : 14}
          </span>
          {(() => {
            const statusText =
              language === 'ru'
                ? resortConfig.liftsStatusRu || 'ОТКРЫТО'
                : resortConfig.liftsStatusEn || 'OPEN';
            const isClosed =
              statusText.toUpperCase().includes('CLOSE') ||
              statusText.toUpperCase().includes('ЗАКР') ||
              statusText.toUpperCase().includes('OFF');
            const colorClass = isClosed ? 'text-rose-500' : 'text-emerald-500';
            const bgClass = isClosed ? 'bg-rose-500' : 'bg-emerald-500';
            return (
              <span
                className={`ui-section-eyebrow ${colorClass} font-bold flex items-center gap-1.5`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${bgClass} animate-pulse`}></span>
                {t('statusLabel')}: {statusText}
              </span>
            );
          })()}
        </div>
      )}

      <div className="pt-2 flex flex-col gap-3">
        <div className="flex justify-between items-center text-[10px] theme-air:text-xs">
          <span className="text-[var(--ink-dim)]">
            {t('lastUpdated')}: {lastUpdated}
          </span>
          <button
            onClick={onRefresh}
            disabled={isResortLoading}
            className="ui-section-eyebrow hover:text-[var(--ink)] transition disabled:opacity-50 bg-transparent border-0 cursor-pointer underline-offset-2 hover:underline"
          >
            {isResortLoading ? '...' : t('refresh')}
          </button>
        </div>
        <div className="text-[9px] text-[var(--ink-dim)] text-center pt-2 ui-divider-t theme-air:text-xs">
          {t('weatherSource')}: Open-Meteo
        </div>
      </div>
    </aside>
  );
};
