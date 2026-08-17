import type { Booking, Course, UserProfile } from '../../../../types';
import {
  type SkillConfig,
  type SkillItem,
  DEFAULT_SKILL_CONFIG,
  calculateSkillProgress,
  getSkillItemSection,
  getSkillItemTitle,
} from '../../../../domain/achievements';
import type { Language } from '../../../../lib/i18n/translations';
import { getRecommendationTasks } from '../../lessonRecommendations';
import {
  customTodayTaskId,
  resolveCompletedTodayTaskIds,
  skillTodayTaskId,
} from '../../todayChecklist';
import { isBookingInTodayRecommendationWindow } from './studentLessonPresentation';
import { getTodayTaskBookingContext } from './studentTodayTaskContext';
import type { SectionProgress, TodayTask } from './studentCabinetUtils';

export const getLevelProgressPercent = (userProfile: UserProfile, skillConfig?: SkillConfig) => {
  const level = userProfile.level || 1;
  const progress = calculateSkillProgress(
    userProfile.skillScores || {},
    skillConfig?.items || DEFAULT_SKILL_CONFIG.items,
    level,
    skillConfig?.passPercentage ?? 80
  );
  if (progress.targetMaxPoints <= 0) return { percent: 0, remaining: 0, progress };
  const percent = Math.min(
    100,
    Math.round((progress.targetEarnedPoints / progress.targetRequiredPoints) * 100)
  );
  return { percent, remaining: progress.remainingPointsNeeded, progress };
};

export const getSectionProgress = (
  userProfile: UserProfile,
  skillConfig?: SkillConfig,
  language: Language = 'ru'
): SectionProgress[] => {
  const items = skillConfig?.items || DEFAULT_SKILL_CONFIG.items;
  const level = userProfile.level || 1;
  const targetLevel = level >= 4 ? 3 : Math.min(3, Math.max(1, level));
  const relevant = items.filter((i) => i.levelTarget <= targetLevel);
  const scores = userProfile.skillScores || {};

  const bySection = new Map<string, { earned: number; max: number }>();
  relevant.forEach((item) => {
    const secName = getSkillItemSection(item, language);
    const cur = bySection.get(secName) || { earned: 0, max: 0 };
    cur.earned += scores[item.id] || 0;
    cur.max += item.maxPoints;
    bySection.set(secName, cur);
  });

  return Array.from(bySection.entries())
    .map(([label, { earned, max }]) => ({
      id: label,
      label,
      percent: max > 0 ? Math.min(100, Math.round((earned / max) * 100)) : 0,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6);
};

export type SkillRingFilter = 'all' | 'technique' | 'control' | 'speed';

export const getSkillItemRingCategory = (item: SkillItem): Exclude<SkillRingFilter, 'all'> => {
  if (item.techniquePoints >= item.controlPoints && item.techniquePoints >= item.speedPoints) {
    return 'technique';
  }
  if (item.controlPoints >= item.speedPoints) return 'control';
  return 'speed';
};

export const matchesSkillRingFilter = (item: SkillItem, filter: SkillRingFilter) =>
  filter === 'all' || getSkillItemRingCategory(item) === filter;

export interface PrioritySkillItem {
  id: string;
  title: string;
  earned: number;
  maxPoints: number;
  percent: number;
  pinned: boolean;
}

export const getPrioritySkillItems = (
  userProfile: UserProfile,
  skillConfig?: SkillConfig,
  limit = 3,
  language: Language = 'ru'
): PrioritySkillItem[] => {
  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const currentLevel = Math.max(1, userProfile.level || 1);
  const targetStage = Math.min(currentLevel, 3);
  const scores = userProfile.skillScores || {};
  const pinnedIds = new Set(userProfile.todaySkillItemIds ?? []);

  return items
    .filter((item) => item.levelTarget === targetStage)
    .map((item) => {
      const earned = scores[item.id] ?? 0;
      const percent =
        item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 100;
      return {
        id: item.id,
        title: getSkillItemTitle(item, language),
        earned,
        maxPoints: item.maxPoints,
        percent,
        pinned: pinnedIds.has(item.id),
      };
    })
    .filter((item) => item.earned < item.maxPoints)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.percent - b.percent;
    })
    .slice(0, limit);
};

export type NextStepAction =
  | {
      kind: 'exercise';
      exerciseId: string;
      exerciseTitle: string;
      pointsGain: number;
      levelProgressDelta: number;
      targetLevel: number;
      pinned: boolean;
    }
  | {
      kind: 'recommendation';
      label: string;
      bookingId: string;
    }
  | { kind: 'complete' };

export const getNextStepAction = (
  userProfile: UserProfile,
  bookings: Booking[],
  skillConfig?: SkillConfig,
  language: Language = 'ru'
): NextStepAction | null => {
  if (userProfile.hideProgressTracking) return null;

  const pendingRec = getRecommendationTasks(bookings).find((task) => !task.done);
  if (pendingRec) {
    return {
      kind: 'recommendation',
      label: pendingRec.label,
      bookingId: pendingRec.bookingId,
    };
  }

  const currentLevel = Math.max(1, userProfile.level || 1);
  const targetStage = Math.min(currentLevel, 3);
  const pinnedIds = new Set(userProfile.todaySkillItemIds ?? []);
  const priorityItems = getPrioritySkillItems(userProfile, skillConfig, 20, language);
  let nextExercise = priorityItems.find((item) => !item.pinned);

  if (!nextExercise) {
    const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
    const scores = userProfile.skillScores || {};
    const unpinnedCandidate = items
      .filter((item) => item.levelTarget === targetStage)
      .map((item) => {
        const earned = scores[item.id] ?? 0;
        const percent =
          item.maxPoints > 0 ? Math.min(100, Math.round((earned / item.maxPoints) * 100)) : 100;
        return {
          id: item.id,
          title: getSkillItemTitle(item, language),
          earned,
          maxPoints: item.maxPoints,
          percent,
          pinned: pinnedIds.has(item.id),
          levelTarget: item.levelTarget,
        };
      })
      .filter((item) => item.earned < item.maxPoints && !item.pinned)
      .sort((a, b) => a.percent - b.percent)[0];

    if (unpinnedCandidate) {
      nextExercise = unpinnedCandidate;
    }
  }

  if (!nextExercise) {
    return { kind: 'complete' };
  }

  const level = userProfile.level || 1;
  const targetLevel = Math.min(4, level + 1);
  const pointsGain = Math.max(0, nextExercise.maxPoints - nextExercise.earned);
  const { percent: currentPercent } = getLevelProgressPercent(userProfile, skillConfig);
  const simulatedScores = {
    ...(userProfile.skillScores || {}),
    [nextExercise.id]: nextExercise.maxPoints,
  };
  const { percent: afterPercent } = getLevelProgressPercent(
    { ...userProfile, skillScores: simulatedScores },
    skillConfig
  );

  return {
    kind: 'exercise',
    exerciseId: nextExercise.id,
    exerciseTitle: nextExercise.title,
    pointsGain,
    levelProgressDelta: Math.max(0, afterPercent - currentPercent),
    targetLevel,
    pinned: nextExercise.pinned,
  };
};

export const getTodayTasks = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  language: 'en' | 'ru',
  skillConfig: SkillConfig | undefined
): TodayTask[] => {
  const items = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const completed = new Set(resolveCompletedTodayTaskIds(userProfile));
  const dismissed = new Set(userProfile.dismissedTodayTaskIds ?? []);

  const recTasks: TodayTask[] = getRecommendationTasks(bookings)
    .filter((task) => !task.done)
    .filter((task) => !dismissed.has(task.id))
    .filter((task) => {
      const booking = bookings.find((b) => b.id === task.bookingId);
      return booking ? isBookingInTodayRecommendationWindow(booking, courses) : false;
    })
    .map((task) => {
      const booking = bookings.find((b) => b.id === task.bookingId);
      return {
        id: task.id,
        label: task.label,
        done: task.done,
        kind: 'recommendation' as const,
        bookingId: task.bookingId,
        recommendationId: task.recommendationId,
        bookingContext: booking
          ? getTodayTaskBookingContext(booking, courses, language)
          : undefined,
      };
    });

  const skillTasks: TodayTask[] = (userProfile.todaySkillItemIds ?? []).map((skillId) => {
    const item = items.find((i) => i.id === skillId);
    const taskId = skillTodayTaskId(skillId);
    return {
      id: taskId,
      label: item ? getSkillItemTitle(item, language) : skillId,
      done: completed.has(taskId),
      kind: 'skill' as const,
      skillItemId: skillId,
    };
  });

  const customTasks: TodayTask[] = (userProfile.customTodayTasks ?? []).map((task) => {
    const taskId = customTodayTaskId(task.id);
    return {
      id: taskId,
      label: task.text,
      done: completed.has(taskId),
      kind: 'custom' as const,
      customTaskId: task.id,
    };
  });

  return [...recTasks, ...skillTasks, ...customTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return 0;
  });
};
