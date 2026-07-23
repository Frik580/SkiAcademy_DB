import React from 'react';
import type { Language } from '../lib/LanguageContext';
import { ResortConfig } from '../types';

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
    lastUpdated
  },
  actions: { onToggleTemperatureUnit, onRefresh }
}) => (
  <aside className="lg:col-start-1 border-b lg:border-b-0 lg:border-r border-[var(--border)] p-6 space-y-6 flex flex-col justify-start shrink-0 lg:h-full lg:overflow-y-auto bg-transparent">
    <div className="border-b border-[var(--border)] pb-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
        {language === 'ru' ? resortConfig.nameRu : resortConfig.nameEn}
      </span>
      <span className="text-[9px] text-[var(--ink-dim)] font-mono block mt-0.5">
        {language === 'ru' ? resortConfig.subNameRu : resortConfig.subNameEn}
      </span>
    </div>

    <div className="border-b border-[var(--border)] pb-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
        {language === 'en' ? 'Mountain Temp' : 'Температура'}
      </span>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="font-serif text-4xl font-light text-[var(--ink)] leading-none">
          {isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC}°
        </span>
        <span className="text-xs font-mono text-[var(--ink-dim)]">
          {isFahrenheit ? 'F' : 'C'}
        </span>
      </div>
      <div className="flex justify-between items-center mt-2.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {language === 'en' ? `Fresh: +${newSnow24h}cm` : `Свежий: +${newSnow24h}см`}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
          {language === 'en' ? `${windKmh} km/h` : `${windKmh} км/ч`}
        </span>
        <button
          onClick={onToggleTemperatureUnit}
          className="text-[9px] font-mono border border-[var(--border)] px-1 hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent cursor-pointer"
        >
          °{isFahrenheit ? 'C' : 'F'}
        </button>
      </div>
    </div>

    <div className="border-b border-[var(--border)] pb-4">
      <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
        {language === 'en' ? 'Snow Cover' : 'Снежный покров'}
      </span>
      <span className="font-serif text-4xl font-light text-[var(--ink)] block mt-1">
        {snowDepthCm}<small className="text-sm font-sans font-normal ml-0.5">cm</small>
      </span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block mt-2">
        {language === 'en' ? 'Safety Level: FIS-1' : 'Безопасность: FIS-1'}
      </span>
    </div>

    {resortConfig.showLifts !== false && (
      <div className="border-b border-[var(--border)] pb-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
          {language === 'en' ? 'Operating Lifts' : 'Подъемники'}
        </span>
        <span className="font-serif text-4xl font-light text-[var(--ink)] block mt-1">
          {resortConfig.openLifts !== undefined ? resortConfig.openLifts : openLifts}/{resortConfig.totalLifts !== undefined ? resortConfig.totalLifts : 14}
        </span>
        {(() => {
          const statusText = language === 'ru'
            ? (resortConfig.liftsStatusRu || 'ОТКРЫТО')
            : (resortConfig.liftsStatusEn || 'OPEN');
          const isClosed = statusText.toUpperCase().includes('CLOSE') ||
                           statusText.toUpperCase().includes('ЗАКР') ||
                           statusText.toUpperCase().includes('OFF');
          const colorClass = isClosed ? 'text-rose-500' : 'text-emerald-500';
          const bgClass = isClosed ? 'bg-rose-500' : 'bg-emerald-500';
          return (
            <span className={`text-[10px] font-mono uppercase tracking-wider ${colorClass} font-bold block mt-2.5 flex items-center gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${bgClass} animate-pulse`}></span>
              {language === 'en' ? `STATUS: ${statusText}` : `СТАТУС: ${statusText}`}
            </span>
          );
        })()}
      </div>
    )}

    <div className="pt-2 flex flex-col gap-2 font-mono">
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-[9px] text-[var(--ink-dim)]">
          {language === 'en' ? 'Update' : 'Обновлено'}: {lastUpdated}
        </span>
        <button
          onClick={onRefresh}
          disabled={isResortLoading}
          className="text-[9px] font-mono uppercase border border-[var(--border)] px-2 py-0.5 hover:border-[var(--ink)] text-[var(--ink)] transition disabled:opacity-50 bg-transparent cursor-pointer"
        >
          {isResortLoading ? '...' : (language === 'en' ? 'Refresh' : 'Обновить')}
        </button>
      </div>
      <div className="text-[9px] text-[var(--ink-dim)] font-mono text-center pt-2 border-t border-[var(--border)]/40 mt-1">
        {language === 'en' ? 'Weather: Open-Meteo' : 'Погода: Open-Meteo'}
      </div>
    </div>
  </aside>
);
