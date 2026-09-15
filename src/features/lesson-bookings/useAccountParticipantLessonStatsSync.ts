import { useEffect } from 'react';
import { useAccountParticipantLessonStatsStore } from './accountParticipantLessonStatsStore';
import { syncAccountParticipantLessonStatsFromServer } from './syncAccountParticipantLessonStats';

/**
 * Freshness TTL for the participant lesson-stats drain.
 *
 * Own constant on purpose: this drains the full logical history and must not
 * be coupled to the much cheaper account_hot freshness window
 * (`ACCOUNT_LESSON_BOOKING_FRESH_MS` in `syncAccountLessonBookings`).
 */
export const ACCOUNT_PARTICIPANT_LESSON_STATS_FRESH_MS = 30_000;

export function useAccountParticipantLessonStatsSync(
  enabled: boolean,
  accountId: string | undefined
) {
  useEffect(() => {
    if (!accountId) {
      useAccountParticipantLessonStatsStore.getState().reset();
      return;
    }
    if (!enabled) return;
    const state = useAccountParticipantLessonStatsStore.getState();
    const isFresh =
      state.accountId === accountId &&
      state.loaded &&
      state.lastLoadedAtMs !== undefined &&
      Date.now() - state.lastLoadedAtMs < ACCOUNT_PARTICIPANT_LESSON_STATS_FRESH_MS;
    if (isFresh) return;
    void syncAccountParticipantLessonStatsFromServer(accountId);
  }, [accountId, enabled]);
}
