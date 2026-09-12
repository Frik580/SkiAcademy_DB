import {
  drainPagedReadModelItems,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { useAccountParticipantLessonStatsStore } from './accountParticipantLessonStatsStore';

let drainInFlight: Promise<void> | undefined;
let drainGeneration = 0;
let drainAccountId: string | undefined;

/** Test-only reset for module-level drain coordination. */
export function resetAccountParticipantLessonStatsSyncStateForTests(): void {
  drainInFlight = undefined;
  drainGeneration = 0;
  drainAccountId = undefined;
}

export async function drainAccountLessonBookingStatsPages(): Promise<
  readonly LessonBookingReadModel[]
> {
  const [hotItems, historyItems] = await Promise.all([
    drainPagedReadModelItems({
      fetchPage: (cursor) =>
        queryLessonBookingReadModels({
          scope: 'account_hot',
          ...(cursor ? { cursor } : {}),
        }),
    }),
    drainPagedReadModelItems({
      fetchPage: (cursor) =>
        queryLessonBookingReadModels({
          scope: 'account_history',
          ...(cursor ? { cursor } : {}),
        }),
    }),
  ]);
  return [...hotItems, ...historyItems];
}

export async function syncAccountParticipantLessonStatsFromServer(
  accountId: string
): Promise<void> {
  if (drainInFlight && drainAccountId === accountId) {
    return drainInFlight;
  }

  const generation = drainGeneration + 1;
  drainGeneration = generation;
  drainAccountId = accountId;
  useAccountParticipantLessonStatsStore.getState().setLoading({ accountId, generation });

  drainInFlight = (async () => {
    try {
      const items = await drainAccountLessonBookingStatsPages();
      useAccountParticipantLessonStatsStore.getState().replaceItems({
        accountId,
        generation,
        items,
      });
    } catch (error) {
      useAccountParticipantLessonStatsStore.getState().setError({
        accountId,
        generation,
        error: error instanceof Error ? error.message : 'Failed to load lesson statistics.',
      });
    } finally {
      if (drainAccountId === accountId && drainGeneration === generation) {
        drainInFlight = undefined;
      }
    }
  })();

  return drainInFlight;
}
