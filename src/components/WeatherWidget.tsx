import React from 'react';
import { CloudSnow, Compass, Thermometer, Wind, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface WeatherWidgetProps {
  tempC: number;
  snowDepthCm: number;
  newSnow24h: number;
  windKmh: number;
  openLifts: number;
  isFahrenheit: boolean;
  setIsFahrenheit: (val: boolean) => void;
  isResortLoading: boolean;
  lastUpdated: string;
  onRefresh: () => void;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  tempC,
  snowDepthCm,
  newSnow24h,
  windKmh,
  openLifts,
  isFahrenheit,
  setIsFahrenheit,
  isResortLoading,
  lastUpdated,
  onRefresh
}) => {
  const { t, language } = useLanguage();
  const totalLifts = 14;

  const currentTemp = isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC;

  return (
    <div className="border border-[var(--border)] bg-black/5 dark:bg-white/5 p-5 transition-all duration-300 rounded-none w-full">
      <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <CloudSnow className="w-5 h-5 text-sky-500 animate-pulse" />
          <div>
            <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--ink)] font-bold">{t('resortConditions')}</h3>
            <span className="text-[9px] text-[var(--ink-dim)] font-mono block mt-0.5">
              {t('weatherLocation')} • {language === 'en' ? 'Updated' : 'Обновлено'}: {lastUpdated}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsFahrenheit(!isFahrenheit)}
            className="text-[9px] font-mono border border-[var(--border)] px-1.5 py-0.5 hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent cursor-pointer rounded-none"
          >
            °{isFahrenheit ? 'C' : 'F'}
          </button>
          <button
            onClick={onRefresh}
            disabled={isResortLoading}
            className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] border border-[var(--border)] hover:border-[var(--ink)] bg-transparent transition disabled:opacity-50 cursor-pointer rounded-none"
          >
            <RefreshCw className={`w-3 h-3 ${isResortLoading ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Main temperature and snow depth display */}
        <div className="flex flex-col justify-center border-r border-[var(--border)] pr-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-serif font-light text-[var(--ink)] tracking-tight leading-none">{currentTemp}°</span>
            <span className="text-xs font-mono text-[var(--ink-dim)]">
              {isFahrenheit ? 'F' : 'C'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--ink)] mt-1.5 flex items-center gap-1">
            <Thermometer className="w-3.5 h-3.5 text-[var(--ink-dim)]" />
            {t('powderSnow')}
          </span>
          <div className="mt-3 bg-sky-500/10 border border-sky-500/20 rounded-none p-2 text-center">
            <span className="text-[9px] font-mono font-bold text-sky-500 uppercase block tracking-wider leading-none">
              {language === 'en' ? 'New Snow (24h)' : 'Свежий снег (24ч)'}
            </span>
            <span className="text-md font-mono font-bold text-sky-400 block mt-1">+{newSnow24h} {language === 'en' ? 'cm' : 'см'}</span>
          </div>
        </div>

        {/* Detailed stats */}
        <div className="space-y-2.5 flex flex-col justify-center font-mono text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-dim)] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--ink-dim)]" /> {language === 'en' ? 'Base Depth' : 'Толщина покрова'}:
            </span>
            <span className="font-bold text-[var(--ink)]">{snowDepthCm} {language === 'en' ? 'cm' : 'см'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-dim)] flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-[var(--ink-dim)]" /> {t('windSpeed')}:
            </span>
            <span className="font-bold text-[var(--ink)]">{windKmh} {language === 'en' ? 'km/h' : 'км/ч'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-dim)] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[var(--ink-dim)]" /> {language === 'en' ? 'Lifts' : 'Подъемники'}:
            </span>
            <span className="font-bold text-[var(--ink)]">
              {openLifts}/{totalLifts}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[var(--ink-dim)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {language === 'en' ? 'Status' : 'Трассы'}:
            </span>
            <span className="font-bold text-emerald-500 uppercase">
              {t('statusOpen')}
            </span>
          </div>
        </div>
      </div>
      
      {newSnow24h > 15 && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-none p-2 text-center">
          <p className="text-[9px] text-emerald-500 font-mono">
            ❄️ <strong>{t('powderAlert')}:</strong> {t('powderAlertDesc')}
          </p>
        </div>
      )}
    </div>
  );
};

