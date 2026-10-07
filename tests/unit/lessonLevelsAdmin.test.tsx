import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LESSON_LEVELS } from '@ski-academy/shared-domain';
import { AdminLessonLevelsSettings } from '../../src/features/admin/components/settings/AdminLessonLevelsSettings';
import { useLessonLevelsStore } from '../../src/features/settings/lessonLevelsStore';
import { saveLessonLevels } from '../../src/features/settings/lessonLevelsService';

vi.mock('../../src/features/settings/lessonLevelsService', () => ({ saveLessonLevels: vi.fn() }));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru' }),
}));
vi.mock('../../src/features/admin/components/settings/AdminCollapsibleSection', () => ({
  AdminCollapsibleSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
beforeEach(() => {
  useLessonLevelsStore.setState({
    levels: DEFAULT_LESSON_LEVELS,
    revision: 0,
    loaded: true,
    error: false,
  });
  vi.mocked(saveLessonLevels)
    .mockReset()
    .mockImplementation(async (levels) => {
      useLessonLevelsStore.setState({
        levels: levels as typeof DEFAULT_LESSON_LEVELS,
        revision: useLessonLevelsStore.getState().revision + 1,
      });
    });
});
afterEach(cleanup);
describe('lesson levels admin', () => {
  it('adds a level with a generated immutable ID and edits names without changing ID', async () => {
    render(<AdminLessonLevelsSettings />);
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить уровень' }));
    fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Гонки' } });
    fireEvent.change(screen.getByLabelText('Название EN'), { target: { value: 'Race' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })));
    const added = useLessonLevelsStore.getState().levels.at(-1)!;
    expect(added.id).toMatch(/^level_[a-f0-9]{32}$/);
    const row = screen.getByText('Гонки / Race').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByLabelText('Название RU'), { target: { value: 'Скорость' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })));
    expect(useLessonLevelsStore.getState().levels.at(-1)).toMatchObject({
      id: added.id,
      nameRu: 'Скорость',
    });
  });
  it('persists admin order and safely archives and restores', async () => {
    render(<AdminLessonLevelsSettings />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Выше: Advanced' })));
    expect(useLessonLevelsStore.getState().levels[1].id).toBe('advanced');
    const row = screen.getByText('Продвинутый / Advanced').closest('li')!;
    await act(async () =>
      fireEvent.click(within(row).getByRole('button', { name: 'Архивировать' }))
    );
    expect(
      useLessonLevelsStore.getState().levels.find((level) => level.id === 'advanced')?.isActive
    ).toBe(false);
    await act(async () =>
      fireEvent.click(within(row).getByRole('button', { name: 'Восстановить' }))
    );
    expect(
      useLessonLevelsStore.getState().levels.find((level) => level.id === 'advanced')?.isActive
    ).toBe(true);
  });
  it('protects the last active level and rejects invalid names and marker', async () => {
    useLessonLevelsStore.setState({
      levels: DEFAULT_LESSON_LEVELS.map((level) => ({
        ...level,
        isActive: level.id === 'advanced',
      })),
    });
    render(<AdminLessonLevelsSettings />);
    const row = screen.getByText('Продвинутый / Advanced').closest('li')!;
    expect(within(row).getByRole('button', { name: 'Архивировать' })).toBeDisabled();
    fireEvent.click(within(row).getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByLabelText('Маркер / emoji'), { target: { value: 'bad' } });
    await act(async () =>
      fireEvent.submit(screen.getByRole('button', { name: 'Сохранить' }).closest('form')!)
    );
    expect(saveLessonLevels).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('preserves the same idempotency key for a failed transport retry', async () => {
    vi.mocked(saveLessonLevels).mockRejectedValue(new Error('network'));
    render(<AdminLessonLevelsSettings />);
    const move = screen.getByRole('button', { name: 'Выше: Advanced' });
    await act(async () => fireEvent.click(move));
    await act(async () => fireEvent.click(move));
    expect(vi.mocked(saveLessonLevels).mock.calls[0][2]).toBe(
      vi.mocked(saveLessonLevels).mock.calls[1][2]
    );
  });
});
