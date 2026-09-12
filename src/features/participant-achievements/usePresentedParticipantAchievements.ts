import { useMemo } from 'react';
import { evidenceListFromAccountReadModels, type ParticipantId } from '@ski-academy/shared-domain';
import {
  evaluateEarnedAchievements,
  normalizeAchievementsConfig,
  type AchievementEvaluationContext,
  type AchievementsConfig,
  type SkillConfig,
} from '../../domain/achievements';
import { useAccountParticipantLessonStatsStore } from '../lesson-bookings/accountParticipantLessonStatsStore';
import {
  emptyParticipantProgressView,
  useParticipantProgressStore,
} from '../participant-progress';
import { useParticipantLessonFeedbackStore } from '../participant-lesson-feedback/participantLessonFeedbackStore';
import { isTimestampOnLocalDate } from '../student-cabinet/components/student/studentCabinetPresentation';
import { useSettingsStore } from '../settings/settingsStore';
import {
  buildCanonicalAchievementEvaluation,
  formatMergedAchievements,
  mergeEvaluatedAndPersistedAchievements,
} from './mergeParticipantAchievements';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

const formatActivityTimestamp = (timestamp: string, language: 'en' | 'ru') => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  });
};

export function usePresentedParticipantAchievements(input: {
  readonly selectedParticipantId: string | undefined;
  readonly language: 'en' | 'ru';
  readonly accountReviews: AchievementEvaluationContext['accountReviews'];
  readonly achievementsConfig?: AchievementsConfig;
  readonly skillConfig?: SkillConfig;
}): {
  readonly evaluation: AchievementEvaluationContext | undefined;
  readonly achievements: Array<{
    id: string;
    icon: string;
    label: string;
    earnedAt?: string;
    earnedAtLabel?: string;
  }>;
  readonly todayAchievements: Array<{
    id: string;
    icon: string;
    label: string;
    earnedAt?: string;
    earnedAtLabel?: string;
  }>;
  readonly sourcesReady: boolean;
} {
  const selectedParticipantId = input.selectedParticipantId;
  const statsItems = useAccountParticipantLessonStatsStore((state) => state.items);
  const statsLoaded = useAccountParticipantLessonStatsStore((state) => state.loaded);
  const progressById = useParticipantProgressStore((state) => state.byId);
  const progressLoaded = useParticipantProgressStore((state) => state.loaded);
  const feedbackBucket = useParticipantLessonFeedbackStore((state) =>
    selectedParticipantId ? state.byParticipantId[selectedParticipantId] : undefined
  );
  const persisted = useParticipantAchievementsStore((state) =>
    selectedParticipantId ? state.byId[selectedParticipantId] : undefined
  );
  const settingsAchievementsConfig = useSettingsStore((state) => state.achievementsConfig);
  const settingsSkillConfig = useSettingsStore((state) => state.skillConfig);
  const config = normalizeAchievementsConfig(
    input.achievementsConfig ?? settingsAchievementsConfig
  );
  const skillConfig = input.skillConfig ?? settingsSkillConfig;

  const lessonEvidence = useMemo(() => {
    if (!selectedParticipantId) return [];
    return evidenceListFromAccountReadModels(statsItems, selectedParticipantId as ParticipantId);
  }, [statsItems, selectedParticipantId]);

  const progress = useMemo(() => {
    if (!selectedParticipantId) {
      return emptyParticipantProgressView('unselected');
    }
    const cached = progressById[selectedParticipantId];
    if (cached && cached.participantId === selectedParticipantId) return cached;
    return emptyParticipantProgressView(selectedParticipantId);
  }, [progressById, selectedParticipantId]);

  const lessonFeedback = useMemo(() => {
    if (!selectedParticipantId) return [];
    if (!feedbackBucket || feedbackBucket.participantId !== selectedParticipantId) return [];
    return feedbackBucket.items.filter((item) => item.participantId === selectedParticipantId);
  }, [feedbackBucket, selectedParticipantId]);

  const sourcesReady = Boolean(selectedParticipantId && statsLoaded && progressLoaded);

  const evaluation = useMemo(() => {
    if (!selectedParticipantId || !sourcesReady) return undefined;
    return buildCanonicalAchievementEvaluation({
      participantId: selectedParticipantId,
      lessonEvidence,
      progress: {
        participantId: progress.participantId,
        level: progress.level,
        skillScores: progress.skillScores,
      },
      lessonFeedback,
      accountReviews: input.accountReviews,
      skillConfig,
    });
  }, [
    selectedParticipantId,
    sourcesReady,
    lessonEvidence,
    progress,
    lessonFeedback,
    input.accountReviews,
    skillConfig,
  ]);

  const achievements = useMemo(() => {
    if (!selectedParticipantId) return [];
    const evaluated = evaluation ? evaluateEarnedAchievements(evaluation, config) : [];
    const merged = mergeEvaluatedAndPersistedAchievements({
      evaluated,
      persistedEarned:
        persisted && persisted.participantId === selectedParticipantId ? persisted.earned : {},
      config,
    });
    return formatMergedAchievements(merged, input.language, config).map((item) => ({
      ...item,
      earnedAtLabel: item.earnedAt
        ? formatActivityTimestamp(item.earnedAt, input.language)
        : undefined,
    }));
  }, [selectedParticipantId, evaluation, persisted, config, input.language]);

  const todayAchievements = useMemo(
    () => achievements.filter((item) => item.earnedAt && isTimestampOnLocalDate(item.earnedAt)),
    [achievements]
  );

  return { evaluation, achievements, todayAchievements, sourcesReady };
}
