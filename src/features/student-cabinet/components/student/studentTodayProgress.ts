import { participantProgressDayKey } from '@ski-academy/shared-domain';
import {
  DEFAULT_SKILL_CONFIG,
  getSkillItemTitle,
  type SkillConfig,
} from '../../../../domain/achievements';
import type { ParticipantProgressView } from '../../../participant-progress/applyParticipantProgressToProfile';
import type { ParticipantTodayProgressInput } from './studentCabinetContracts';

export function buildParticipantTodayProgress(
  selectedParticipantId: string | undefined,
  progress: ParticipantProgressView | undefined,
  skillConfig: SkillConfig = DEFAULT_SKILL_CONFIG,
  language: 'en' | 'ru' = 'ru',
  now = new Date()
): ParticipantTodayProgressInput {
  if (!selectedParticipantId || progress?.participantId !== selectedParticipantId) {
    return { todayXP: null, todayLevelUp: null, exercises: [] };
  }
  const daily = progress.dailyProgress;
  if (!daily || daily.date !== participantProgressDayKey(now)) {
    return { level: progress.level, todayXP: null, todayLevelUp: null, exercises: [] };
  }
  const exercises = Object.entries(progress.skillScores).flatMap(([itemId, score]) => {
    const item = skillConfig.items.find((candidate) => candidate.id === itemId);
    const maxPoints = item?.maxPoints ?? 20;
    const newScore = Math.min(maxPoints, Math.max(0, score));
    const delta = Math.min(
      maxPoints,
      Math.max(0, newScore - (daily.baselineSkillScores[itemId] ?? 0))
    );
    return delta > 0
      ? [
          {
            itemId,
            title: item ? getSkillItemTitle(item, language) : itemId,
            delta,
            newScore,
            maxPoints,
          },
        ]
      : [];
  });
  return {
    level: progress.level,
    todayXP: daily.complete ? exercises.reduce((sum, item) => sum + item.delta, 0) : null,
    todayLevelUp: progress.level > daily.baselineLevel ? progress.level : null,
    exercises,
  };
}
