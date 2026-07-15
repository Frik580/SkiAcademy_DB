import React, { useState } from 'react';
import { CloudSnow, Compass, Thermometer, Wind, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

export const WeatherWidget: React.FC = () => {
  const { t, language } = useLanguage();
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Resort stats simulation
  const [tempC, setTempC] = useState(-5);
  const [snowDepthCm, setSnowDepthCm] = useState(185);
  const [newSnow24h, setNewSnow24h] = useState(25);
  const [windKmh, setWindKmh] = useState(14);
  const [openLifts, setOpenLifts] = useState(12);
  const totalLifts = 14;

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      // Small randomized shifts to look active
      setTempC((prev) => Math.max(-12, Math.min(2, prev + (Math.random() > 0.5 ? 1 : -1))));
      setSnowDepthCm((prev) => prev + Math.floor(Math.random() * 3));
      setNewSnow24h((prev) => Math.max(0, prev + Math.floor(Math.random() * 5 - 2)));
      setWindKmh((prev) => Math.max(5, Math.min(45, prev + Math.floor(Math.random() * 10 - 5))));
      setOpenLifts((prev) => Math.max(10, Math.min(totalLifts, prev + (Math.random() > 0.7 ? 1 : Math.random() > 0.7 ? -1 : 0))));
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsLoading(false);
    }, 1000);
  };

  const currentTemp = isFahrenheit ? Math.round((tempC * 9) / 5 + 32) : tempC;

  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-5 shadow-lg transition-all duration-300 hover:shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <CloudSnow className="w-5 h-5 text-sky-500 animate-pulse" />
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">{t('resortConditions')}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {language === 'en' ? 'Carve Academy Peak' : 'Пик Академии Карвинга'} • {language === 'en' ? 'Last update' : 'Обновлено'}: {lastUpdated}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFahrenheit(!isFahrenheit)}
            className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium transition cursor-pointer"
          >
            °{isFahrenheit ? 'C' : 'F'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Main temperature and snow depth display */}
        <div className="flex flex-col justify-center border-r border-slate-100 dark:border-slate-800 pr-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{currentTemp}°</span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {isFahrenheit ? 'F' : 'C'}
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1 flex items-center gap-1">
            <Thermometer className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            {language === 'en' ? 'Excellent Powder' : 'Отличный пухляк'}
          </span>
          <div className="mt-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl p-2.5 text-center">
            <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase block tracking-wider">
              {language === 'en' ? 'New Snow (24h)' : 'Свежий снег (24ч)'}
            </span>
            <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400">+{newSnow24h} {language === 'en' ? 'cm' : 'см'}</span>
          </div>
        </div>

        {/* Detailed stats */}
        <div className="space-y-2.5 flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {language === 'en' ? 'Base Depth' : 'Толщина покрова'}:
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{snowDepthCm} {language === 'en' ? 'cm' : 'см'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Wind className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t('windSpeed')}:
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{windKmh} {language === 'en' ? 'km/h' : 'км/ч'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {language === 'en' ? 'Lift Status' : 'Подъемники'}:
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {openLifts}/{totalLifts}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {language === 'en' ? 'Slope Conditions' : 'Трассы'}:
            </span>
            <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase">
              {t('statusOpen')}
            </span>
          </div>
        </div>
      </div>
      
      {newSnow24h > 15 && (
        <div className="mt-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 rounded-xl p-2 text-center">
          <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">
            ❄️ <strong>Powder Alert:</strong> {language === 'en' ? 'Outstanding freeride opportunities today!' : 'Потрясающие условия для фрирайда сегодня!'}
          </p>
        </div>
      )}
    </div>
  );
};
