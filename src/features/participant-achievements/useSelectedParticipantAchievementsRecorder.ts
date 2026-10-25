import { useEffect } from 'react';
import type { ParticipantAchievementSource } from '@ski-academy/shared-domain';
import {
  achievementProductScope,
  evaluateEarnedAchievements,
  normalizeAchievementsConfig,
  participantAchievementSourceForRule,
  type AchievementEvaluationContext,
} from '../../domain/achievements';
import { resolveLessonFeedbackCompletionCapability } from '../student-cabinet/useSelectedParticipantLessonFeedback';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import {
  loadManagedParticipantAchievementsOnce,
  recordManagedParticipantAchievementsOnce,
} from './participantAchievementsService';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

export function useSelectedParticipantAchievementsRecorder(input: {
  readonly accountId: string;
  readonly selectedParticipantId: string | undefined;
  readonly participants: readonly ManagedParticipantOption[];
  readonly evaluation: AchievementEvaluationContext | undefined;
  readonly achievementsConfig: Parameters<typeof normalizeAchievementsConfig>[0];
}) {
  const persisted = useParticipantAchievementsStore((state) =>
    input.selectedParticipantId ? state.byId[input.selectedParticipantId] : undefined
  );
  const recording = useParticipantAchievementsStore((state) =>
    input.selectedParticipantId ? Boolean(state.recordingKeys[input.selectedParticipantId]) : false
  );
  const blocked = useParticipantAchievementsStore((state) =>
    input.selectedParticipantId ? state.blockedAchievements[input.selectedParticipantId] : undefined
  );

  useEffect(() => {
    const participantId = input.selectedParticipantId;
    const evaluation = input.evaluation;
    if (!participantId || !evaluation || evaluation.participantId !== participantId) return;
    const authority = input.participants.find(
      (item) => item.participantId === participantId
    )?.authority;
    const capability = resolveLessonFeedbackCompletionCapability(authority);
    if (!capability) return;
    if (!persisted) {
      void loadManagedParticipantAchievementsOnce(participantId);
      return;
    }

    const config = normalizeAchievementsConfig(input.achievementsConfig);
    const evaluated = evaluateEarnedAchievements(evaluation, config);
    const already = new Set([...Object.keys(persisted.earned), ...(blocked ?? [])]);
    const earned = evaluated.flatMap((item) => {
      const definition = config.items.find((entry) => entry.id === item.id);
      if (!definition) return [];
      if (achievementProductScope(definition) !== 'participant') return [];
      const source = participantAchievementSourceForRule(definition.rule.type);
      if (!source) return [];
      if (already.has(item.id)) return [];
      if (!item.earnedAt) return [];
      return [
        {
          achievementId: item.id,
          earnedAtIso: item.earnedAt,
          source: source as ParticipantAchievementSource,
        },
      ];
    });
    if (earned.length === 0) return;
    if (recording) return;

    void recordManagedParticipantAchievementsOnce({
      accountId: input.accountId,
      participantId,
      expectedRevision: persisted.revision,
      earned,
      exercisedCapability: capability,
    });
  }, [
    input.accountId,
    input.selectedParticipantId,
    input.participants,
    input.evaluation,
    input.achievementsConfig,
    persisted,
    recording,
    blocked,
  ]);
}
