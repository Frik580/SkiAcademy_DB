import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminStudentDashboardSettings } from '../../src/features/admin/components/settings/AdminStudentDashboardSettings';
import { useSettingsStore } from '../../src/features/settings/settingsStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { DEFAULT_STUDENT_DASHBOARD_LAYOUT } from '../../src/features/settings/studentDashboardLayout';
import type { UserProfile } from '../../src/types';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru', t: (key: string) => key }),
}));
vi.mock('../../src/features/admin/components/settings/AdminCollapsibleSection', () => ({
  AdminCollapsibleSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
const save = vi.fn();
const keys = (element: HTMLElement, attribute: string) =>
  [...element.querySelectorAll(`[${attribute}]`)].map((item) => item.getAttribute(attribute));
beforeEach(() => {
  save.mockReset().mockImplementation(async (config) => {
    useSettingsStore.getState().setStudentDashboardLayout(config);
  });
  useSettingsStore.setState({
    studentDashboardLayout: DEFAULT_STUDENT_DASHBOARD_LAYOUT,
    handleUpdateStudentDashboardLayout: save,
  });
  useProfileStore.setState({ userProfile: { uid: 'admin', role: 'admin' } as UserProfile });
});
afterEach(cleanup);

describe('admin student dashboard settings', () => {
  it('exposes two fixed groups and preview without size or grow controls', () => {
    const { container } = render(<AdminStudentDashboardSettings />);
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(container.querySelector('[data-preview-column="left"]')).toHaveClass('col-span-1');
    expect(container.querySelector('[data-preview-column="right"]')).toHaveClass('col-span-2');
    expect(
      screen.getByRole('button', { name: 'Переместить «Задачи на сегодня» выше' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Переместить «Погода» ниже' })).toBeDisabled();
  });
  it('reorders both groups, previews and persists only order', async () => {
    const { container } = render(<AdminStudentDashboardSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Переместить «Погода» выше' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Переместить «Достижения за сегодня» выше' })
    );
    expect(
      keys(container.querySelector('[data-preview-column="left"]')!, 'data-preview-tile').at(-2)
    ).toBe('weather');
    expect(
      keys(container.querySelector('[data-preview-column="right"]')!, 'data-preview-tile')
    ).toEqual(['todayTasks', 'todayAchievements', 'nextSession']);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(Object.keys(save.mock.calls[0][0]).sort()).toEqual(['order', 'version']);
    expect(screen.getByRole('status')).toHaveTextContent('Раскладка сохранена.');
  });
  it('supports same-column drag and rejects cross-column drop', () => {
    const { container } = render(<AdminStudentDashboardSettings />);
    const drag = () =>
      fireEvent.dragStart(screen.getByRole('button', { name: 'Перетащить «Погода»' }), {
        dataTransfer: { setData: vi.fn() },
      });
    drag();
    fireEvent.drop(container.querySelector('[data-layout-setting="todayTasks"]')!);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    drag();
    fireEvent.drop(container.querySelector('[data-layout-setting="currentSessions"]')!);
    expect(
      keys(container.querySelector('[data-preview-column="left"]')!, 'data-preview-tile')[0]
    ).toBe('weather');
  });
  it('preserves failed draft and supports cancel/reset', async () => {
    useSettingsStore.getState().setStudentDashboardLayout({ version: 1, order: ['weather'] });
    const { container } = render(<AdminStudentDashboardSettings />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Восстановить стандартную раскладку' })
    );
    save.mockRejectedValueOnce(new Error('denied'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      keys(container.querySelector('[data-preview-column="left"]')!, 'data-preview-tile')[0]
    ).toBe('currentSessions');
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    expect(
      keys(container.querySelector('[data-preview-column="left"]')!, 'data-preview-tile')[0]
    ).toBe('weather');
  });
  it.each(['user', 'instructor'])('hides editor from %s', (role) => {
    useProfileStore.setState({ userProfile: { uid: 'other', role } as UserProfile });
    expect(render(<AdminStudentDashboardSettings />).container).toBeEmptyDOMElement();
  });
  it('blocks duplicate save and edits while saving', async () => {
    let complete!: () => void;
    save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    render(<AdminStudentDashboardSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Переместить «Погода» выше' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('button', { name: 'Переместить «Погода» выше' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранение…' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => complete());
  });
});
