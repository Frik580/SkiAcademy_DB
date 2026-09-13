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

/** Freshness TTL for account_hot — used for ensure/visibility gating, not polling. */
export const ACCOUNT_LESSON_BOOKING_FRESH_MS = ACCOUNT_LESSON_BOOKING_REFRESH_MS;

let syncInFlight: Promise<void> | undefined;
let hotSyncInFlight: Promise<void> | undefined;
const calendarMonthInFlight = new Map<string, Promise<void>>();

/** Test-only reset for module-level sync coordination state. */
export function resetAccountLessonBookingSyncStateForTests(): void {
  syncInFlight = undefined;
  hotSyncInFlight = undefined;
  calendarMonthInFlight.clear();
}

export function isAccountLessonBookingBackgroundSyncAllowed(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function isAccountLessonHotFresh(
  state: { readonly loaded: boolean; readonly hotLoadedAtMs?: number },
  nowMs = Date.now(),
  freshMs = ACCOUNT_LESSON_BOOKING_FRESH_MS
): boolean {
  return state.loaded && state.hotLoadedAtMs !== undefined && nowMs - state.hotLoadedAtMs < freshMs;
}

function markAccountHotApplied(): void {
  const store = useLessonBookingStore.getState();
  store.setLoaded(true);
  store.setHotLoadedAtMs(Date.now());
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
  readonly calendarItems?: readonly LessonBookingReadModel[];
  readonly reconcileHot?: boolean;
}): void {
  const state = useLessonBookingStore.getState();
  let merged = mergeLessonBookingRecords(state.items, input.hotItems);
  merged = mergeLessonBookingRecords(merged, input.historyItems);
  if (input.calendarItems && input.calendarItems.length > 0) {
    merged = mergeLessonBookingRecords(merged, input.calendarItems);
  }
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
      markAccountHotApplied();
    } finally {
      syncInFlight = undefined;
    }
  })();

  return syncInFlight;
}

/** Cheap background refresh that deliberately avoids the account history scan. */
export async function syncAccountHotLessonBookingsFromServer(): Promise<void> {
  if (hotSyncInFlight) {
    return hotSyncInFlight;
  }

  hotSyncInFlight = (async () => {
    try {
      const hot = await queryLessonBookingReadModels({ scope: 'account_hot' });
      applyAccountLessonBookingReadResults({
        hotItems: hot.items,
        historyItems: [],
        reconcileHot: true,
      });
      markAccountHotApplied();
    } finally {
      hotSyncInFlight = undefined;
    }
  })();

  return hotSyncInFlight;
}

function calendarMonthInFlightKey(accountId: string, monthKey: string): string {
  return `${accountId}:${monthKey}`;
}

export async function ensureAccountCalendarMonthLoaded(input: {
  readonly accountId: string;
  readonly monthKey: string;
  readonly rangeStart: CanonicalTimestamp;
  readonly rangeEnd: CanonicalTimestamp;
  readonly getCurrentAccountId?: () => string | undefined;
}): Promise<void> {
  const store = useLessonBookingStore.getState();
  if (store.calendarMonths.get(input.monthKey) === 'loaded') {
    return;
  }

  const inFlightKey = calendarMonthInFlightKey(input.accountId, input.monthKey);
  const existing = calendarMonthInFlight.get(inFlightKey);
  if (existing) {
    return existing;
  }

  store.setCalendarMonthStatus(input.monthKey, 'loading');
  store.setCalendarMonthError(undefined);

  const request = (async () => {
    try {
      const result = await queryLessonBookingReadModels({
        scope: 'account_calendar_month',
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
      });
      if (input.getCurrentAccountId && input.getCurrentAccountId() !== input.accountId) {
        return;
      }
      applyAccountLessonBookingReadResults({
        hotItems: [],
        historyItems: [],
        calendarItems: result.items,
      });
      useLessonBookingStore.getState().setCalendarMonthStatus(input.monthKey, 'loaded');
    } catch (error) {
      if (input.getCurrentAccountId && input.getCurrentAccountId() !== input.accountId) {
        return;
      }
      useLessonBookingStore.getState().clearCalendarMonthStatus(input.monthKey);
      useLessonBookingStore.getState().setCalendarMonthError({
        monthKey: input.monthKey,
        message: error instanceof Error ? error.message : 'Failed to load calendar month.',
      });
      throw error;
    } finally {
      calendarMonthInFlight.delete(inFlightKey);
    }
  })();

  calendarMonthInFlight.set(inFlightKey, request);
  return request;
}
