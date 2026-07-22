import React from 'react';
import { Settings } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { SkillConfig } from '../../lib/skillData';
import { SkillConfigManager } from '../SkillConfigManager';
import { ResortConfigForm } from './ResortConfigForm';

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
    <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 animate-fade-in transition-colors duration-300 w-full min-w-0 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
            {t('systemSettingsTitle')}
          </h3>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
            {t('systemSettingsSub')}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="border border-[var(--border)] p-5 flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-none">
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-wider font-bold text-[var(--ink)] block">
              {t('instructorFilters')}
            </span>
            <span className="text-[10px] text-[var(--ink-dim)] block max-w-sm leading-relaxed">
              {t('instructorFiltersDesc')}
            </span>
          </div>

          <button
            onClick={() => onToggleFilters?.(!filtersEnabled)}
            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-none border border-[var(--border)] transition-colors duration-200 ease-in-out focus:outline-none ${
              filtersEnabled ? 'bg-[var(--ink)]' : 'bg-transparent'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-none shadow-none ring-0 transition duration-200 ease-in-out ${
                filtersEnabled ? 'translate-x-[20px] bg-[var(--bg)]' : 'translate-x-[1px] bg-[var(--ink)] mt-[1px]'
              }`}
            />
          </button>
        </div>

        <SkillConfigManager
          config={skillConfig}
          onSaveConfig={async (cfg) => {
            if (onUpdateSkillConfig) await onUpdateSkillConfig(cfg);
          }}
        />

        <ResortConfigForm />
      </div>
    </div>
  );
};
