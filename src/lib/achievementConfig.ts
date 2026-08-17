import { parseCourseDates } from '../app/providers/LanguageContext';
import { findStreakWeeksTimestamp, getTrainingStreakWeeks } from './trainingStreak';
import {
  ActivityLog,
  ActivityLogMetadata,
  Booking,
  Course,
  Review,
  SkillDeltaMeta,
  UserProfile,
} from '../types';
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

export interface AchievementEvaluationContext {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  reviews: Review[];
  skillConfig?: SkillConfig;
  activityLogs: ActivityLog[];
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

const getCompletedBookings = (bookings: Booking[]) =>
  bookings
    .filter((b) => b.status === 'completed' && !b.isDeleted)
    .sort((a, b) => a.date.localeCompare(b.date));

const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const resolveBookingStartDate = (booking: Booking, courses: Course[]) => {
  if (booking.instructorId.startsWith('course_')) {
    const courseId = booking.instructorId.substring('course_'.length);
    const course = courses.find((c) => c.id === courseId);
    const parsed = parseCourseDates(course ? course.dates : booking.date);
    return toYMD(parsed.start);
  }
  return booking.date;
};

const bookingTimestamp = (booking: Booking, courses: Course[]) =>
  `${resolveBookingStartDate(booking, courses)}T12:00:00.000Z`;

const countExercisesMastered = (scores: Record<string, number>, skillItems: SkillItem[]) =>
  skillItems.filter((item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints)
    .length;

const isExerciseMastered = (scores: Record<string, number>, item: SkillItem) =>
  item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints;

const resolveSkillItems = (ids: string[], items: SkillItem[]) =>
  ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is SkillItem => Boolean(item));

const hasHomeworkDone = (bookings: Booking[]) =>
  bookings.some((booking) => {
    const recommendations = booking.recommendations ?? [];
    if (recommendations.length === 0) return false;
    const completed = new Set(booking.completedRecommendationIds ?? []);
    return recommendations.every((rec) => completed.has(rec.id));
  });

const hasGraduatedCourse = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  now = new Date()
) =>
  bookings.some((booking) => {
    if (
      booking.userId !== userProfile.uid ||
      booking.status !== 'completed' ||
      booking.isDeleted ||
      !booking.instructorId.startsWith('course_')
    ) {
      return false;
    }
    const courseId = booking.instructorId.replace('course_', '');
    const course = courses.find((item) => item.id === courseId);
    if (!course) return false;
    const { end } = parseCourseDates(course.dates);
    if (!end || Number.isNaN(end.getTime())) return false;
    end.setHours(23, 59, 59, 999);
    return end.getTime() <= now.getTime();
  });

const findTwentyHoursTimestamp = (completed: Booking[], courses: Course[]) => {
  let total = 0;
  for (const booking of completed) {
    total += booking.durationHours;
    if (total >= 20) return bookingTimestamp(booking, courses);
  }
  return undefined;
};

const findLevelUpTimestamp = (ctx: AchievementEvaluationContext) => {
  const levelUpLog = ctx.activityLogs
    .filter((log) => log.type === 'level_up')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
  if (levelUpLog) return levelUpLog.timestamp;
  if ((ctx.userProfile.level || 1) >= 2) {
    const firstCompleted = getCompletedBookings(ctx.bookings)[0];
    return firstCompleted ? bookingTimestamp(firstCompleted, ctx.courses) : undefined;
  }
  return undefined;
};

const findHomeworkDoneTimestamp = (ctx: AchievementEvaluationContext) => {
  const homeworkLog = ctx.activityLogs
    .filter((log) => log.type === 'recommendations_completed_all')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
  if (homeworkLog) return homeworkLog.timestamp;

  const booking = ctx.bookings.find((item) => {
    const recommendations = item.recommendations ?? [];
    if (recommendations.length === 0) return false;
    const completed = new Set(item.completedRecommendationIds ?? []);
    return recommendations.every((rec) => completed.has(rec.id));
  });
  return booking ? bookingTimestamp(booking, ctx.courses) : undefined;
};

const findFeedbackTimestamp = (ctx: AchievementEvaluationContext) => {
  const reviewLog = ctx.activityLogs
    .filter((log) => log.type === 'review_created')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
  if (reviewLog) return reviewLog.timestamp;

  const review = ctx.reviews
    .filter((item) => item.userId === ctx.userProfile.uid)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return review ? `${review.date}T12:00:00.000Z` : undefined;
};

const findCourseGraduateTimestamp = (ctx: AchievementEvaluationContext, now = new Date()) => {
  const completedCourseBookings = getCompletedBookings(ctx.bookings).filter((booking) =>
    booking.instructorId.startsWith('course_')
  );

  for (const booking of completedCourseBookings) {
    const courseId = booking.instructorId.replace('course_', '');
    const course = ctx.courses.find((item) => item.id === courseId);
    if (!course) continue;
    const { end } = parseCourseDates(course.dates);
    if (!end || Number.isNaN(end.getTime())) continue;
    end.setHours(23, 59, 59, 999);
    if (end.getTime() <= now.getTime()) {
      return `${end.toISOString().slice(0, 10)}T12:00:00.000Z`;
    }
  }
  return undefined;
};

const latestSkillScoresTimestamp = (activityLogs: ActivityLog[]) =>
  activityLogs
    .filter((log) => log.type === 'skill_scores_updated' || log.type === 'level_up')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp;

const getSkillScoreLogs = (activityLogs: ActivityLog[]) =>
  activityLogs
    .filter(
      (log) =>
        (log.type === 'skill_scores_updated' || log.type === 'level_up') &&
        Array.isArray(log.metadata?.skillDeltas)
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

const applySkillDeltas = (scores: Record<string, number>, deltas: SkillDeltaMeta[]) => {
  for (const item of deltas) {
    if (!item.itemId) continue;
    scores[item.itemId] =
      typeof item.newScore === 'number'
        ? item.newScore
        : (scores[item.itemId] ?? 0) + (item.delta ?? 0);
  }
};

const findExercisesMasteredTimestamp = (
  ctx: AchievementEvaluationContext,
  requiredCount: number
): string | undefined => {
  const skillItems = ctx.skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const scores: Record<string, number> = {};

  for (const log of getSkillScoreLogs(ctx.activityLogs)) {
    applySkillDeltas(scores, log.metadata!.skillDeltas!);
    if (countExercisesMastered(scores, skillItems) >= requiredCount) {
      return log.timestamp;
    }
  }

  if (countExercisesMastered(ctx.userProfile.skillScores || {}, skillItems) >= requiredCount) {
    return latestSkillScoresTimestamp(ctx.activityLogs);
  }

  return undefined;
};

const findSkillItemsMaxTimestamp = (
  ctx: AchievementEvaluationContext,
  requiredIds: string[]
): string | undefined => {
  const skillItems = ctx.skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const requiredItems = resolveSkillItems(requiredIds, skillItems);
  if (requiredItems.length === 0) return undefined;

  const scores: Record<string, number> = {};
  for (const log of getSkillScoreLogs(ctx.activityLogs)) {
    applySkillDeltas(scores, log.metadata!.skillDeltas!);
    if (requiredItems.every((item) => isExerciseMastered(scores, item))) {
      return log.timestamp;
    }
  }

  const currentScores = ctx.userProfile.skillScores || {};
  if (requiredItems.every((item) => isExerciseMastered(currentScores, item))) {
    return latestSkillScoresTimestamp(ctx.activityLogs);
  }

  return undefined;
};

export const isAchievementRuleMet = (
  definition: AchievementDefinition,
  ctx: AchievementEvaluationContext
): boolean => {
  const completed = getCompletedBookings(ctx.bookings);
  const skillItems = ctx.skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const scores = ctx.userProfile.skillScores || {};
  const userReviews = ctx.reviews.filter((review) => review.userId === ctx.userProfile.uid);
  const rule = definition.rule;

  switch (rule.type) {
    case 'lessons_completed':
      return completed.length >= (rule.count ?? 1);
    case 'hours_completed':
      return (
        completed.reduce((sum, booking) => sum + booking.durationHours, 0) >= (rule.count ?? 1)
      );
    case 'streak_weeks':
      return getTrainingStreakWeeks(ctx.bookings, ctx.activityLogs) >= (rule.count ?? 1);
    case 'exercises_mastered':
      return countExercisesMastered(scores, skillItems) >= (rule.count ?? 1);
    case 'level_up':
      return (
        (ctx.userProfile.level || 1) >= 2 || ctx.activityLogs.some((log) => log.type === 'level_up')
      );
    case 'feedback_given':
      return (
        userReviews.length > 0 || ctx.activityLogs.some((log) => log.type === 'review_created')
      );
    case 'homework_done':
      return hasHomeworkDone(ctx.bookings);
    case 'course_graduate':
      return hasGraduatedCourse(ctx.userProfile, ctx.bookings, ctx.courses);
    case 'skill_items_max': {
      const requiredIds = rule.skillItemIds ?? [];
      if (requiredIds.length === 0) return false;
      const requiredItems = resolveSkillItems(requiredIds, skillItems);
      if (requiredItems.length !== requiredIds.length) return false;
      return requiredItems.every((item) => isExerciseMastered(scores, item));
    }
    default:
      return false;
  }
};

const inferEarnedAt = (
  definition: AchievementDefinition,
  ctx: AchievementEvaluationContext
): string | undefined => {
  const completed = getCompletedBookings(ctx.bookings);
  const completedLogs = ctx.activityLogs
    .filter((log) => log.type === 'booking_completed')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  switch (definition.rule.type) {
    case 'lessons_completed': {
      const index = Math.max(0, (definition.rule.count ?? 1) - 1);
      return (
        completedLogs[index]?.timestamp ??
        (completed[index] ? bookingTimestamp(completed[index], ctx.courses) : undefined)
      );
    }
    case 'hours_completed':
      return findTwentyHoursTimestamp(completed, ctx.courses);
    case 'streak_weeks':
      return findStreakWeeksTimestamp(ctx.bookings, ctx.activityLogs, definition.rule.count ?? 1);
    case 'exercises_mastered':
      return findExercisesMasteredTimestamp(ctx, definition.rule.count ?? 1);
    case 'skill_items_max':
      return findSkillItemsMaxTimestamp(ctx, definition.rule.skillItemIds ?? []);
    case 'level_up':
      return findLevelUpTimestamp(ctx);
    case 'feedback_given':
      return findFeedbackTimestamp(ctx);
    case 'homework_done':
      return findHomeworkDoneTimestamp(ctx);
    case 'course_graduate':
      return findCourseGraduateTimestamp(ctx);
    default:
      return undefined;
  }
};

export const evaluateEarnedAchievements = (
  ctx: AchievementEvaluationContext,
  config: AchievementsConfig = DEFAULT_ACHIEVEMENTS_CONFIG
): EvaluatedAchievement[] => {
  return config.items
    .filter((definition) => isAchievementRuleMet(definition, ctx))
    .map((definition) => ({
      id: definition.id,
      icon: definition.icon,
      labelRu: definition.labelRu,
      labelEn: definition.labelEn,
      earnedAt: inferEarnedAt(definition, ctx),
      order: definition.order,
    }))
    .sort((a, b) => a.order - b.order);
};

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
