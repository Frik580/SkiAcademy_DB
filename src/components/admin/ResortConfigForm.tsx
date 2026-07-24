import React, { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2, Save } from 'lucide-react';
import { CustomHeroSlide, ResortConfig } from '../../types';
import { db, doc, onSnapshot, setDoc } from '../../lib/firebase';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { FALLBACK_SLIDES } from './resortConfigDefaults';
import { logger } from '../../lib/logger';
import { ToggleSwitch } from '../ToggleSwitch';

/**
 * 2. Данные курорта и геолокация погоды (Resort Data & Weather Geolocation Section)
 * Independent form and saving mechanism.
 */
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
    const configRef = doc(db, 'resort_data', 'config');
    const unsub = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ResortConfig;
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
      const configRef = doc(db, 'resort_data', 'config');
      await setDoc(
        configRef,
        {
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
        },
        { merge: true }
      );
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
    return (
      <div className="flex items-center gap-2 text-xs font-mono py-4 text-[var(--ink-dim)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('loadingResortConfig')}</span>
      </div>
    );
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
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t('saveResortSettings')}
        </button>
      </div>
    </form>
  );
};

/**
 * 3. Настройка рекламного баннера (Слайдер) (Hero Banner / Slider Config Section)
 * Independent form and saving mechanism.
 */
export const ResortSliderSection: React.FC = () => {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();

  const [resortSlides, setResortSlides] = useState<CustomHeroSlide[]>([]);
  const [resortSlideInterval, setResortSlideInterval] = useState(6);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const configRef = doc(db, 'resort_data', 'config');
    const unsub = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ResortConfig;
          setResortSlides(data.slides && data.slides.length > 0 ? data.slides : FALLBACK_SLIDES);
          setResortSlideInterval(data.slideIntervalSeconds || 6);
        }
        setIsLoading(false);
      },
      (err) => {
        logger.error('Error reading slider config:', err);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleAddSlide = () => {
    const newSlide: CustomHeroSlide = {
      id: String(Date.now()),
      line1En: 'New Offer',
      line1Ru: 'Новое предложение',
      line2En: 'Write slide title here in English.',
      line2Ru: 'Напишите заголовок слайда на русском.',
      line3En: 'Sub-heading details in English.',
      line3Ru: 'Детали на русском языке.',
      backgroundImage: 'wall',
    };
    setResortSlides([...resortSlides, newSlide]);
  };

  const handleDeleteSlide = (id: string) => {
    setResortSlides(resortSlides.filter((s) => s.id !== id));
  };

  const handleUpdateSlideField = (id: string, field: keyof CustomHeroSlide, value: string) => {
    setResortSlides(resortSlides.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSaveSliderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const configRef = doc(db, 'resort_data', 'config');
      await setDoc(
        configRef,
        {
          slides: resortSlides,
          slideIntervalSeconds: Number(resortSlideInterval),
        },
        { merge: true }
      );
      addNotification('success', t('configUpdated'), t('configUpdatedDesc'));
    } catch (err) {
      logger.error('Error saving slider config:', err);
      addNotification('error', t('configSaveError'), t('configSaveErrorDesc'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono py-4 text-[var(--ink-dim)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('loadingResortConfig')}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSaveSliderConfig} className="space-y-4">
      <div className="space-y-1.5 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
          {t('slideIntervalLabel')}
        </label>
        <input
          type="number"
          required
          min="2"
          max="60"
          value={resortSlideInterval}
          onChange={(e) => setResortSlideInterval(Number(e.target.value))}
          className="w-32 bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
        />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-bold">
            {t('activeSlides')} ({resortSlides.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('resetSlidesConfirm'))) {
                  setResortSlides(JSON.parse(JSON.stringify(FALLBACK_SLIDES)));
                }
              }}
              className="border border-[var(--border)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('resetToDefaults')}
            </button>
            <button
              type="button"
              onClick={handleAddSlide}
              className="border border-[var(--border)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)] transition cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              {t('addSlide')}
            </button>
          </div>
        </div>

        {resortSlides.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)]">
            {t('noCustomSlides')}
          </div>
        ) : (
          <div className="space-y-4">
            {resortSlides.map((slide, index) => {
              const presetWalls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7', 'random'];
              const isPreset = presetWalls.includes(slide.backgroundImage);

              return (
                <div
                  key={slide.id}
                  className="border border-[var(--border)] p-4 bg-black/5 dark:bg-white/5 space-y-3 relative"
                >
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-dim)]">
                      #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSlide(slide.id)}
                      className="text-rose-500 hover:text-rose-600 transition cursor-pointer p-1 border border-[var(--border)] hover:border-rose-500/30 bg-[var(--bg)]"
                      title={t('deleteSlide')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                    <div className="space-y-3 border-r border-[var(--border)]/40 pr-0 md:pr-4">
                      <h6 className="font-mono text-[9px] text-[var(--ink-dim)] uppercase tracking-widest font-bold">
                        English (EN)
                      </h6>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Line 1 (Accent text)
                        </label>
                        <input
                          type="text"
                          required
                          value={slide.line1En}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line1En', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Line 2 (Main heading)
                        </label>
                        <input
                          type="text"
                          required
                          value={slide.line2En}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line2En', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Line 3 (Details)
                        </label>
                        <textarea
                          required
                          rows={2}
                          value={slide.line3En}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line3En', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h6 className="font-mono text-[9px] text-[var(--ink-dim)] uppercase tracking-widest font-bold">
                        Русский (RU)
                      </h6>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Строка 1 (Акцентный текст)
                        </label>
                        <input
                          type="text"
                          required
                          value={slide.line1Ru}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line1Ru', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Строка 2 (Основной заголовок)
                        </label>
                        <input
                          type="text"
                          required
                          value={slide.line2Ru}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line2Ru', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          Строка 3 (Описание)
                        </label>
                        <textarea
                          required
                          rows={2}
                          value={slide.line3Ru}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'line3Ru', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)]/40 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                        {t('backgroundWall')}
                      </label>
                      <select
                        value={isPreset ? slide.backgroundImage : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            handleUpdateSlideField(slide.id, 'backgroundImage', 'https://');
                          } else {
                            handleUpdateSlideField(slide.id, 'backgroundImage', val);
                          }
                        }}
                        className="w-full bg-transparent border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none cursor-pointer"
                      >
                        <option value="random" className="bg-[var(--bg)] text-[var(--ink)]">
                          {t('randomPresetWall')}
                        </option>
                        <option value="wall" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 1 (Mountain sunset)
                        </option>
                        <option value="wall2" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 2 (Mountain slope)
                        </option>
                        <option value="wall3" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 3 (Snowy peak)
                        </option>
                        <option value="wall4" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 4 (Winter forest)
                        </option>
                        <option value="wall5" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 5 (Sunny slopes)
                        </option>
                        <option value="wall6" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 6 (Evening frost)
                        </option>
                        <option value="wall7" className="bg-[var(--bg)] text-[var(--ink)]">
                          Preset Wall 7 (Deep ski trace)
                        </option>
                        <option value="custom" className="bg-[var(--bg)] text-[var(--ink)]">
                          {t('customImageUrlOption')}
                        </option>
                      </select>
                    </div>

                    {!isPreset && (
                      <div className="space-y-1">
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                          {t('customBackgroundUrl')}
                        </label>
                        <input
                          type="text"
                          required
                          value={slide.backgroundImage}
                          onChange={(e) => handleUpdateSlideField(slide.id, 'backgroundImage', e.target.value)}
                          className="w-full bg-transparent border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                          placeholder="https://images.unsplash.com/..."
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-[var(--border)]">
        <button
          type="submit"
          disabled={isSaving}
          className="bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink)]/90 px-4 py-2 text-xs font-mono uppercase tracking-wider font-bold transition duration-300 rounded-none disabled:opacity-50 cursor-pointer flex items-center gap-2"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t('saveResortSettings')}
        </button>
      </div>
    </form>
  );
};

export const ResortConfigForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <ResortDataSection />
      <ResortSliderSection />
    </div>
  );
};
