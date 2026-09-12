import { useEffect, useRef } from 'react';
import type { ParticipantAchievementSource } from '@ski-academy/shared-domain';
import {
  achievementProductScope,
  evaluateEarnedAchievements,
  normalizeAchievementsConfig,
  participantAchievementSourceForRule,
  type AchievementEvaluationContext,
} from '../../domain/achievements';
import { logger } from '../../shared';
import { resolveLessonFeedbackCompletionCapability } from '../student-cabinet/useSelectedParticipantLessonFeedback';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';
import { recordManagedParticipantAchievements } from './participantAchievementsService';
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
  const generationRef = useRef(0);

  useEffect(() => {
    const participantId = input.selectedParticipantId;
    const evaluation = input.evaluation;
    if (!participantId || !evaluation || evaluation.participantId !== participantId) return;
    const authority = input.participants.find(
      (item) => item.participantId === participantId
    )?.authority;
    const capability = resolveLessonFeedbackCompletionCapability(authority);
    if (!capability) return;

    const config = normalizeAchievementsConfig(input.achievementsConfig);
    const evaluated = evaluateEarnedAchievements(evaluation, config);
    const already = new Set(Object.keys(persisted?.earned ?? {}));
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

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const store = useParticipantAchievementsStore.getState();
    store.setRecording(participantId, true);
    void recordManagedParticipantAchievements({
      accountId: input.accountId,
      participantId,
      expectedRevision: persisted?.revision ?? 0,
      earned,
      exercisedCapability: capability,
    })
      .catch((error) => {
        logger.warn('Failed to record participant achievements', error);
      })
      .finally(() => {
        if (generationRef.current === generation) {
          useParticipantAchievementsStore.getState().setRecording(participantId, false);
        }
      });
  }, [
    input.accountId,
    input.selectedParticipantId,
    input.participants,
    input.evaluation,
    input.achievementsConfig,
    persisted,
    recording,
  ]);
}
