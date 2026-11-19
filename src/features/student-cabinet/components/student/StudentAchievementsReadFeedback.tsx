import { retryParticipantAchievements } from '../../../participant-achievements/participantAchievementsService';
import { useParticipantAchievementsReadStatus } from '../../../participant-achievements/participantAchievementsStore';
import { SecondarySettingFeedback } from '../../../settings/SecondarySettingFeedback';
import { useSettingsStore } from '../../../settings/settingsStore';
import { ScTextButton } from './StudentCabinetUI';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export function StudentAchievementsReadFeedback({
  participantId,
  showLoading = false,
}: {
  participantId: string | undefined;
  showLoading?: boolean;
}) {
  const { t } = useStudentCabinetTranslations();
  const status = useParticipantAchievementsReadStatus(participantId);
  const configConfirmed = useSettingsStore(
    (state) => state.secondaryReads.achievementsConfig.confirmed
  );
  if (!participantId) return null;

  const loading = status === 'idle' || status === 'loading';
  return (
    <>
      {status === 'error' && (
        <div
          role="alert"
          className="mb-2 flex flex-wrap items-center gap-2 type-compact text-[var(--ink-dim)]"
        >
          <span>{t('participantAchievementsLoadError')}</span>
          <ScTextButton onClick={() => void retryParticipantAchievements(participantId)}>
            {t('retry')}
          </ScTextButton>
        </div>
      )}
      {showLoading && loading && (
        <p role="status" className="type-compact text-[var(--ink-dim)]">
          {t('loading')}
        </p>
      )}
      <SecondarySettingFeedback
        setting="achievementsConfig"
        t={t}
        showLoading={showLoading && !loading && status !== 'error'}
      />
      <SecondarySettingFeedback
        setting="skillConfig"
        t={t}
        showLoading={showLoading && !loading && status !== 'error' && configConfirmed}
      />
    </>
  );
}
