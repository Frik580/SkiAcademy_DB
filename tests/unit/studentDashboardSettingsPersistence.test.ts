import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStudentDashboardLayout } from '../../src/features/settings/settingsService';
import { useSettingsStore } from '../../src/features/settings/settingsStore';
import { auth, setDoc } from '../../src/infrastructure/firebase';
import { serverTimestamp } from 'firebase/firestore';
import {
  normalizeStudentDashboardLayout,
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
} from '../../src/features/settings/studentDashboardLayout';

vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin_test' } },
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  setDoc: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(setDoc).mockReset().mockResolvedValue(undefined);
  Object.assign(auth, { currentUser: { uid: 'admin_test' } });
  useSettingsStore.getState().setStudentDashboardLayout(undefined);
});

describe('dashboard settings persistence', () => {
  it('saves an old normalized config without Journey and without a migration write', async () => {
    useSettingsStore.getState().setStudentDashboardLayout({
      version: 1,
      order: ['masteryPath', 'weather', 'countdown'],
      tiles: { masteryPath: { desktopSize: 'small' }, weather: { desktopSize: 'large' } },
    });
    expect(setDoc).not.toHaveBeenCalled();
    await useSettingsStore
      .getState()
      .handleUpdateStudentDashboardLayout(useSettingsStore.getState().studentDashboardLayout);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const written = vi.mocked(setDoc).mock.calls[0][1];
    expect(written.order).not.toContain('masteryPath');
    expect(written).not.toHaveProperty('tiles');
    expect(written.order).toHaveLength(10);
  });
  it('writes order and audit fields to existing settings collection', async () => {
    const layout = normalizeStudentDashboardLayout({
      version: 1,
      order: ['weather'],
      tiles: { weather: { desktopSize: 'large' } },
    });
    await expect(saveStudentDashboardLayout(layout)).resolves.toEqual(layout);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith('settings/student_dashboard_layout', {
      ...layout,
      updatedBy: 'admin_test',
      updatedAt: serverTimestamp(),
    });
  });
  it('persists only order, discarding runtime placement fields', async () => {
    const config = normalizeStudentDashboardLayout({
      version: 1,
      tiles: { weather: { desktopSize: 'small', allowAutoGrow: false } },
    });
    Object.assign(config, { tiles: { weather: { effectiveSize: 'medium', row: 1, column: 1 } } });
    await saveStudentDashboardLayout(config);
    const written = vi.mocked(setDoc).mock.calls[0][1];
    expect(written).not.toHaveProperty('tiles');
    expect(written).not.toHaveProperty('rows');
  });
  it('rejects malformed drafts before any write', async () => {
    await expect(
      saveStudentDashboardLayout({ ...DEFAULT_STUDENT_DASHBOARD_LAYOUT, order: ['weather'] })
    ).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('rejects signed-out writes', async () => {
    Object.assign(auth, { currentUser: null });
    await expect(saveStudentDashboardLayout(DEFAULT_STUDENT_DASHBOARD_LAYOUT)).rejects.toThrow(
      'Authentication required'
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('changes store only after an acknowledged save and preserves saved config on failure', async () => {
    const layout = normalizeStudentDashboardLayout({ version: 1, order: ['weather'] });
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(
      useSettingsStore.getState().handleUpdateStudentDashboardLayout(layout)
    ).rejects.toThrow('permission-denied');
    expect(useSettingsStore.getState().studentDashboardLayout).toEqual(
      DEFAULT_STUDENT_DASHBOARD_LAYOUT
    );
    await useSettingsStore.getState().handleUpdateStudentDashboardLayout(layout);
    expect(useSettingsStore.getState().studentDashboardLayout).toEqual(layout);
  });
});
