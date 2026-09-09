import {
  isLessonBookingHot,
  timestampFromDate,
  type CanonicalTimestamp,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { queryLessonBookingReadModels } from '../../lib/canonical/canonicalReadModelClient';
import { parseBookingEndTime } from '../student-cabinet/components/student/studentBookingSchedule';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';
import { useLessonBookingStore } from './lessonBookingStore';
import { mergeLessonBookingRecords } from './lessonBookingViewModel';

export const ACCOUNT_LESSON_BOOKING_REFRESH_MS = 30_000;

let syncInFlight: Promise<void> | undefined;

/** Test-only reset for module-level sync coordination state. */
export function resetAccountLessonBookingSyncStateForTests(): void {
  syncInFlight = undefined;
}

export function isAccountLessonBookingBackgroundSyncAllowed(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function cabinetItemEndsAtTimestamp(item: LessonBookingCabinetItem): CanonicalTimestamp {
  const end = parseBookingEndTime(item.time, item.durationHours);
  const [year, month, day] = item.date.split('-').map(Number);
  const endDate = end
    ? new Date(year, month - 1, day, end.h, end.m, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 0);
  return timestampFromDate(endDate);
}

export function findStaleHotLessonBookingIds(
  items: ReadonlyMap<string, LessonBookingCabinetItem>,
  hotItems: readonly LessonBookingReadModel[],
  now = timestampFromDate(new Date())
): readonly string[] {
  const hotIds = new Set(hotItems.map((item) => String(item.bookingId)));
  const stale: string[] = [];

  for (const [bookingId, item] of items) {
    if (hotIds.has(bookingId)) {
      continue;
    }

    const isHot = isLessonBookingHot({
      lifecycleStatus: item.status,
      endsAt: cabinetItemEndsAtTimestamp(item),
      now,
    });
    if (isHot) {
      stale.push(bookingId);
    }
  }

  return stale;
}

export function applyAccountLessonBookingReadResults(input: {
  readonly hotItems: readonly LessonBookingReadModel[];
  readonly historyItems: readonly LessonBookingReadModel[];
  readonly reconcileHot?: boolean;
}): void {
  const state = useLessonBookingStore.getState();
  let merged = mergeLessonBookingRecords(state.items, input.hotItems);
  merged = mergeLessonBookingRecords(merged, input.historyItems);
  useLessonBookingStore.getState().mergeItems(merged);
  if (!input.reconcileHot) {
    return;
  }
  const staleIds = findStaleHotLessonBookingIds(
    useLessonBookingStore.getState().items,
    input.hotItems
  );
  if (staleIds.length > 0) {
    useLessonBookingStore.getState().removeItems(staleIds);
  }
}

export async function syncAccountLessonBookingsFromServer(): Promise<void> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const [hot, history] = await Promise.all([
        queryLessonBookingReadModels({ scope: 'account_hot' }),
        queryLessonBookingReadModels({ scope: 'account_history' }),
      ]);
      applyAccountLessonBookingReadResults({
        hotItems: hot.items,
        historyItems: history.items,
        reconcileHot: true,
      });
    } finally {
      syncInFlight = undefined;
    }
  })();

  return syncInFlight;
}
