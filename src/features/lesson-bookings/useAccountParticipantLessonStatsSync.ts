import { useEffect } from 'react';
import { ACCOUNT_LESSON_BOOKING_REFRESH_MS } from './syncAccountLessonBookings';
import { useAccountParticipantLessonStatsStore } from './accountParticipantLessonStatsStore';
import { syncAccountParticipantLessonStatsFromServer } from './syncAccountParticipantLessonStats';

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
      Date.now() - state.lastLoadedAtMs < ACCOUNT_LESSON_BOOKING_REFRESH_MS;
    if (isFresh) return;
    void syncAccountParticipantLessonStatsFromServer(accountId);
  }, [accountId, enabled]);
}
