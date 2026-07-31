import React, { useState } from 'react';
import { Settings, Award, Mountain, Sliders, Palette, History, Trophy } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { SkillConfig } from '../../lib/skillData';
import { AchievementsConfig } from '../../lib/achievementConfig';
import { DesignTheme } from '../../lib/designTheme';
import { Booking, Course } from '../../types';
import { backfillCompletedBookingActivityLogs } from '../../lib/backfillActivityLog';
import { SkillConfigManager } from '../SkillConfigManager';
import { AchievementsManager } from './AchievementsManager';
import { ResortDataSection, ResortSliderSection } from './ResortConfigForm';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { ToggleSwitch } from '../ToggleSwitch';

interface SystemSettingsProps {
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  onboardingEnabled?: boolean;
  onToggleOnboarding?: (enabled: boolean) => Promise<void>;
  designTheme?: DesignTheme;
  onSetDesignTheme?: (theme: DesignTheme) => Promise<void>;
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig?: (config: AchievementsConfig) => Promise<void>;
  bookings?: Booking[];
  courses?: Course[];
  adminUid?: string;
}

const DESIGN_OPTIONS: {
  id: DesignTheme;
  labelKey: 'designThemeClassic' | 'designThemeLodge' | 'designThemeAir';
  descKey: 'designThemeClassicDesc' | 'designThemeLodgeDesc' | 'designThemeAirDesc';
  swatches: string[];
}[] = [
  {
    id: 'classic',
    labelKey: 'designThemeClassic',
    descKey: 'designThemeClassicDesc',
    swatches: ['#fafaf7', '#1a6578', '#0d0f12'],
  },
  {
    id: 'lodge',
    labelKey: 'designThemeLodge',
    descKey: 'designThemeLodgeDesc',
    swatches: ['#f6efe2', '#b5541f', '#2b2116'],
  },
  {
    id: 'air',
    labelKey: 'designThemeAir',
    descKey: 'designThemeAirDesc',
    swatches: ['#ffffff', '#1a6578', '#111111'],
  },
];

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  filtersEnabled = true,
  onToggleFilters,
  onboardingEnabled = true,
  onToggleOnboarding,
  designTheme = 'classic',
  onSetDesignTheme,
  skillConfig,
  achievementsConfig,
  onUpdateSkillConfig,
  onUpdateAchievementsConfig,
  bookings = [],
  courses = [],
  adminUid,
}) => {
  const { t } = useLanguage();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const handleBackfillHistory = async () => {
    if (!adminUid || isBackfilling) return;
    setIsBackfilling(true);
    setBackfillMessage(null);
    try {
      const result = await backfillCompletedBookingActivityLogs(bookings, courses, adminUid);
      setBackfillMessage(t('scHistoryBackfillDone').replace('{n}', String(result.written)));
    } catch {
      setBackfillMessage(t('updateFailed'));
    } finally {
      setIsBackfilling(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in transition-colors duration-300 w-full min-w-0 overflow-hidden">
      {/* Top Header Card for System Settings */}
      <div className="border border-[var(--border)] p-5 bg-black/5 dark:bg-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
            {t('systemSettingsTitle')}
          </h3>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
            {t('systemSettingsSub')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-t md:border-t-0 md:border-l border-[var(--border)] pt-3 md:pt-0 md:pl-4">
          <ToggleSwitch
            checked={filtersEnabled}
            onChange={(checked) => onToggleFilters?.(checked)}
            label={t('instructorFilters')}
            description={t('instructorFiltersDesc')}
          />
          <ToggleSwitch
            checked={onboardingEnabled}
            onChange={(checked) => onToggleOnboarding?.(checked)}
            label={t('onboardingToggleLabel') || 'Онбординг клиентов'}
            description={
              t('onboardingToggleDesc') || 'Показывать обучающий тур 6 шагов новым ученикам'
            }
          />
        </div>
      </div>

      {/* Site design theme */}
      <AdminCollapsibleSection
        id="design_theme"
        title={t('designThemeTitle')}
        subtitle={t('designThemeSub')}
        icon={Palette}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DESIGN_OPTIONS.map((option) => {
            const isActive = designTheme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSetDesignTheme?.(option.id)}
                className={`text-left border p-4 transition cursor-pointer ${
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                    : 'border-[var(--border)] bg-transparent hover:border-[var(--ink)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider font-bold text-[var(--ink)]">
                    {t(option.labelKey)}
                  </span>
                  {isActive && (
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--accent)]">
                      {t('designThemeActive')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed mb-3">
                  {t(option.descKey)}
                </p>
                <div className="flex gap-1.5">
                  {option.swatches.map((color) => (
                    <span
                      key={color}
                      className="h-5 w-5 border border-[var(--border)]"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </AdminCollapsibleSection>

      {/* 1. Таблица начисления рейтинга клиентов (система уровней) */}
      <AdminCollapsibleSection
        id="skill_matrix"
        title={
          t('clientRatingSkillMatrix') || 'Таблица начисления рейтинга клиентов (система уровней)'
        }
        subtitle={
          t('skillMatrixDescription') ||
          'Настройка критериев перехода между уровнями и матрицы навыков'
        }
        icon={Award}
      >
        <SkillConfigManager
          config={skillConfig}
          onSaveConfig={async (cfg) => {
            if (onUpdateSkillConfig) await onUpdateSkillConfig(cfg);
          }}
        />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="achievements_config"
        title={t('achievementsManagerTitle')}
        subtitle={t('achievementsManagerSectionSub')}
        icon={Trophy}
      >
        <AchievementsManager
          config={achievementsConfig}
          skillConfig={skillConfig}
          onSaveConfig={async (cfg) => {
            if (onUpdateAchievementsConfig) await onUpdateAchievementsConfig(cfg);
          }}
        />
      </AdminCollapsibleSection>

      {/* 2. Данные курорта и геолокация погоды */}
      <AdminCollapsibleSection
        id="resort_data"
        title={t('resortDetailsTitle') || 'Данные курорта и геолокация погоды'}
        subtitle={t('resortDetailsSub') || 'Название курорта, GPS координаты и статус подъемников'}
        icon={Mountain}
      >
        <ResortDataSection />
      </AdminCollapsibleSection>

      {/* 3. Настройка рекламного баннера (Слайдер) */}
      <AdminCollapsibleSection
        id="resort_slider"
        title={t('heroSliderTitle') || 'Настройка рекламного баннера (Слайдер)'}
        subtitle={
          t('heroSliderDesc') || 'Интервал смены и конфигурация промо-слайдов на главной странице'
        }
        icon={Sliders}
      >
        <ResortSliderSection />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="activity_history_backfill"
        title={t('scHistoryBackfillTitle')}
        subtitle={t('scHistoryBackfillDesc')}
        icon={History}
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleBackfillHistory()}
            disabled={!adminUid || isBackfilling || bookings.length === 0}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {isBackfilling ? t('loading') : t('scHistoryBackfillRun')}
          </button>
          {backfillMessage && (
            <p className="text-xs text-[var(--ink-dim)] font-mono">{backfillMessage}</p>
          )}
        </div>
      </AdminCollapsibleSection>
    </div>
  );
};
