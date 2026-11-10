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

export function lessonContextSkillGroups(
  progress: ParticipantProgressView,
  config: SkillConfig,
  language: Language
) {
  const groups = new Map<number, { id: string; title: string; scoreLabel: string }[]>();
  for (const item of config.items) {
    const hasScore = Object.hasOwn(progress.skillScores, item.id);
    const earned = Math.min(item.maxPoints, Math.max(0, progress.skillScores[item.id] ?? 0));
    const skills = groups.get(item.levelTarget) ?? [];
    skills.push({
      id: item.id,
      title: getSkillItemTitle(item, language),
      scoreLabel: formatSkillScore({ hasScore, earned, maxPoints: item.maxPoints }, language),
    });
    groups.set(item.levelTarget, skills);
  }

  const canonicalLevels: number[] = MASTERY_LEVELS.map((level) => level.id);
  const extraLevels = [...groups.keys()]
    .filter((level) => !canonicalLevels.includes(level))
    .sort((a, b) => a - b);
  const orderedGroups = [...canonicalLevels, ...extraLevels].flatMap((level) => {
    const skills = groups.get(level);
    return skills ? [{ level, name: lessonContextLevelName(level), skills }] : [];
  });
  const expandedLevel =
    progress.level === MASTERY_LEVELS.at(-1)?.id ? orderedGroups.at(-1)?.level : progress.level;

  return orderedGroups.map((group) => ({
    ...group,
    defaultExpanded: group.level === expandedLevel,
  }));
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
