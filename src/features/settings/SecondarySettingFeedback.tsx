import type { TranslationKey } from '../../lib/i18n/translations';
import { ActionButton } from '../../ui/ActionButton';
import { retrySecondarySetting, type SecondarySetting, useSettingsStore } from './settingsStore';

const errorLabels = {
  studentDashboardLayout: 'dashboardLayoutLoadError',
  notificationRetentionDays: 'notificationRetentionLoadError',
  starterCreditKzt: 'starterCreditLoadError',
  skillConfig: 'skillConfigLoadError',
  achievementsConfig: 'achievementsConfigLoadError',
} satisfies Record<SecondarySetting, TranslationKey>;

export function SecondarySettingFeedback({
  setting,
  t,
  showLoading = true,
}: {
  setting: SecondarySetting;
  t: (key: TranslationKey) => string;
  showLoading?: boolean;
}) {
  const read = useSettingsStore((state) => state.secondaryReads[setting]);
  if (read.status === 'error') {
    return (
      <div
        role="alert"
        className="mb-2 flex flex-wrap items-center gap-2 type-compact text-[var(--ink-dim)]"
      >
        <span>{t(errorLabels[setting])}</span>
        <ActionButton size="sm" onClick={() => retrySecondarySetting(setting)}>
          {t('retry')}
        </ActionButton>
      </div>
    );
  }
  if (showLoading && read.status === 'loading') {
    return (
      <p role="status" className="type-compact text-[var(--ink-dim)]">
        {t('loading')}
      </p>
    );
  }
  return null;
}
