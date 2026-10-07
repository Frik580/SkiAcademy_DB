import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onSnapshot } from '../../src/infrastructure/firebase';
import { useSettingsSync } from '../../src/features/settings/sync/useSettingsSync';
import { useSettingsStore } from '../../src/features/settings/settingsStore';
import { DEFAULT_STUDENT_DASHBOARD_LAYOUT } from '../../src/features/settings/studentDashboardLayout';

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
  useSettingsStore.getState().setStudentDashboardLayout(undefined);
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
});
