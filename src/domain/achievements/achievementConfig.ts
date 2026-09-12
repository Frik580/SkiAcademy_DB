import type {
  ParticipantLessonFeedbackReadModel,
  ParticipantLessonStatsEvidence,
} from '@ski-academy/shared-domain';
import { ActivityLogMetadata } from '../../types';
import {
  evaluateEarnedAchievements as evaluateCanonicalEarnedAchievements,
  isAchievementRuleMet as isCanonicalAchievementRuleMet,
} from './canonicalAchievementEvaluation';
import { DEFAULT_SKILL_CONFIG, SkillConfig, SkillItem } from './skillData';

export type AchievementRuleType =
  | 'lessons_completed'
  | 'hours_completed'
  | 'streak_weeks'
  | 'exercises_mastered'
  | 'level_up'
  | 'feedback_given'
  | 'homework_done'
  | 'course_graduate'
  | 'skill_items_max';

export interface AchievementRule {
  type: AchievementRuleType;
  count?: number;
  skillItemIds?: string[];
}

export interface AchievementDefinition {
  id: string;
  labelRu: string;
  labelEn: string;
  icon: string;
  order: number;
  rule: AchievementRule;
}

export interface AchievementsConfig {
  items: AchievementDefinition[];
}

export interface CanonicalAchievementProgress {
  readonly participantId: string;
  readonly level: number;
  readonly skillScores: Readonly<Record<string, number>>;
}

export interface CanonicalAccountReviewEvidence {
  readonly createdAtIso: string;
}

export interface AchievementEvaluationContext {
  readonly participantId: string;
  readonly lessonEvidence: readonly ParticipantLessonStatsEvidence[];
  readonly progress: CanonicalAchievementProgress;
  readonly lessonFeedback: readonly ParticipantLessonFeedbackReadModel[];
  readonly accountReviews: readonly CanonicalAccountReviewEvidence[];
  readonly skillConfig?: SkillConfig;
  readonly now?: Date;
}

export interface EvaluatedAchievement {
  id: string;
  icon: string;
  labelRu: string;
  labelEn: string;
  earnedAt?: string;
  order: number;
}

export const DEFAULT_ACHIEVEMENTS_CONFIG: AchievementsConfig = {
  items: [
    {
      id: 'first_lesson',
      labelRu: 'Первое занятие',
      labelEn: 'First lesson',
      icon: '🎿',
      order: 1,
      rule: { type: 'lessons_completed', count: 1 },
    },
    {
      id: 'ten_lessons',
      labelRu: '10 занятий',
      labelEn: '10 sessions',
      icon: '🏅',
      order: 2,
      rule: { type: 'lessons_completed', count: 10 },
    },
    {
      id: 'twenty_hours',
      labelRu: '20 часов на склоне',
      labelEn: '20 hours on snow',
      icon: '⏱️',
      order: 3,
      rule: { type: 'hours_completed', count: 20 },
    },
    {
      id: 'streak_3_weeks',
      labelRu: '3 недели подряд',
      labelEn: '3-week streak',
      icon: '🔥',
      order: 4,
      rule: { type: 'streak_weeks', count: 3 },
    },
    {
      id: 'five_exercises',
      labelRu: '5 упражнений освоено',
      labelEn: '5 exercises mastered',
      icon: '✅',
      order: 5,
      rule: { type: 'exercises_mastered', count: 5 },
    },
    {
      id: 'level_up',
      labelRu: 'Новый уровень',
      labelEn: 'Level up',
      icon: '⬆️',
      order: 6,
      rule: { type: 'level_up' },
    },
    {
      id: 'feedback_given',
      labelRu: 'Отзыв оставлен',
      labelEn: 'Feedback given',
      icon: '💬',
      order: 7,
      rule: { type: 'feedback_given' },
    },
    {
      id: 'homework_done',
      labelRu: 'Домашка выполнена',
      labelEn: 'Homework completed',
      icon: '📝',
      order: 8,
      rule: { type: 'homework_done' },
    },
    {
      id: 'course_graduate',
      labelRu: 'Выпускник курса',
      labelEn: 'Course graduate',
      icon: '🎓',
      order: 9,
      rule: { type: 'course_graduate' },
    },
    {
      id: 'milestone_big_radius_linked',
      labelRu: 'Связанный спуск большого радиуса с уколом палкой',
      labelEn: 'Linked large-radius descent with pole plant',
      icon: '⛷️',
      order: 101,
      rule: { type: 'skill_items_max', skillItemIds: ['l1_13'] },
    },
    {
      id: 'milestone_snowflake',
      labelRu: 'Элемент «снежинка»',
      labelEn: 'Snowflake element',
      icon: '❄️',
      order: 102,
      rule: { type: 'skill_items_max', skillItemIds: ['l1_15'] },
    },
    {
      id: 'milestone_small_radius_carve',
      labelRu: 'Карвинговый поворот малого радиуса',
      labelEn: 'Small-radius carving turn',
      icon: '🔄',
      order: 103,
      rule: { type: 'skill_items_max', skillItemIds: ['l2_3'] },
    },
    {
      id: 'milestone_zip_line',
      labelRu: 'Зип лайн',
      labelEn: 'Zip line completed',
      icon: '🎯',
      order: 104,
      rule: { type: 'skill_items_max', skillItemIds: ['l2_13'] },
    },
    {
      id: 'milestone_turn_master',
      labelRu: 'Мастер поворотов',
      labelEn: 'Turn master',
      icon: '🏅',
      order: 105,
      rule: {
        type: 'skill_items_max',
        skillItemIds: ['l3_16', 'l3_17', 'l3_18', 'l3_19', 'l3_20', 'l3_21'],
      },
    },
    {
      id: 'milestone_edge_master',
      labelRu: 'Мастер закантовки',
      labelEn: 'Edge master',
      icon: '📐',
      order: 106,
      rule: { type: 'skill_items_max', skillItemIds: ['l3_3'] },
    },
  ],
};

const LEGACY_ACHIEVEMENT_LABELS: Record<string, { ru: string; en: string }> = {
  section_master: { ru: 'Мастер секции', en: 'Section master' },
};

const normalizeRule = (rule: AchievementRule): AchievementRule => {
  switch (rule.type) {
    case 'lessons_completed':
    case 'hours_completed':
    case 'streak_weeks':
    case 'exercises_mastered':
      return { type: rule.type, count: rule.count ?? 1 };
    case 'skill_items_max':
      return {
        type: rule.type,
        skillItemIds: Array.isArray(rule.skillItemIds) ? rule.skillItemIds.filter(Boolean) : [],
      };
    case 'level_up':
    case 'feedback_given':
    case 'homework_done':
    case 'course_graduate':
      return { type: rule.type };
    default:
      return { type: rule.type };
  }
};

export const normalizeAchievementsConfig = (
  raw?: Partial<AchievementsConfig>
): AchievementsConfig => {
  const items = Array.isArray(raw?.items) ? raw!.items : DEFAULT_ACHIEVEMENTS_CONFIG.items;
  const normalized = items
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.trim().length > 0 &&
        typeof item.labelRu === 'string' &&
        typeof item.labelEn === 'string' &&
        item.rule &&
        typeof item.rule.type === 'string'
    )
    .map((item, index) => ({
      id: item.id.trim(),
      labelRu: item.labelRu.trim(),
      labelEn: item.labelEn.trim(),
      icon: item.icon?.trim() || '🏆',
      order: typeof item.order === 'number' ? item.order : index + 1,
      rule: normalizeRule(item.rule),
    }));

  const unique = new Map<string, AchievementDefinition>();
  normalized.forEach((item) => unique.set(item.id, item));

  return {
    items: Array.from(unique.values()).sort((a, b) => a.order - b.order),
  };
};

export const getAchievementLabel = (
  id: string,
  language: 'en' | 'ru',
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG,
  metadata?: Pick<ActivityLogMetadata, 'achievementLabelRu' | 'achievementLabelEn'>
): string => {
  if (metadata?.achievementLabelRu || metadata?.achievementLabelEn) {
    return language === 'ru'
      ? metadata.achievementLabelRu || metadata.achievementLabelEn || id
      : metadata.achievementLabelEn || metadata.achievementLabelRu || id;
  }

  const item = config.items.find((entry) => entry.id === id);
  if (item) return language === 'ru' ? item.labelRu : item.labelEn;

  const legacy = LEGACY_ACHIEVEMENT_LABELS[id];
  if (legacy) return language === 'ru' ? legacy.ru : legacy.en;

  return id;
};

export {
  achievementProductScope,
  participantAchievementSourceForRule,
  participantLessonFeedbackHomeworkDone,
} from './canonicalAchievementEvaluation';

export const isAchievementRuleMet = isCanonicalAchievementRuleMet;

export const evaluateEarnedAchievements = (
  ctx: AchievementEvaluationContext,
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG
) => evaluateCanonicalEarnedAchievements(ctx, config);

export const describeAchievementRule = (
  definition: AchievementDefinition,
  skillItems: SkillItem[] = DEFAULT_SKILL_CONFIG.items,
  language: 'en' | 'ru' = 'ru'
): string => {
  const rule = definition.rule;
  const isRu = language === 'ru';

  switch (rule.type) {
    case 'lessons_completed':
      return isRu
        ? `Завершено занятий: ${rule.count ?? 1}`
        : `Completed lessons: ${rule.count ?? 1}`;
    case 'hours_completed':
      return isRu ? `Часов на склоне: ${rule.count ?? 1}+` : `Hours on snow: ${rule.count ?? 1}+`;
    case 'streak_weeks':
      return isRu ? `Недель подряд: ${rule.count ?? 1}` : `Weeks in a row: ${rule.count ?? 1}`;
    case 'exercises_mastered':
      return isRu
        ? `Упражнений на max: ${rule.count ?? 1}`
        : `Exercises at max score: ${rule.count ?? 1}`;
    case 'level_up':
      return isRu ? 'Переход на новый уровень' : 'Level up';
    case 'feedback_given':
      return isRu ? 'Оставлен отзыв' : 'Review submitted';
    case 'homework_done':
      return isRu ? 'Выполнены все рекомендации' : 'All recommendations completed';
    case 'course_graduate':
      return isRu ? 'Завершён групповой курс' : 'Group course completed';
    case 'skill_items_max': {
      const titles = (rule.skillItemIds ?? [])
        .map((id) => skillItems.find((item) => item.id === id)?.title ?? id)
        .join(', ');
      return isRu ? `Max score: ${titles}` : `Max score: ${titles}`;
    }
    default:
      return rule.type;
  }
};
