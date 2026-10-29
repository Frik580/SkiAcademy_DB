import { useEffect } from 'react';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { useAccountParticipantLessonStatsStore } from '../lesson-bookings/accountParticipantLessonStatsStore';
import { useLessonBookingStore } from '../lesson-bookings/lessonBookingStore';
import { mergeLessonBookingRecords } from '../lesson-bookings/lessonBookingViewModel';

/**
 * The coach hub needs historical lessons for instructor discovery and chat actions.
 * account_hot alone cannot restore completed-only coaches after a hard reload.
 * Reuse the already-authorized, fully paged participant-stats read rather than
 * requesting account_history again or granting new access.
 */
export function hydrateCoachLessonHistory(input: {
  readonly accountId: string | undefined;
  readonly statsAccountId: string | undefined;
  readonly loaded: boolean;
  readonly items: readonly LessonBookingReadModel[];
}): boolean {
  if (!input.accountId || input.statsAccountId !== input.accountId || !input.loaded) {
    return false;
  }

  // Keep the canonical booking store as the single authority for opening chat /
  // lesson modals. mergeItems preserves newer hot revisions and existing rows.
  const history = mergeLessonBookingRecords(new Map(), input.items);
  useLessonBookingStore.getState().mergeItems(history);
  return true;
}

export function useCoachLessonHistoryHydration(enabled: boolean, accountId: string): void {
  const statsAccountId = useAccountParticipantLessonStatsStore((state) => state.accountId);
  const loaded = useAccountParticipantLessonStatsStore((state) => state.loaded);
  const items = useAccountParticipantLessonStatsStore((state) => state.items);

  useEffect(() => {
    if (!enabled) return;
    hydrateCoachLessonHistory({ accountId, statsAccountId, loaded, items });
  }, [enabled, accountId, statsAccountId, loaded, items]);
}
