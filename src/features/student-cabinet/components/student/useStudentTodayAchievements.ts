import { useMemo } from 'react';
import { participantProgressDayKey } from '@ski-academy/shared-domain';
import { usePresentedParticipantAchievements } from '../../../participant-achievements';
import type {
  TodayProgressBlockInput,
  ParticipantTodayProgressInput,
} from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

const NO_ACCOUNT_REVIEWS: readonly { createdAtIso: string }[] = [];

export function useStudentTodayAchievements(
  input: Pick<
    TodayProgressBlockInput,
    'selectedParticipantId' | 'achievementsConfig' | 'skillConfig'
  >
) {
  const { lang } = useStudentCabinetTranslations();
  const { selectedParticipantId, achievementsConfig, skillConfig } = input;
  const { achievements } = usePresentedParticipantAchievements({
    selectedParticipantId,
    language: lang,
    accountReviews: NO_ACCOUNT_REVIEWS,
    achievementsConfig,
    skillConfig,
  });

  const dayKey = participantProgressDayKey(new Date());
  const todayAchievements = useMemo(
    () =>
      achievements.filter(
        (item) => item.earnedAt && participantProgressDayKey(new Date(item.earnedAt)) === dayKey
      ),
    [achievements, dayKey]
  );
  return todayAchievements;
}

export function hasStudentTodayProgress(
  progress: ParticipantTodayProgressInput,
  achievements: readonly unknown[]
): boolean {
  return !(
    (progress.todayXP == null || progress.todayXP === 0) &&
    !progress.todayLevelUp &&
    achievements.length === 0 &&
    progress.exercises.length === 0
  );
}
