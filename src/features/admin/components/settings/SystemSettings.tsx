import React, { useState } from 'react';
import {
  Settings,
  Award,
  Mountain,
  Sliders,
  History,
  Trophy,
  Bell,
  Trash2,
  Gift,
} from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../../domain/achievements';
import { AchievementsConfig } from '../../../../domain/achievements';
import { Booking, Course } from '../../../../types';
import { backfillCompletedBookingActivityLogs } from '../../../../domain/activity';
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
import { SkillConfigManager } from '../../../../features/admin';
import { AchievementsManager } from './AchievementsManager';
import { ResortDataSection, ResortSliderSection } from '../resort/ResortConfigForm';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { ToggleSwitch } from '../../../../ui/ToggleSwitch';
import {
  ClearStudentBookingsResult,
  ClearCancelledBookingsResult,
} from '../../../../features/admin/clearStudentBookings';
import { ResetSchoolFinancesResult } from '../../../../features/admin/resetSchoolFinances';

interface SystemSettingsProps {
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
  bookings?: Booking[];
  courses?: Course[];
  adminUid?: string;
  onRequestConfirm?: (message: string, onConfirm: () => void | Promise<void>) => void;
  onClearStudentBookings?: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearStudentBookingsResult>;
  onClearCancelledBookings?: (
    onProgress?: (deleted: number) => void
  ) => Promise<ClearCancelledBookingsResult>;
  onResetSchoolFinances?: (
    onProgress?: (step: number) => void
  ) => Promise<ResetSchoolFinancesResult>;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
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
  bookings = [],
  courses = [],
  adminUid,
  onRequestConfirm,
  onClearStudentBookings,
  onClearCancelledBookings,
  onResetSchoolFinances,
}) => {
  const { t } = useLanguage();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [retentionInput, setRetentionInput] = useState(String(notificationRetentionDays));
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [starterCreditInput, setStarterCreditInput] = useState(String(starterCreditUsd));
  const [isSavingStarterCredit, setIsSavingStarterCredit] = useState(false);
  const [isClearingBookings, setIsClearingBookings] = useState(false);
  const [clearBookingsProgress, setClearBookingsProgress] = useState(0);
  const [clearBookingsMessage, setClearBookingsMessage] = useState<string | null>(null);

  const [isClearingCancelled, setIsClearingCancelled] = useState(false);
  const [clearCancelledProgress, setClearCancelledProgress] = useState(0);
  const [clearCancelledMessage, setClearCancelledMessage] = useState<string | null>(null);

  const [isResettingFinances, setIsResettingFinances] = useState(false);
  const [resetFinancesProgress, setResetFinancesProgress] = useState(0);
  const [resetFinancesMessage, setResetFinancesMessage] = useState<string | null>(null);

  const studentBookingsCount = bookings.filter(
    (booking) => !booking.userId.startsWith('system_block_')
  ).length;

  const cancelledBookingsCount = bookings.filter(
    (booking) => booking.status === 'cancelled'
  ).length;

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

  const handleClearCancelledBookingsClick = () => {
    if (!onRequestConfirm || !onClearCancelledBookings || isClearingCancelled) return;

    onRequestConfirm(t('clearCancelledBookingsConfirm'), async () => {
      setIsClearingCancelled(true);
      setClearCancelledMessage(null);
      setClearCancelledProgress(0);
      try {
        const result = await onClearCancelledBookings(setClearCancelledProgress);
        setClearCancelledMessage(
          t('clearCancelledBookingsDone').replace('{bookings}', String(result.bookingsDeleted))
        );
      } catch {
        setClearCancelledMessage(t('updateFailed'));
      } finally {
        setIsClearingCancelled(false);
      }
    });
  };

  const handleClearStudentBookingsClick = () => {
    if (!onRequestConfirm || !onClearStudentBookings || isClearingBookings) return;

    onRequestConfirm(t('clearStudentBookingsConfirm'), async () => {
      setIsClearingBookings(true);
      setClearBookingsMessage(null);
      setClearBookingsProgress(0);
      try {
        const result = await onClearStudentBookings(setClearBookingsProgress);
        setClearBookingsMessage(
          t('clearStudentBookingsDone')
            .replace('{bookings}', String(result.bookingsDeleted))
            .replace('{courses}', String(result.coursesReset))
        );
      } catch {
        setClearBookingsMessage(t('updateFailed'));
      } finally {
        setIsClearingBookings(false);
      }
    });
  };

  const handleResetSchoolFinancesClick = () => {
    if (!onRequestConfirm || !onResetSchoolFinances || isResettingFinances) return;

    onRequestConfirm(
      t('resetSchoolFinancesConfirm').replace('{amount}', String(starterCreditUsd)),
      async () => {
        setIsResettingFinances(true);
        setResetFinancesMessage(null);
        setResetFinancesProgress(0);
        try {
          const result = await onResetSchoolFinances(setResetFinancesProgress);
          setResetFinancesMessage(
            t('resetSchoolFinancesDone')
              .replace('{users}', String(result.usersReset))
              .replace('{ledger}', String(result.ledgerDeleted))
              .replace('{credits}', String(result.starterCreditsWritten))
          );
        } catch {
          setResetFinancesMessage(t('updateFailed'));
        } finally {
          setIsResettingFinances(false);
        }
      }
    );
  };

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
      >
        <div className="space-y-3 max-w-md">
          <div className="space-y-1.5 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
            <label
              htmlFor="starter-credit-usd"
              className="block text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold"
            >
              {t('starterCreditSettingLabel')}
            </label>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed">
              {t('starterCreditSettingDesc')}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-mono text-[var(--ink-dim)]">$</span>
              <input
                id="starter-credit-usd"
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
                className="w-28 bg-transparent border border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                USD
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

      <AdminCollapsibleSection
        id="resort_data"
        title={t('resortDetailsTitle') || 'Данные курорта и геолокация погоды'}
        subtitle={t('resortDetailsSub') || 'Название курорта, GPS координаты и статус подъемников'}
        icon={Mountain}
      >
        <ResortDataSection />
      </AdminCollapsibleSection>

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
        id="clear_student_bookings"
        title={t('clearStudentBookingsTitle')}
        subtitle={t('clearStudentBookingsSub')}
        icon={Trash2}
      >
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3 border-b border-[var(--border)] pb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
              {t('clearCancelledBookingsTitle')}
            </h4>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed font-mono">
              {t('clearCancelledBookingsDesc')}
            </p>
            {cancelledBookingsCount > 0 && (
              <p className="text-[10px] font-mono text-[var(--ink)]">
                {t('clearCancelledBookingsLoadedCount').replace(
                  '{n}',
                  String(cancelledBookingsCount)
                )}
              </p>
            )}
            <button
              type="button"
              onClick={handleClearCancelledBookingsClick}
              disabled={!onClearCancelledBookings || isClearingCancelled}
              className="py-2 px-4 border border-amber-900/40 hover:border-amber-500 text-amber-500 hover:bg-amber-950/10 rounded-none text-xs font-mono uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
            >
              {isClearingCancelled
                ? t('clearCancelledBookingsRunning').replace('{n}', String(clearCancelledProgress))
                : t('clearCancelledBookingsRun')}
            </button>
            {clearCancelledMessage && (
              <p className="text-xs text-[var(--ink-dim)] font-mono">{clearCancelledMessage}</p>
            )}
          </div>

          <div className="space-y-3 border-b border-[var(--border)] pb-5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
              {t('clearStudentBookingsTitle')}
            </h4>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed font-mono">
              {t('clearStudentBookingsDesc')}
            </p>
            {studentBookingsCount > 0 && (
              <p className="text-[10px] font-mono text-[var(--ink)]">
                {t('clearStudentBookingsLoadedCount').replace('{n}', String(studentBookingsCount))}
              </p>
            )}
            <button
              type="button"
              onClick={handleClearStudentBookingsClick}
              disabled={!onClearStudentBookings || isClearingBookings}
              className="py-2 px-4 border border-rose-900/40 hover:border-rose-500 text-rose-500 hover:bg-rose-950/10 rounded-none text-xs font-mono uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
            >
              {isClearingBookings
                ? t('clearStudentBookingsRunning').replace('{n}', String(clearBookingsProgress))
                : t('clearStudentBookingsRun')}
            </button>
            {clearBookingsMessage && (
              <p className="text-xs text-[var(--ink-dim)] font-mono">{clearBookingsMessage}</p>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
              {t('resetSchoolFinancesTitle')}
            </h4>
            <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed font-mono">
              {t('resetSchoolFinancesDesc').replace('{amount}', String(starterCreditUsd))}
            </p>
            <button
              type="button"
              onClick={handleResetSchoolFinancesClick}
              disabled={!onResetSchoolFinances || isResettingFinances}
              className="py-2 px-4 border border-rose-900/40 hover:border-rose-500 text-rose-500 hover:bg-rose-950/10 rounded-none text-xs font-mono uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
            >
              {isResettingFinances
                ? t('resetSchoolFinancesRunning').replace('{n}', String(resetFinancesProgress))
                : t('resetSchoolFinancesRun')}
            </button>
            {resetFinancesMessage && (
              <p className="text-xs text-[var(--ink-dim)] font-mono">{resetFinancesMessage}</p>
            )}
          </div>
        </div>
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
