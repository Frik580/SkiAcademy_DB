import React, { useState } from 'react';
import { Settings, Award, Trophy, Bell, Trash2, Gift } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../../domain/achievements';
import { AchievementsConfig } from '../../../../domain/achievements';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  MAX_NOTIFICATION_RETENTION_DAYS,
  MIN_NOTIFICATION_RETENTION_DAYS,
} from '../../../../domain/notifications';
import {
  DEFAULT_STARTER_CREDIT_USD,
  MAX_STARTER_CREDIT_USD,
  MIN_STARTER_CREDIT_USD,
} from '../../../../domain/wallet';
import { SkillConfigManager } from './SkillConfigManager';
import { AchievementsManager } from './AchievementsManager';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { ToggleSwitch } from '../../../../ui/ToggleSwitch';

export interface AdminSystemSettingsProps {
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  notificationRetentionDays?: number;
  onSetNotificationRetentionDays?: (days: number) => Promise<void>;
  starterCreditUsd?: number;
  onSetStarterCreditUsd?: (amount: number) => Promise<void>;
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig?: (config: AchievementsConfig) => Promise<void>;
}

/** Preferences, gamification, and danger-zone tools for the System admin tab. */
export const AdminSystemSettings: React.FC<AdminSystemSettingsProps> = ({
  filtersEnabled = true,
  onToggleFilters,
  notificationRetentionDays = DEFAULT_NOTIFICATION_RETENTION_DAYS,
  onSetNotificationRetentionDays,
  starterCreditUsd = DEFAULT_STARTER_CREDIT_USD,
  onSetStarterCreditUsd,
  skillConfig,
  achievementsConfig,
  onUpdateSkillConfig,
  onUpdateAchievementsConfig,
}) => {
  const { t } = useLanguage();
  const [retentionInput, setRetentionInput] = useState(String(notificationRetentionDays));
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [starterCreditInput, setStarterCreditInput] = useState(String(starterCreditUsd));
  const [isSavingStarterCredit, setIsSavingStarterCredit] = useState(false);

  React.useEffect(() => {
    setRetentionInput(String(notificationRetentionDays));
  }, [notificationRetentionDays]);

  React.useEffect(() => {
    setStarterCreditInput(String(starterCreditUsd));
  }, [starterCreditUsd]);

  const handleSaveRetention = async () => {
    if (!onSetNotificationRetentionDays || isSavingRetention) return;

    const parsed = Number(retentionInput);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_NOTIFICATION_RETENTION_DAYS ||
      parsed > MAX_NOTIFICATION_RETENTION_DAYS
    ) {
      setRetentionInput(String(notificationRetentionDays));
      return;
    }

    setIsSavingRetention(true);
    try {
      await onSetNotificationRetentionDays(parsed);
    } finally {
      setIsSavingRetention(false);
    }
  };

  const handleSaveStarterCredit = async () => {
    if (!onSetStarterCreditUsd || isSavingStarterCredit) return;

    const parsed = Number(starterCreditInput);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_STARTER_CREDIT_USD ||
      parsed > MAX_STARTER_CREDIT_USD
    ) {
      setStarterCreditInput(String(starterCreditUsd));
      return;
    }

    setIsSavingStarterCredit(true);
    try {
      await onSetStarterCreditUsd(parsed);
    } finally {
      setIsSavingStarterCredit(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in transition-colors duration-300 w-full min-w-0 overflow-hidden">
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
        </div>
      </div>

      <AdminCollapsibleSection
        id="notification_retention"
        title={t('notificationRetentionTitle')}
        subtitle={t('notificationRetentionSub')}
        icon={Bell}
        defaultOpen
      >
        <div className="space-y-3 max-w-md">
          <div className="space-y-1.5 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
            <label
              htmlFor="notification-retention-days"
              className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold"
            >
              {t('notificationRetentionLabel')}
            </label>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed">
              {t('notificationRetentionDesc')}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <input
                id="notification-retention-days"
                type="number"
                min={MIN_NOTIFICATION_RETENTION_DAYS}
                max={MAX_NOTIFICATION_RETENTION_DAYS}
                value={retentionInput}
                onChange={(e) => setRetentionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSaveRetention();
                  }
                }}
                className="w-24 bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                {t('notificationRetentionUnit')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveRetention()}
            disabled={isSavingRetention}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {isSavingRetention ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="starter_credit"
        title={t('starterCreditSettingTitle')}
        subtitle={t('starterCreditSettingSub')}
        icon={Gift}
        defaultOpen={false}
      >
        <div className="space-y-3 max-w-md">
          <div className="space-y-1.5 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
            <label
              htmlFor="starter-credit-kzt"
              className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold"
            >
              {t('starterCreditSettingLabel')}
            </label>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed">
              {t('starterCreditSettingDesc')}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <input
                id="starter-credit-kzt"
                type="number"
                min={MIN_STARTER_CREDIT_USD}
                max={MAX_STARTER_CREDIT_USD}
                step={1}
                value={starterCreditInput}
                onChange={(e) => setStarterCreditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSaveStarterCredit();
                  }
                }}
                className="w-36 bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                ₸ KZT
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveStarterCredit()}
            disabled={isSavingStarterCredit || !onSetStarterCreditUsd}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {isSavingStarterCredit ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </AdminCollapsibleSection>

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
        defaultOpen={false}
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
        defaultOpen={false}
      >
        <AchievementsManager
          config={achievementsConfig}
          skillConfig={skillConfig}
          onSaveConfig={async (cfg) => {
            if (onUpdateAchievementsConfig) await onUpdateAchievementsConfig(cfg);
          }}
        />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        id="clear_student_bookings"
        title={t('adminDangerZoneTitle')}
        subtitle={t('adminDangerZoneSub')}
        icon={Trash2}
        defaultOpen={false}
      >
        <div className="max-w-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[11px] text-[var(--ink)] leading-relaxed font-mono">
            {t('destructiveAdminToolsDisabled')}
          </p>
        </div>
      </AdminCollapsibleSection>
    </div>
  );
};
