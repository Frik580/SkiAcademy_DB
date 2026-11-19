import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onSnapshot } from '../../src/infrastructure/firebase';
import { useSettingsSync } from '../../src/features/settings/sync/useSettingsSync';
import { retrySecondarySetting, useSettingsStore } from '../../src/features/settings/settingsStore';
import { DEFAULT_STUDENT_DASHBOARD_LAYOUT } from '../../src/features/settings/studentDashboardLayout';
import { DEFAULT_ACHIEVEMENTS_CONFIG, DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../src/domain/notifications';
import { DEFAULT_STARTER_CREDIT_KZT } from '../../src/domain/wallet';

vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(onSnapshot).mockClear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('student dashboard config sync', () => {
  it('uses one shared document listener, keeps initial defaults, normalizes updates and unsubscribes', () => {
    const view = renderHook(useSettingsSync);
    expect(useSettingsStore.getState().studentDashboardLayout).toEqual(
      DEFAULT_STUDENT_DASHBOARD_LAYOUT
    );
    act(() => vi.runOnlyPendingTimers());
    const calls = vi
      .mocked(onSnapshot)
      .mock.calls.filter((call) => String(call[0]) === 'settings/student_dashboard_layout');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ includeMetadataChanges: true });
    const next = calls[0][2] as (snapshot: unknown) => void;
    act(() =>
      next({
        exists: () => true,
        data: () => ({
          version: 1,
          order: ['weather', 'weather', 'unknown'],
          tiles: { weather: { desktopSize: 'full' } },
        }),
        metadata: { hasPendingWrites: false },
      })
    );
    expect(useSettingsStore.getState().studentDashboardLayout.order[0]).toBe('weather');
    expect(useSettingsStore.getState().studentDashboardLayout).not.toHaveProperty('tiles');
    act(() =>
      next({
        exists: () => true,
        data: () => ({ version: 1, order: ['countdown'] }),
        metadata: { hasPendingWrites: true },
      })
    );
    expect(useSettingsStore.getState().studentDashboardLayout.order[0]).toBe('weather');
    act(() => next({ exists: () => false, metadata: { hasPendingWrites: false } }));
    expect(useSettingsStore.getState().studentDashboardLayout).toEqual(
      DEFAULT_STUDENT_DASHBOARD_LAYOUT
    );
    const index = vi
      .mocked(onSnapshot)
      .mock.calls.findIndex((call) => String(call[0]) === 'settings/student_dashboard_layout');
    const unsubscribe = vi.mocked(onSnapshot).mock.results[index].value;
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not start an idle listener after cleanup', () => {
    const view = renderHook(useSettingsSync);
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(
      vi
        .mocked(onSnapshot)
        .mock.calls.some((call) => String(call[0]) === 'settings/student_dashboard_layout')
    ).toBe(false);
  });

  it.each([
    [
      'student_dashboard_layout',
      'studentDashboardLayout',
      { version: 1, order: ['weather'] },
      DEFAULT_STUDENT_DASHBOARD_LAYOUT,
    ],
    [
      'notification_retention',
      'notificationRetentionDays',
      { days: DEFAULT_NOTIFICATION_RETENTION_DAYS + 1 },
      DEFAULT_NOTIFICATION_RETENTION_DAYS,
    ],
    ['starter_credit', 'starterCreditKzt', { amountKzt: 3000 }, DEFAULT_STARTER_CREDIT_KZT],
    ['skill_config', 'skillConfig', { passPercentage: 86 }, DEFAULT_SKILL_CONFIG],
    ['achievements_config', 'achievementsConfig', { items: [] }, DEFAULT_ACHIEVEMENTS_CONFIG],
  ] as const)('tracks %s and retries only its own listener', (id, key, data, fallback) => {
    const view = renderHook(useSettingsSync);
    const read = () => useSettingsStore.getState().secondaryReads[key];
    const calls = () => vi.mocked(onSnapshot).mock.calls;
    expect(read()).toEqual({ status: 'loading', confirmed: false });
    expect(calls()).toHaveLength(2);
    act(() => vi.runOnlyPendingTimers());
    expect(calls()).toHaveLength(7);
    const index = calls().findIndex((call) => String(call[0]) === `settings/${id}`);
    expect(index).toBeGreaterThanOrEqual(2);
    const listener = (at: number) => ({
      next: calls()[at][2] as (snapshot: unknown) => void,
      fail: calls()[at][3] as (error: Error) => void,
      unsubscribe: vi.mocked(onSnapshot).mock.results[at].value,
    });
    const remote = (
      value: unknown,
      metadata: { fromCache?: boolean; hasPendingWrites?: boolean } = {}
    ) => ({
      exists: () => value !== undefined,
      data: () => value,
      metadata,
    });
    const old = listener(index);
    act(() => old.next(remote(undefined, { fromCache: true })));
    act(() => old.next(remote(data, { hasPendingWrites: true })));
    expect(read()).toEqual({ status: 'loading', confirmed: false });
    act(() => old.fail(new Error('permission denied')));
    expect(read()).toEqual({ status: 'error', confirmed: false });
    act(() => retrySecondarySetting(key));
    expect(read()).toEqual({ status: 'loading', confirmed: false });
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    const current = listener(7);
    act(() => current.next(remote(data)));
    expect(read()).toEqual({ status: 'ready', confirmed: true });
    const confirmed = useSettingsStore.getState()[key];
    expect(confirmed).not.toEqual(fallback);
    act(() => current.fail(new Error('unavailable')));
    expect(read()).toEqual({ status: 'error', confirmed: true });
    expect(useSettingsStore.getState()[key]).toBe(confirmed);

    act(() => {
      retrySecondarySetting(key);
      retrySecondarySetting(key);
    });
    expect(read()).toEqual({ status: 'refreshing', confirmed: true });
    expect(useSettingsStore.getState()[key]).toBe(confirmed);
    expect(calls()).toHaveLength(9);
    expect(
      calls()
        .slice(7)
        .map((call) => String(call[0]))
    ).toEqual([`settings/${id}`, `settings/${id}`]);
    expect(current.unsubscribe).toHaveBeenCalledOnce();
    act(() => current.next(remote(undefined)));
    expect(useSettingsStore.getState()[key]).toBe(confirmed);
    const replacement = listener(8);
    act(() => replacement.next(remote(data)));
    expect(read()).toEqual({ status: 'ready', confirmed: true });
    expect(useSettingsStore.getState()[key]).toBe(confirmed);
    act(() => replacement.next(remote(undefined)));
    expect(read()).toEqual({ status: 'empty', confirmed: true });
    expect(useSettingsStore.getState()[key]).toEqual(fallback);

    view.unmount();
    expect(replacement.unsubscribe).toHaveBeenCalledOnce();
    act(() => replacement.next(remote(data)));
    expect(read()).toEqual({ status: 'empty', confirmed: true });
    expect(
      vi.mocked(onSnapshot).mock.results.every(({ value }) => value.mock.calls.length === 1)
    ).toBe(true);
  });
});
