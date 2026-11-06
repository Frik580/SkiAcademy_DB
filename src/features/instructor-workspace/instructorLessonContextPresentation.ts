import { MASTERY_LEVELS } from '@ski-academy/shared-domain/canonical/participantLevelProgression';
import {
  DEFAULT_SKILL_CONFIG,
  getSkillItemTitle,
  type SkillConfig,
} from '../../domain/achievements';
import { formatSkillScore } from '../../lib/i18n/skillScore';
import type { Language } from '../../lib/i18n/translations';
import type { ParticipantProgressView } from '../participant-progress';
import { getCurrentSkillComments } from '../student-cabinet/components/student/coachUtils';

export function lessonContextSkills(
  progress: ParticipantProgressView,
  config: SkillConfig,
  language: Language
) {
  return config.items.map((item) => {
    const hasScore = Object.hasOwn(progress.skillScores, item.id);
    const earned = Math.min(item.maxPoints, Math.max(0, progress.skillScores[item.id] ?? 0));
    return {
      id: item.id,
      title: getSkillItemTitle(item, language),
      hasScore,
      earned,
      maximum: item.maxPoints,
      scoreLabel: formatSkillScore({ hasScore, earned, maxPoints: item.maxPoints }, language),
    };
  });
}

export function lessonContextComments(
  progress: ParticipantProgressView,
  config = DEFAULT_SKILL_CONFIG,
  language: Language,
  authors: readonly { id: string; name: string }[] = []
) {
  return getCurrentSkillComments(progress, config, language, authors);
}

export function lessonContextLevelName(level: number): string {
  return MASTERY_LEVELS.find((item) => item.id === level)?.name ?? String(level);
}
