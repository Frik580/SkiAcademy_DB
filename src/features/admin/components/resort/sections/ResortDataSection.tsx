import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useLanguage } from '../../../../../app/providers/LanguageContext';
import { useNotifications } from '../../../../../features/notifications';
import { logger } from '../../../../../shared';
import { ToggleSwitch } from '../../../../../ui/ToggleSwitch';
import { FormSkeleton } from '../../../../../ui/Skeleton';
import { saveResortConfig, subscribeResortConfig } from '../../../../../features/settings';

export const ResortDataSection: React.FC = () => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

  const [resortNameEn, setResortNameEn] = useState('Chamonix-Mont-Blanc');
  const [resortNameRu, setResortNameRu] = useState('Шамони-Монблан');
  const [resortSubEn, setResortSubEn] = useState('French Alps resort');
  const [resortSubRu, setResortSubRu] = useState('Курорт в Альпах');
  const [resortLat, setResortLat] = useState(45.9237);
  const [resortLon, setResortLon] = useState(6.8694);
  const [resortShowLifts, setResortShowLifts] = useState(true);
  const [resortOpenLifts, setResortOpenLifts] = useState(13);
  const [resortTotalLifts, setResortTotalLifts] = useState(14);
  const [resortLiftsStatusEn, setResortLiftsStatusEn] = useState('OPEN');
  const [resortLiftsStatusRu, setResortLiftsStatusRu] = useState('ОТКРЫТО');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeResortConfig(
      (data) => {
        if (data) {
          setResortNameEn(data.nameEn || 'Chamonix-Mont-Blanc');
          setResortNameRu(data.nameRu || 'Шамони-Монблан');
          setResortSubEn(data.subNameEn || 'French Alps resort');
          setResortSubRu(data.subNameRu || 'Курорт в Альпах');
          setResortLat(data.latitude || 45.9237);
          setResortLon(data.longitude || 6.8694);
          setResortShowLifts(data.showLifts !== false);
          setResortOpenLifts(data.openLifts !== undefined ? data.openLifts : 13);
          setResortTotalLifts(data.totalLifts !== undefined ? data.totalLifts : 14);
          setResortLiftsStatusEn(data.liftsStatusEn || 'OPEN');
          setResortLiftsStatusRu(data.liftsStatusRu || 'ОТКРЫТО');
        }
        setIsLoading(false);
      },
      (err) => {
        logger.error('Error reading resort data:', err);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleSaveResortData = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveResortConfig({
        nameEn: resortNameEn,
        nameRu: resortNameRu,
        subNameEn: resortSubEn,
        subNameRu: resortSubRu,
        latitude: Number(resortLat),
        longitude: Number(resortLon),
        showLifts: resortShowLifts,
        openLifts: Number(resortOpenLifts),
        totalLifts: Number(resortTotalLifts),
        liftsStatusEn: resortLiftsStatusEn,
        liftsStatusRu: resortLiftsStatusRu,
      });
      addNotification('success', t('configUpdated'), t('configUpdatedDesc'));
    } catch (err) {
      logger.error('Error saving resort data:', err);
      addNotification('error', t('configSaveError'), t('configSaveErrorDesc'));
    } finally {
      setIsSaving(false);
    }
  };

  const liftsStatusLabel = language === 'en' ? resortLiftsStatusEn : resortLiftsStatusRu;

  if (isLoading) {
    return <FormSkeleton fields={4} />;
  }

  return (
    <form onSubmit={handleSaveResortData} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('resortNameEnLabel')}
          </label>
          <input
            type="text"
            required
            value={resortNameEn}
            onChange={(e) => setResortNameEn(e.target.value)}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="e.g. Chamonix-Mont-Blanc"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('resortNameRuLabel')}
          </label>
          <input
            type="text"
            required
            value={resortNameRu}
            onChange={(e) => setResortNameRu(e.target.value)}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="например, Шамони-Монблан"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('resortSubEnLabel')}
          </label>
          <input
            type="text"
            required
            value={resortSubEn}
            onChange={(e) => setResortSubEn(e.target.value)}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="e.g. French Alps resort"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('resortSubRuLabel')}
          </label>
          <input
            type="text"
            required
            value={resortSubRu}
            onChange={(e) => setResortSubRu(e.target.value)}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="например, Курорт в Альпах"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('latitudeLabel')}
          </label>
          <input
            type="number"
            step="0.0001"
            required
            value={resortLat}
            onChange={(e) => setResortLat(Number(e.target.value))}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="e.g. 45.9237"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('longitudeLabel')}
          </label>
          <input
            type="number"
            step="0.0001"
            required
            value={resortLon}
            onChange={(e) => setResortLon(Number(e.target.value))}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
            placeholder="e.g. 6.8694"
          />
        </div>

        <div className="col-span-1 md:col-span-2 border-t border-[var(--border)] pt-4 mt-2">
          <h5 className="font-mono text-[10px] uppercase tracking-wider font-bold text-[var(--ink)]">
            {t('liftsOperatingSettings')}
          </h5>
        </div>

        <div className="col-span-1 md:col-span-2 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
          <ToggleSwitch
            checked={resortShowLifts}
            onChange={(checked) => setResortShowLifts(checked)}
            label={t('showLiftsSection')}
            description={t('showLiftsSectionDesc')}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('openLiftsCount')}
          </label>
          <input
            type="number"
            required
            min="0"
            value={resortOpenLifts}
            onChange={(e) => setResortOpenLifts(Number(e.target.value))}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('totalLiftsCount')}
          </label>
          <input
            type="number"
            required
            min="0"
            value={resortTotalLifts}
            onChange={(e) => setResortTotalLifts(Number(e.target.value))}
            className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
          />
        </div>

        <div className="col-span-1 md:col-span-2 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
          <ToggleSwitch
            checked={resortLiftsStatusEn.toUpperCase() === 'OPEN'}
            activeColor="bg-emerald-600"
            onChange={(isOpen) => {
              if (isOpen) {
                setResortLiftsStatusEn('OPEN');
                setResortLiftsStatusRu('ОТКРЫТО');
              } else {
                setResortLiftsStatusEn('CLOSED');
                setResortLiftsStatusRu('ЗАКРЫТО');
              }
            }}
            label={t('liftsOperatingStatus')}
            description={`${t('liftsStatusCurrently')} ${liftsStatusLabel}`}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-[var(--border)]">
        <button
          type="submit"
          disabled={isSaving}
          className="bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink)]/90 px-4 py-2 text-xs font-mono uppercase tracking-wider font-bold transition duration-300 rounded-none disabled:opacity-50 cursor-pointer flex items-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {t('saveResortSettings')}
        </button>
      </div>
    </form>
  );
};
