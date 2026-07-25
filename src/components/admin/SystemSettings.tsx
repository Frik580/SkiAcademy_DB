import React from 'react';
import { Settings, Award, Mountain, Sliders } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { SkillConfig } from '../../lib/skillData';
import { SkillConfigManager } from '../SkillConfigManager';
import { ResortDataSection, ResortSliderSection } from './ResortConfigForm';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { ToggleSwitch } from '../ToggleSwitch';

interface SystemSettingsProps {
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  skillConfig?: SkillConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  filtersEnabled = true,
  onToggleFilters,
  skillConfig,
  onUpdateSkillConfig,
}) => {
  const { t } = useLanguage();

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

        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-[var(--border)] pt-3 md:pt-0 md:pl-4">
          <ToggleSwitch
            checked={filtersEnabled}
            onChange={(checked) => onToggleFilters?.(checked)}
            label={t('instructorFilters')}
            description={t('instructorFiltersDesc')}
          />
        </div>
      </div>

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
    </div>
  );
};
