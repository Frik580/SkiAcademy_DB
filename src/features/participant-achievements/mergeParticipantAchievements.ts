import type { ParticipantLessonFeedbackReadModel } from '@ski-academy/shared-domain';
import {
  achievementProductScope,
  formatAchievementLabel,
  pickAchievementTimestamp,
  type AchievementEvaluationContext,
  type AchievementsConfig,
  type EvaluatedAchievement,
  type SkillConfig,
} from '../../domain/achievements';
import type { Review } from '../../types';

function isoFromCanonical(seconds: number, nanoseconds: number): string {
  return new Date(seconds * 1000 + nanoseconds / 1_000_000).toISOString();
}

export function accountReviewsFromLegacy(reviews: readonly Review[]): {
  createdAtIso: string;
}[] {
  return reviews.map((review) => ({
    createdAtIso: review.date.includes('T') ? review.date : `${review.date}T12:00:00.000Z`,
  }));
}

export function mergeEvaluatedAndPersistedAchievements(input: {
  readonly evaluated: readonly EvaluatedAchievement[];
  readonly persistedEarned: Readonly<
    Record<string, { earnedAt: { seconds: number; nanoseconds: number } }>
  >;
  readonly config: AchievementsConfig;
}): EvaluatedAchievement[] {
  const byId = new Map<string, EvaluatedAchievement>();
  for (const item of input.evaluated) {
    const definition = input.config.items.find((entry) => entry.id === item.id);
    if (definition && achievementProductScope(definition) === 'course') continue;
    byId.set(item.id, item);
  }
  for (const definition of input.config.items) {
    if (achievementProductScope(definition) !== 'participant') continue;
    const persisted = input.persistedEarned[definition.id];
    if (!persisted) continue;
    const current = byId.get(definition.id);
    const persistedIso = isoFromCanonical(
      persisted.earnedAt.seconds,
      persisted.earnedAt.nanoseconds
    );
    byId.set(definition.id, {
      id: definition.id,
      icon: definition.icon,
      labelRu: definition.labelRu,
      labelEn: definition.labelEn,
      earnedAt: pickAchievementTimestamp(persistedIso, current?.earnedAt),
      order: definition.order,
    });
  }
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

export function buildCanonicalAchievementEvaluation(input: {
  readonly participantId: string;
  readonly lessonEvidence: AchievementEvaluationContext['lessonEvidence'];
  readonly progress: AchievementEvaluationContext['progress'];
  readonly lessonFeedback: readonly ParticipantLessonFeedbackReadModel[];
  readonly accountReviews: AchievementEvaluationContext['accountReviews'];
  readonly skillConfig?: SkillConfig;
  readonly now?: Date;
}): AchievementEvaluationContext {
  return {
    participantId: input.participantId,
    lessonEvidence: input.lessonEvidence,
    progress: input.progress,
    lessonFeedback: input.lessonFeedback.filter(
      (item) => item.participantId === input.participantId
    ),
    accountReviews: input.accountReviews,
    skillConfig: input.skillConfig,
    now: input.now,
  };
}

export function formatMergedAchievements(
  items: readonly EvaluatedAchievement[],
  language: 'en' | 'ru',
  config: AchievementsConfig
) {
  return items
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      label: formatAchievementLabel(item.id, language, config, {
        achievementLabelRu: item.labelRu,
        achievementLabelEn: item.labelEn,
      }),
      earnedAt: item.earnedAt,
    }))
    .sort((left, right) => (right.earnedAt ?? '').localeCompare(left.earnedAt ?? ''));
}
