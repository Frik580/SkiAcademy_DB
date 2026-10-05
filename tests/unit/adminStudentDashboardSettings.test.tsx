import { mkdirSync, writeFileSync } from 'node:fs';
import { compactStudentDashboardLanes } from '../../src/features/settings/studentDashboardVerticalLayout';
import { resolveStudentDashboardDesktopLayout } from '../../src/features/settings/studentDashboardDesktopLayout';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminStudentDashboardSettings } from '../../src/features/admin/components/settings/AdminStudentDashboardSettings';
import { useSettingsStore } from '../../src/features/settings/settingsStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import {
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  normalizeStudentDashboardLayout,
  STUDENT_DASHBOARD_TILE_REGISTRY,
} from '../../src/features/settings/studentDashboardLayout';
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
const resolvedKeys = (layout = DEFAULT_STUDENT_DASHBOARD_LAYOUT) =>
  compactStudentDashboardLanes(
    resolveStudentDashboardDesktopLayout(layout, layout.order),
    Object.fromEntries(layout.order.map((key, index) => [key, 110 + (index % 3) * 32]))
  ).placements.map((tile) => tile.key);
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
  it('never exposes Journey controls or preview for old configs, including after Reset and Save', async () => {
    useSettingsStore.getState().setStudentDashboardLayout({
      version: 1,
      order: ['masteryPath', 'weather', 'currentSessions'],
      tiles: { masteryPath: { desktopSize: 'small' }, weather: { desktopSize: 'full' } },
    });
    const { container } = render(<AdminStudentDashboardSettings />);
    expect(screen.getAllByRole('combobox')).toHaveLength(10);
    expect(screen.queryByText('Путь к мастерству')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Базовый размер: Путь к мастерству' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Путь к мастерству/ })).not.toBeInTheDocument();
    expect(container.querySelector('[data-layout-setting="masteryPath"]')).toBeNull();
    expect(container.querySelector('[data-preview-tile="masteryPath"]')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Восстановить стандартную раскладку' }));
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')).toEqual(
      resolvedKeys()
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].order).not.toContain('masteryPath');
    expect(save.mock.calls[0][0].tiles).not.toHaveProperty('masteryPath');
  });
  it('lists all tiles and preview; boundary move controls are disabled', () => {
    render(<AdminStudentDashboardSettings />);
    expect(screen.getAllByRole('combobox')).toHaveLength(STUDENT_DASHBOARD_TILE_REGISTRY.length);
    if (process.env.STUDENT_DASHBOARD_LANE_DIR) {
      mkdirSync(process.env.STUDENT_DASHBOARD_LANE_DIR, { recursive: true });
      writeFileSync(
        process.env.STUDENT_DASHBOARD_LANE_DIR + '/preview.html',
        screen.getByTestId('dashboard-layout-preview').outerHTML
      );
    }
    expect(screen.getByRole('button', { name: 'Переместить «Сейчас идут» выше' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Переместить «Погода» ниже' })).toBeDisabled();
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')).toEqual(
      resolvedKeys()
    );
  });
  it('moves up/down and previews local order without saving', async () => {
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Переместить «Погода» выше' }));
    const order = keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile');
    expect(order.at(-2)).toBe('weather');
    await user.click(screen.getByRole('button', { name: 'Переместить «Погода» ниже' }));
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')).toEqual(
      resolvedKeys()
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('drag handle reorders draft and preview', () => {
    const { container } = render(<AdminStudentDashboardSettings />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByRole('button', { name: 'Перетащить «Погода»' }), {
      dataTransfer,
    });
    fireEvent.dragOver(container.querySelector('[data-layout-setting="currentSessions"]')!);
    fireEvent.drop(container.querySelector('[data-layout-setting="currentSessions"]')!);
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')[0]).toBe(
      'weather'
    );
    expect(keys(screen.getByRole('list'), 'data-layout-setting')[0]).toBe('weather');
    expect(save).not.toHaveBeenCalled();
  });
  it('previews size and saves order plus sizes only on Save', async () => {
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Базовый размер: Погода' }),
      'full'
    );
    expect(
      screen.getByTestId('dashboard-layout-preview').querySelector('[data-preview-tile="weather"]')
    ).toHaveAttribute('data-effective-size', 'full');
    await user.click(screen.getByRole('button', { name: 'Переместить «Погода» выше' }));
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.any(Array),
        tiles: expect.objectContaining({ weather: { desktopSize: 'full', allowAutoGrow: true } }),
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent('Раскладка сохранена.');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
  it('updates grow intent and resolved preview in the draft, then saves only intent', async () => {
    const config = normalizeStudentDashboardLayout();
    for (const tile of Object.values(config.tiles)) {
      tile.desktopSize = 'full';
      tile.allowAutoGrow = false;
    }
    config.order = [
      'todayTasks',
      'nextStep',
      ...config.order.filter((key) => key !== 'todayTasks' && key !== 'nextStep'),
    ];
    config.tiles.todayTasks.desktopSize = 'medium';
    config.tiles.nextStep.desktopSize = 'small';
    useSettingsStore.setState({ studentDashboardLayout: config });
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    const toggle = screen.getByRole('checkbox', { name: 'Авторасширение: Следующий шаг' });
    const preview = () =>
      screen
        .getByTestId('dashboard-layout-preview')
        .querySelector('[data-preview-tile="nextStep"]')!;
    expect(preview()).toHaveAttribute('data-effective-size', 'small');
    await user.click(toggle);
    expect(preview()).toHaveAttribute('data-base-size', 'small');
    expect(preview()).toHaveAttribute('data-effective-size', 'medium');
    expect(preview()).toHaveTextContent('Small · 4/12 → Medium · 6/12');
    expect(save).not.toHaveBeenCalled();
    expect(config.tiles.nextStep.allowAutoGrow).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(save.mock.calls[0][0].tiles.nextStep).toEqual({
      desktopSize: 'small',
      allowAutoGrow: true,
    });
    expect(preview()).toHaveAttribute('data-effective-size', 'medium');
  });
  it('disables full-width growth and resets/cancels boolean intent locally', async () => {
    const config = normalizeStudentDashboardLayout({
      version: 1,
      tiles: { weather: { desktopSize: 'full', allowAutoGrow: false } },
    });
    useSettingsStore.setState({ studentDashboardLayout: config });
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    const toggle = () => screen.getByRole('checkbox', { name: 'Авторасширение: Погода' });
    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Плитка уже занимает максимальную ширину')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Восстановить стандартную раскладку' }));
    expect(toggle()).toBeEnabled();
    expect(toggle()).toBeChecked();
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    expect(toggle()).toBeDisabled();
    expect(toggle()).not.toBeChecked();
  });
  it('retains draft after failed save, does not update saved state and can retry', async () => {
    save.mockRejectedValueOnce(new Error('permission-denied'));
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Базовый размер: Погода' }),
      'large'
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
    expect(screen.queryByRole('status')).toBeNull();
    expect(useSettingsStore.getState().studentDashboardLayout).toEqual(
      DEFAULT_STUDENT_DASHBOARD_LAYOUT
    );
    expect(screen.getByRole('combobox', { name: 'Базовый размер: Погода' })).toHaveValue('large');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('status')).toHaveTextContent('Раскладка сохранена.');
  });
  it('Cancel restores saved state and Reset changes only the draft', async () => {
    useSettingsStore.getState().setStudentDashboardLayout({
      version: 1,
      order: ['weather'],
      tiles: { weather: { desktopSize: 'large' } },
    });
    render(<AdminStudentDashboardSettings />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Восстановить стандартную раскладку' }));
    expect(screen.getByRole('combobox', { name: 'Базовый размер: Погода' })).toHaveValue('small');
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')).toEqual(
      resolvedKeys()
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    expect(screen.getByRole('combobox', { name: 'Базовый размер: Погода' })).toHaveValue('large');
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')[0]).toBe(
      'weather'
    );
  });
  it('loads remote saved config but preserves a dirty draft during updates', async () => {
    render(<AdminStudentDashboardSettings />);
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({ version: 1, order: ['weather'] })
    );
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')[0]).toBe(
      'weather'
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Базовый размер: Погода' }),
      'full'
    );
    act(() =>
      useSettingsStore.getState().setStudentDashboardLayout({ version: 1, order: ['countdown'] })
    );
    expect(keys(screen.getByTestId('dashboard-layout-preview'), 'data-preview-tile')[0]).toBe(
      'weather'
    );
    expect(screen.getByRole('combobox', { name: 'Базовый размер: Погода' })).toHaveValue('full');
  });
  it.each(['user', 'instructor'])('does not expose editor to %s', (role) => {
    useProfileStore.setState({ userProfile: { uid: 'nonadmin', role } as UserProfile });
    const { container } = render(<AdminStudentDashboardSettings />);
    expect(container).toBeEmptyDOMElement();
    expect(save).not.toHaveBeenCalled();
  });
  it('disables edits and duplicate submissions while saving', async () => {
    let complete!: () => void;
    save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    render(<AdminStudentDashboardSettings />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Базовый размер: Погода' }),
      'medium'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(
      within(screen.getByRole('group'))
        .getAllByRole('combobox')
        .every((select) => select.matches(':disabled'))
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранение…' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => complete());
  });
});
