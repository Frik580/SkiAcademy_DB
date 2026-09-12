import { useMemo } from 'react';
import {
  aggregateParticipantLessonStats,
  evidenceListFromAccountReadModels,
  selectLatestParticipantAttendedEvidenceForInstructor,
  type InstructorId,
  type ParticipantId,
  type ParticipantLessonStatsEvidence,
  type ParticipantLessonStatsTotals,
} from '@ski-academy/shared-domain';
import { useAccountParticipantLessonStatsStore } from '../lesson-bookings/accountParticipantLessonStatsStore';

export function useSelectedParticipantLessonStats(selectedParticipantId: string | undefined): {
  readonly evidence: readonly ParticipantLessonStatsEvidence[];
  readonly lifetime: ParticipantLessonStatsTotals;
  readonly season: ParticipantLessonStatsTotals;
  readonly seasonYear: number;
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
} {
  const items = useAccountParticipantLessonStatsStore((state) => state.items);
  const loading = useAccountParticipantLessonStatsStore((state) => state.loading);
  const loaded = useAccountParticipantLessonStatsStore((state) => state.loaded);
  const error = useAccountParticipantLessonStatsStore((state) => state.error);
  const seasonYear = new Date().getFullYear();

  const evidence = useMemo(() => {
    if (!selectedParticipantId) return [];
    return evidenceListFromAccountReadModels(
      items,
      selectedParticipantId as ParticipantId
    );
  }, [items, selectedParticipantId]);

  const lifetime = useMemo(() => aggregateParticipantLessonStats(evidence), [evidence]);
  const season = useMemo(
    () => aggregateParticipantLessonStats(evidence, { calendarYear: seasonYear }),
    [evidence, seasonYear]
  );

  return { evidence, lifetime, season, seasonYear, loading, loaded, error };
}

export function instructorLessonCountFromEvidence(
  evidence: readonly ParticipantLessonStatsEvidence[],
  instructorId: string
): number {
  return aggregateParticipantLessonStats(evidence, {
    instructorId: instructorId as InstructorId,
  }).completedCount;
}

export function latestAttendedLessonForInstructor(
  evidence: readonly ParticipantLessonStatsEvidence[],
  instructorId: string
) {
  return selectLatestParticipantAttendedEvidenceForInstructor(
    evidence,
    instructorId as InstructorId
  );
}
