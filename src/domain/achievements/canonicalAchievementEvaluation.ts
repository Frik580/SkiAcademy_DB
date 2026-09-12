import {
  compareCanonicalTimestamps,
  participantAttendedLessonFromEvidence,
  participantLearningDurationHoursFromEvidence,
  type ParticipantLessonFeedbackReadModel,
  type ParticipantLessonStatsEvidence,
} from '@ski-academy/shared-domain';
import type { ParticipantAchievementSource } from '@ski-academy/shared-domain';
import {
  findStreakWeeksTimestampFromPresentEvidence,
  getTrainingStreakWeeksFromPresentEvidence,
} from './trainingStreak';
import type {
  AchievementDefinition,
  AchievementEvaluationContext,
  AchievementRuleType,
  AchievementsConfig,
  EvaluatedAchievement,
} from './achievementConfig';
import { DEFAULT_SKILL_CONFIG, type SkillItem } from './skillData';

export type AchievementProductScope = 'participant' | 'account' | 'course';

export function achievementProductScope(
  definition: AchievementDefinition
): AchievementProductScope {
  switch (definition.rule.type) {
    case 'feedback_given':
      return 'account';
    case 'course_graduate':
      return 'course';
    default:
      return 'participant';
  }
}

export function participantAchievementSourceForRule(
  type: AchievementRuleType
): ParticipantAchievementSource | undefined {
  switch (type) {
    case 'lessons_completed':
    case 'hours_completed':
    case 'streak_weeks':
      return 'participant_attendance';
    case 'exercises_mastered':
    case 'level_up':
    case 'skill_items_max':
      return 'participant_progress';
    case 'homework_done':
      return 'participant_lesson_feedback';
    default:
      return undefined;
  }
}

function isoFromEvidence(row: ParticipantLessonStatsEvidence): string {
  return new Date(row.startsAt.seconds * 1000 + row.startsAt.nanoseconds / 1_000_000).toISOString();
}

function presentEvidenceForParticipant(
  ctx: AchievementEvaluationContext
): ParticipantLessonStatsEvidence[] {
  return ctx.lessonEvidence
    .filter(
      (row) =>
        row.participantId === ctx.participantId && participantAttendedLessonFromEvidence(row)
    )
    .sort((left, right) => compareCanonicalTimestamps(left.startsAt, right.startsAt));
}

function countExercisesMastered(
  scores: Readonly<Record<string, number>>,
  skillItems: SkillItem[]
) {
  return skillItems.filter((item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints)
    .length;
}

function isExerciseMastered(scores: Readonly<Record<string, number>>, item: SkillItem) {
  return item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints;
}

function resolveSkillItems(ids: string[], items: SkillItem[]) {
  return ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is SkillItem => Boolean(item));
}

export function participantLessonFeedbackHomeworkDone(
  feedback: Pick<ParticipantLessonFeedbackReadModel, 'participantId' | 'items'>
): boolean {
  return feedback.items.length > 0 && feedback.items.every((item) => item.completed);
}

function homeworkDoneForParticipant(ctx: AchievementEvaluationContext): boolean {
  return ctx.lessonFeedback.some(
    (feedback) =>
      feedback.participantId === ctx.participantId &&
      participantLessonFeedbackHomeworkDone(feedback)
  );
}

function homeworkDoneTimestamp(ctx: AchievementEvaluationContext): string | undefined {
  const timestamps = ctx.lessonFeedback
    .filter(
      (feedback) =>
        feedback.participantId === ctx.participantId &&
        participantLessonFeedbackHomeworkDone(feedback)
    )
    .map((feedback) => {
      if (feedback.updatedAt) {
        return new Date(
          feedback.updatedAt.seconds * 1000 + feedback.updatedAt.nanoseconds / 1_000_000
        ).toISOString();
      }
      if (feedback.lessonStartsAt) {
        return new Date(
          feedback.lessonStartsAt.seconds * 1000 +
            feedback.lessonStartsAt.nanoseconds / 1_000_000
        ).toISOString();
      }
      return undefined;
    })
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  return timestamps[0];
}

function hoursCompletedTimestamp(
  present: readonly ParticipantLessonStatsEvidence[],
  requiredHours: number
): string | undefined {
  let total = 0;
  for (const row of present) {
    total += participantLearningDurationHoursFromEvidence(row);
    if (total >= requiredHours) return isoFromEvidence(row);
  }
  return undefined;
}

export const isAchievementRuleMet = (
  definition: AchievementDefinition,
  ctx: AchievementEvaluationContext
): boolean => {
  const present = presentEvidenceForParticipant(ctx);
  const skillItems = ctx.skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const scores = ctx.progress.participantId === ctx.participantId ? ctx.progress.skillScores : {};
  const level = ctx.progress.participantId === ctx.participantId ? ctx.progress.level : 1;
  const rule = definition.rule;

  switch (rule.type) {
    case 'lessons_completed':
      return present.length >= (rule.count ?? 1);
    case 'hours_completed':
      return (
        present.reduce((sum, row) => sum + participantLearningDurationHoursFromEvidence(row), 0) >=
        (rule.count ?? 1)
      );
    case 'streak_weeks':
      return getTrainingStreakWeeksFromPresentEvidence(present, ctx.now) >= (rule.count ?? 1);
    case 'exercises_mastered':
      return countExercisesMastered(scores, skillItems) >= (rule.count ?? 1);
    case 'level_up':
      return level >= 2;
    case 'feedback_given':
      return ctx.accountReviews.length > 0;
    case 'homework_done':
      return homeworkDoneForParticipant(ctx);
    case 'course_graduate':
      // T32.9A.9C. Synthetic course_* Booking path is not an earning source.
      return false;
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
  const present = presentEvidenceForParticipant(ctx);
  switch (definition.rule.type) {
    case 'lessons_completed': {
      const index = Math.max(0, (definition.rule.count ?? 1) - 1);
      return present[index] ? isoFromEvidence(present[index]!) : undefined;
    }
    case 'hours_completed':
      return hoursCompletedTimestamp(present, definition.rule.count ?? 1);
    case 'streak_weeks':
      return findStreakWeeksTimestampFromPresentEvidence(
        present,
        definition.rule.count ?? 1,
        ctx.now
      );
    case 'exercises_mastered':
    case 'skill_items_max':
    case 'level_up':
      return ctx.progress.participantId === ctx.participantId
        ? present[0]
          ? isoFromEvidence(present[0])
          : undefined
        : undefined;
    case 'feedback_given':
      return [...ctx.accountReviews]
        .map((review) => review.createdAtIso)
        .sort((left, right) => left.localeCompare(right))[0];
    case 'homework_done':
      return homeworkDoneTimestamp(ctx);
    case 'course_graduate':
      return undefined;
    default:
      return undefined;
  }
};

export const evaluateEarnedAchievements = (
  ctx: AchievementEvaluationContext,
  config: AchievementsConfig
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
